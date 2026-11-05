import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { JsonSyntaxError, parseJson } from "../src/json/parser.js";

function fails(text: string, line: number, column: number, fragment: RegExp): void {
  assert.throws(
    () => parseJson(text),
    (error: unknown) => {
      assert.ok(error instanceof JsonSyntaxError, String(error));
      assert.equal(error.line, line, error.message);
      assert.equal(error.column, column, error.message);
      assert.match(error.message, fragment);
      return true;
    },
  );
}

describe("parseJson values", () => {
  it("agrees with JSON.parse on a mixed document", () => {
    const text = '{"a": [1, -2.5, 1e3, true, false, null, "x\\n\\u0041\\\\"], "b": {"c": {}, "d": []}, "": 0}';
    assert.deepEqual(parseJson(text).value, JSON.parse(text));
  });

  it("reads each number form", () => {
    assert.equal(parseJson("0").value, 0);
    assert.equal(parseJson("-0.5").value, -0.5);
    assert.equal(parseJson("1E+2").value, 100);
    assert.equal(parseJson("2e-1").value, 0.2);
  });

  it("joins surrogate pairs and all simple escapes", () => {
    assert.equal(parseJson('"\\ud83d\\ude00"').value, "\u{1F600}");
    assert.equal(parseJson('"\\"\\\\\\/\\b\\f\\n\\r\\t"').value, '"\\/\b\f\n\r\t');
  });

  it("skips a byte order mark and surrounding space", () => {
    assert.deepEqual(parseJson("\ufeff \n[1]\t\r\n").value, [1]);
  });

  it("keeps a __proto__ key as data", () => {
    const value = parseJson('{"__proto__": {"x": 1}}').value as Record<string, unknown>;
    assert.equal(Object.getPrototypeOf(value), Object.prototype);
    assert.deepEqual(Object.keys(value), ["__proto__"]);
  });
});

describe("parseJson errors", () => {
  it("gives the place of the problem", () => {
    fails("[1,\n 2,\n x]", 3, 2, /expected a JSON value/);
    fails('{"a" 1}', 1, 6, /expected :/);
    fails("{a: 1}", 1, 2, /quoted key/);
    fails("[1 2]", 1, 4, /expected , or \]/);
    fails('{"a": 1 "b": 2}', 1, 9, /expected , or \}/);
  });

  it("refuses what JSON leaves out", () => {
    fails("[1,]", 1, 4, /JSON value/);
    fails('{"a":1,}', 1, 8, /quoted key/);
    fails("01", 1, 2, /after the JSON value/);
    fails(".5", 1, 1, /JSON value/);
    fails("1.", 1, 2, /after the JSON value/);
    fails("+1", 1, 1, /JSON value/);
    fails("NaN", 1, 1, /JSON value/);
    fails("tru", 1, 1, /JSON value/);
    fails("'a'", 1, 1, /JSON value/);
    fails("// note\n1", 1, 1, /JSON value/);
  });

  it("refuses broken strings", () => {
    fails('"abc', 1, 1, /unterminated/);
    fails('"a\nb"', 1, 3, /control characters/);
    fails('"\\x"', 1, 2, /bad escape/);
    fails('"\\u12"', 1, 2, /bad \\u/);
    fails('"\\u12G4"', 1, 2, /bad \\u/);
    fails('"\\', 1, 2, /bad escape/);
  });

  it("reports truncated input", () => {
    fails("", 1, 1, /end of input/);
    fails("   ", 1, 4, /end of input/);
    fails("[1", 1, 3, /unterminated array/);
    fails('{"a":1', 1, 7, /unterminated object/);
    fails('{"a":', 1, 6, /end of input/);
  });

  it("refuses numbers past the range of a double", () => {
    fails("1e999", 1, 1, /out of range/);
  });

  it("limits nesting instead of overflowing the stack", () => {
    assert.throws(() => parseJson("[".repeat(200000)), /nested more than 512/);
    assert.throws(() => parseJson("[[[1]]]", { maxDepth: 1 }), /nested more than 1 /);
    assert.deepEqual(parseJson("[[1]]", { maxDepth: 2 }).value, [[1]]);
  });
});

describe("parseJson positions", () => {
  const text = '{\n  "a": [\n    1,\n    {"b/c": "x"}\n  ],\n  "d": null\n}\n';
  const document = parseJson(text);

  it("locates values by pointer", () => {
    assert.deepEqual(document.locate(""), { line: 1, column: 1 });
    assert.deepEqual(document.locate("/a"), { line: 2, column: 8 });
    assert.deepEqual(document.locate("/a/0"), { line: 3, column: 5 });
    assert.deepEqual(document.locate("/a/1/b~1c"), { line: 4, column: 13 });
    assert.deepEqual(document.locate("/d"), { line: 6, column: 8 });
  });

  it("finds nothing for pointers that aren't there", () => {
    assert.equal(document.locate("/missing"), undefined);
    assert.equal(document.locate("/a/2"), undefined);
  });
});

describe("parseJson duplicates", () => {
  it("lets the last key win and records the repeat", () => {
    const document = parseJson('{"a": 1,\n "a": 2, "b": {"c": 1, "c": 3}}');
    assert.deepEqual(document.value, { a: 2, b: { c: 3 } });
    assert.deepEqual(document.duplicates, [
      { pointer: "/a", position: { line: 2, column: 2 } },
      { pointer: "/b/c", position: { line: 2, column: 24 } },
    ]);
  });

  it("doesn't call the same key in different objects a repeat", () => {
    assert.deepEqual(parseJson('[{"a":1},{"a":2}]').duplicates, []);
  });
});
