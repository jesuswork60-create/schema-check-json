/**
 * A strict JSON parser that remembers where each value sits in the text, so errors in a data file
 * can name a line and column. JSON.parse can't report that, and hides duplicate keys as well.
 */

import { join } from "./pointer.js";
import { JsonObject, JsonValue, setOwn } from "./values.js";

export class JsonSyntaxError extends Error {
  constructor(
    message: string,
    readonly line: number,
    readonly column: number,
    readonly offset: number,
  ) {
    super(`line ${line}, column ${column}: ${message}`);
    this.name = "JsonSyntaxError";
  }
}

export interface Position {
  /** Counted from 1. */
  line: number;
  /** Counted from 1, in UTF-16 units as JavaScript strings are. */
  column: number;
}

export interface ParsedDocument {
  value: JsonValue;
  /** Where the value at a pointer starts, or undefined if there is no such value. */
  locate(pointer: string): Position | undefined;
  /** Keys that appeared more than once in an object. The last one wins, as in JSON.parse. */
  duplicates: { pointer: string; position: Position }[];
}

export interface ParseOptions {
  maxDepth?: number;
}

const DEFAULT_MAX_DEPTH = 512;
const NUMBER = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
const ESCAPES: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };

class Parser {
  at = 0;
  readonly offsets = new Map<string, number>();
  readonly duplicates: { pointer: string; offset: number }[] = [];
  private readonly lineStarts: number[] = [0];

  constructor(
    readonly text: string,
    readonly maxDepth: number,
  ) {
    for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) {
      this.lineStarts.push(i + 1);
    }
  }

  position(offset: number): Position {
    let low = 0;
    let high = this.lineStarts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (this.lineStarts[middle] <= offset) low = middle;
      else high = middle - 1;
    }
    return { line: low + 1, column: offset - this.lineStarts[low] + 1 };
  }

  fail(message: string, offset = this.at): never {
    const { line, column } = this.position(offset);
    throw new JsonSyntaxError(message, line, column, offset);
  }

  skipSpace(): void {
    for (;;) {
      const code = this.text.charCodeAt(this.at);
      if (code === 0x20 || code === 0x0a || code === 0x0d || code === 0x09) this.at++;
      else return;
    }
  }

  document(): JsonValue {
    if (this.text.charCodeAt(0) === 0xfeff) this.at = 1;
    this.skipSpace();
    const value = this.value("", 0);
    this.skipSpace();
    if (this.at < this.text.length) this.fail("unexpected text after the JSON value");
    return value;
  }

  value(pointer: string, depth: number): JsonValue {
    if (depth > this.maxDepth) this.fail(`nested more than ${this.maxDepth} levels deep`);
    this.offsets.set(pointer, this.at);
    const char = this.text[this.at];
    switch (char) {
      case "{":
        return this.object(pointer, depth);
      case "[":
        return this.array(pointer, depth);
      case '"':
        return this.string();
      case "t":
        return this.word("true", true);
      case "f":
        return this.word("false", false);
      case "n":
        return this.word("null", null);
      case undefined:
        return this.fail("unexpected end of input");
      default:
        return this.number();
    }
  }

  word<T extends JsonValue>(word: string, value: T): T {
    if (!this.text.startsWith(word, this.at)) this.fail("expected a JSON value");
    this.at += word.length;
    return value;
  }

  number(): number {
    NUMBER.lastIndex = this.at;
    const match = NUMBER.exec(this.text);
    if (match === null) this.fail("expected a JSON value");
    const value = Number(match[0]);
    if (!Number.isFinite(value)) this.fail(`the number ${match[0]} is out of range`);
    this.at += match[0].length;
    return value;
  }

  string(): string {
    const start = this.at;
    this.at++;
    let result = "";
    let runStart = this.at;
    for (;;) {
      const code = this.text.charCodeAt(this.at);
      if (Number.isNaN(code)) this.fail("unterminated string", start);
      if (code === 0x22) {
        result += this.text.slice(runStart, this.at);
        this.at++;
        return result;
      }
      if (code < 0x20) this.fail("control characters must be escaped in strings");
      if (code === 0x5c) {
        result += this.text.slice(runStart, this.at);
        result += this.escape();
        runStart = this.at;
      } else {
        this.at++;
      }
    }
  }

  escape(): string {
    const start = this.at;
    const char = this.text[this.at + 1];
    if (char === "u") {
      const hex = this.text.slice(this.at + 2, this.at + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail("bad \\u escape", start);
      this.at += 6;
      return String.fromCharCode(parseInt(hex, 16));
    }
    if (char === undefined || !Object.prototype.hasOwnProperty.call(ESCAPES, char)) {
      this.fail("bad escape in string", start);
    }
    this.at += 2;
    return ESCAPES[char];
  }

  array(pointer: string, depth: number): JsonValue[] {
    this.at++;
    const items: JsonValue[] = [];
    this.skipSpace();
    if (this.text[this.at] === "]") {
      this.at++;
      return items;
    }
    for (;;) {
      this.skipSpace();
      items.push(this.value(join(pointer, items.length), depth + 1));
      this.skipSpace();
      const char = this.text[this.at];
      this.at++;
      if (char === "]") return items;
      if (char !== ",") this.fail(char === undefined ? "unterminated array" : "expected , or ]", this.at - 1);
    }
  }

  object(pointer: string, depth: number): JsonObject {
    this.at++;
    const object: JsonObject = {};
    const seen = new Set<string>();
    this.skipSpace();
    if (this.text[this.at] === "}") {
      this.at++;
      return object;
    }
    for (;;) {
      this.skipSpace();
      if (this.text[this.at] !== '"') this.fail("expected a quoted key");
      const keyOffset = this.at;
      const key = this.string();
      const child = join(pointer, key);
      if (seen.has(key)) this.duplicates.push({ pointer: child, offset: keyOffset });
      seen.add(key);
      this.skipSpace();
      if (this.text[this.at] !== ":") this.fail("expected : after the key");
      this.at++;
      this.skipSpace();
      setOwn(object, key, this.value(child, depth + 1));
      this.skipSpace();
      const char = this.text[this.at];
      this.at++;
      if (char === "}") return object;
      if (char !== ",") this.fail(char === undefined ? "unterminated object" : "expected , or }", this.at - 1);
    }
  }
}

export function parseJson(text: string, options: ParseOptions = {}): ParsedDocument {
  const parser = new Parser(text, options.maxDepth ?? DEFAULT_MAX_DEPTH);
  const value = parser.document();
  return {
    value,
    locate(pointer) {
      const offset = parser.offsets.get(pointer);
      return offset === undefined ? undefined : parser.position(offset);
    },
    duplicates: parser.duplicates.map(({ pointer, offset }) => ({ pointer, position: parser.position(offset) })),
  };
}
