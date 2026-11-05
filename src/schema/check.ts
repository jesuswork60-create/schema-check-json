/** Finds what is wrong with a schema before any data is validated against it. */

import { join, referenceToPointer, resolvePointer } from "../json/pointer.js";
import { hasOwn, isObject, JsonObject, JsonValue } from "../json/values.js";
import { IN_PLACE, KEYWORDS, Rule, TYPE_NAMES, UNSUPPORTED } from "./rules.js";

export interface SchemaIssue {
  /** JSON Pointer to the problem in the schema. */
  path: string;
  message: string;
}

export interface CheckOptions {
  /** Report keywords this library doesn't know, which usually means a typo. */
  strict?: boolean;
}

function isCount(value: JsonValue): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function patternProblem(pattern: string): string | undefined {
  try {
    new RegExp(pattern, "u");
    return undefined;
  } catch (error) {
    return (error as Error).message;
  }
}

class Checker {
  readonly issues: SchemaIssue[] = [];
  private readonly visited = new Set<string>();
  private readonly references: { path: string; pointer: string }[] = [];

  constructor(
    private readonly root: JsonValue,
    private readonly strict: boolean,
  ) {}

  private report(path: string, message: string): void {
    this.issues.push({ path, message });
  }

  run(): void {
    this.schema(this.root, "");
    // Referenced schemas can sit anywhere, even under a keyword nobody knows, so they get checked
    // on arrival. The list can grow while this loop runs.
    for (let i = 0; i < this.references.length; i++) {
      const { path, pointer } = this.references[i];
      const target = resolvePointer(this.root, pointer);
      if (target === undefined) {
        this.report(path, `the reference target #${pointer} doesn't exist`);
      } else {
        this.schema(target, pointer);
      }
    }
    if (this.issues.length === 0) this.findLoops();
  }

  private schema(schema: JsonValue, path: string): void {
    if (this.visited.has(path)) return;
    this.visited.add(path);
    if (typeof schema === "boolean") return;
    if (!isObject(schema)) {
      this.report(path, "a schema must be an object or a boolean");
      return;
    }
    for (const keyword of Object.keys(schema)) {
      const at = join(path, keyword);
      if (UNSUPPORTED.has(keyword)) {
        this.report(at, `${keyword} is not supported`);
      } else if (hasOwn(KEYWORDS, keyword)) {
        this.keyword(keyword, KEYWORDS[keyword], schema[keyword], at);
      } else if (this.strict) {
        this.report(at, `unknown keyword ${keyword}`);
      }
    }
  }

  private keyword(keyword: string, rule: Rule, value: JsonValue, at: string): void {
    const expect = (ok: boolean, what: string): boolean => {
      if (!ok) this.report(at, `${keyword} must be ${what}`);
      return ok;
    };
    switch (rule) {
      case "any":
        break;
      case "boolean":
        expect(typeof value === "boolean", "a boolean");
        break;
      case "string":
        expect(typeof value === "string", "a string");
        break;
      case "number":
        expect(typeof value === "number", "a number");
        break;
      case "positiveNumber":
        expect(typeof value === "number" && value > 0, "a number above zero");
        break;
      case "count":
        expect(isCount(value), "a whole number, zero or more");
        break;
      case "array":
        expect(Array.isArray(value), "an array");
        break;
      case "schema":
        this.schema(value, at);
        break;
      case "schemaList":
        if (expect(Array.isArray(value) && value.length > 0, "a non-empty array of schemas")) {
          (value as JsonValue[]).forEach((item, index) => this.schema(item, join(at, index)));
        }
        break;
      case "schemaMap":
        if (expect(isObject(value), "an object of schemas")) {
          const map = value as JsonObject;
          for (const key of Object.keys(map)) this.schema(map[key], join(at, key));
        }
        break;
      case "patternSchemaMap":
        if (expect(isObject(value), "an object of schemas")) {
          const map = value as JsonObject;
          for (const key of Object.keys(map)) {
            const problem = patternProblem(key);
            if (problem !== undefined) this.report(join(at, key), `bad pattern: ${problem}`);
            this.schema(map[key], join(at, key));
          }
        }
        break;
      case "regex":
        if (expect(typeof value === "string", "a string")) {
          const problem = patternProblem(value as string);
          if (problem !== undefined) this.report(at, `bad pattern: ${problem}`);
        }
        break;
      case "stringList":
        this.stringList(keyword, value, at);
        break;
      case "stringListMap":
        if (expect(isObject(value), "an object of string lists")) {
          const map = value as JsonObject;
          for (const key of Object.keys(map)) this.stringList(keyword, map[key], join(at, key));
        }
        break;
      case "type":
        this.typeKeyword(value, at);
        break;
      case "reference":
        this.reference(value, at);
        break;
    }
  }

  private stringList(keyword: string, value: JsonValue, at: string): void {
    if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
      this.report(at, `${keyword} must be an array of strings`);
    } else if (new Set(value).size !== value.length) {
      this.report(at, `${keyword} repeats a name`);
    }
  }

  private typeKeyword(value: JsonValue, at: string): void {
    const names = Array.isArray(value) ? value : [value];
    if (names.length === 0) this.report(at, "type must name at least one type");
    for (const name of names) {
      if (typeof name !== "string" || !TYPE_NAMES.has(name)) {
        this.report(at, `unknown type ${JSON.stringify(name)}`);
      }
    }
    if (new Set(names).size !== names.length) this.report(at, "type repeats a name");
  }

  private reference(value: JsonValue, at: string): void {
    if (typeof value !== "string") {
      this.report(at, "$ref must be a string");
      return;
    }
    const pointer = referenceToPointer(value);
    if (pointer === undefined) {
      this.report(at, `only references inside this document are supported, not ${JSON.stringify(value)}`);
      return;
    }
    this.references.push({ path: at, pointer });
  }

  /**
   * A chain of references that comes back to where it started without moving on to a smaller part
   * of the data would never end at validation time. Going through properties or items is fine,
   * since the data runs out, so only same-value keywords and $ref count as steps.
   */
  private findLoops(): void {
    const done = new Set<string>();
    const stack: string[] = [];
    const visit = (schema: JsonValue, path: string): void => {
      const start = stack.indexOf(path);
      if (start !== -1) {
        const chain = [...stack.slice(start), path].map((step) => `#${step}`).join(" -> ");
        this.report(path, `reference loop: ${chain}`);
        return;
      }
      if (done.has(path) || !isObject(schema)) return;
      stack.push(path);
      for (const [step, target] of this.inPlaceSteps(schema, path)) visit(target, step);
      stack.pop();
      done.add(path);
    };
    visit(this.root, "");
    for (const pointer of this.visited) {
      if (!done.has(pointer)) visit(resolvePointer(this.root, pointer) as JsonValue, pointer);
    }
  }

  private inPlaceSteps(schema: JsonObject, path: string): [string, JsonValue][] {
    const steps: [string, JsonValue][] = [];
    if (typeof schema.$ref === "string") {
      const pointer = referenceToPointer(schema.$ref) as string;
      steps.push([pointer, resolvePointer(this.root, pointer) as JsonValue]);
    }
    for (const keyword of IN_PLACE) {
      if (!hasOwn(schema, keyword)) continue;
      const value = schema[keyword];
      const at = join(path, keyword);
      if (Array.isArray(value)) {
        value.forEach((item, index) => steps.push([join(at, index), item]));
      } else if (keyword === "dependentSchemas" && isObject(value)) {
        for (const key of Object.keys(value)) steps.push([join(at, key), value[key]]);
      } else {
        steps.push([at, value]);
      }
    }
    return steps;
  }
}

/** Returns every problem found. An empty list means the schema can be compiled. */
export function checkSchema(schema: JsonValue, options: CheckOptions = {}): SchemaIssue[] {
  const checker = new Checker(schema, options.strict ?? false);
  checker.run();
  return checker.issues;
}
