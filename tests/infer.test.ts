import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { inferSchema, InferOptions } from "../src/infer.js";
import { JsonValue } from "../src/json/values.js";
import { Validator } from "../src/validator.js";

function shape(samples: JsonValue[], options?: InferOptions): Record<string, JsonValue> {
  const { $schema: _dialect, ...rest } = inferSchema(samples, options);
  return rest;
}

describe("inferSchema", () => {
  it("names the dialect and accepts anything with no samples", () => {
    const schema = inferSchema([]);
    assert.match(schema.$schema as string, /2020-12/);
    assert.ok(new Validator(schema).isValid(1));
  });

  it("reads scalar types", () => {
    assert.deepEqual(shape([1]), { type: "integer" });
    assert.deepEqual(shape([1.5]), { type: "number" });
    assert.deepEqual(shape([true]), { type: "boolean" });
    assert.deepEqual(shape([null]), { type: "null" });
    assert.deepEqual(shape(["x"]), { type: "string" });
  });

  it("widens integers to number and lists mixed types in a fixed order", () => {
    assert.deepEqual(shape([1, 1.5]), { type: "number" });
    assert.deepEqual(shape(["x", 1, null]), { type: ["null", "integer", "string"] });
  });

  it("merges object samples and requires only what all had", () => {
    assert.deepEqual(shape([{ a: 1, b: "x" }, { a: 2 }]), {
      type: "object",
      properties: { a: { type: "integer" }, b: { type: "string" } },
      required: ["a"],
    });
  });

  it("doesn't require a key that was seen only as often as another object's", () => {
    // Two samples, and x occurs once in each of two inner objects of a single sample's array.
    const schema = shape([{ list: [{ x: 1 }, {}] }]);
    assert.deepEqual(schema.properties, { list: { type: "array", items: { type: "object", properties: { x: { type: "integer" } } } } });
  });

  it("merges array items", () => {
    assert.deepEqual(shape([[1, "a"], [null]]), { type: "array", items: { type: ["null", "integer", "string"] } });
    assert.deepEqual(shape([[]]), { type: "array" });
  });

  it("describes an empty object", () => {
    assert.deepEqual(shape([{}]), { type: "object" });
  });

  it("finds a format all strings share and picks the first candidate that fits", () => {
    assert.equal(shape(["2024-01-02", "2024-03-04"]).format, "date");
    assert.equal(shape(["2024-01-02T00:00:00Z"]).format, "date-time");
    assert.equal(shape(["alpha@example.com"]).format, "email");
    assert.equal(shape(["2024-01-02", "soon"]).format, undefined);
    assert.equal(shape(["2024-01-02"], { detectFormats: false }).format, undefined);
  });

  it("writes an enum only when values repeat within the limit", () => {
    const repeats = ["a", "b", "a", "b"];
    assert.deepEqual(shape(repeats, { enumLimit: 2 }).enum, ["a", "b"]);
    assert.equal(shape(repeats, { enumLimit: 1 }).enum, undefined);
    assert.equal(shape(repeats).enum, undefined);
    assert.equal(shape(["a", "b", "c"], { enumLimit: 5 }).enum, undefined);
    assert.deepEqual(shape(["a", "b", "c"], { enumLimit: 5, enumMinRepeats: 1 }).enum, ["a", "b", "c"]);
  });

  it("leaves out the enum when other types are mixed in", () => {
    assert.equal(shape(["a", "a", 1], { enumLimit: 5 }).enum, undefined);
  });

  it("records ranges on request", () => {
    assert.deepEqual(shape([3, -1, 7], { ranges: true }), { type: "integer", minimum: -1, maximum: 7 });
    assert.deepEqual(shape(["a"], { ranges: true }), { type: "string" });
  });

  it("closes objects on request", () => {
    const schema = inferSchema([{ a: { b: 1 } }], { closed: true });
    const validator = new Validator(schema);
    assert.ok(validator.isValid({ a: { b: 2 } }));
    assert.ok(!validator.isValid({ a: { b: 2 }, c: 1 }));
    assert.ok(!validator.isValid({ a: { b: 2, c: 1 } }));
  });

  it("keeps a __proto__ key as a property", () => {
    const sample = JSON.parse('{"__proto__": 1}');
    const schema = inferSchema([sample], { closed: true });
    const validator = new Validator(schema);
    assert.ok(validator.isValid(sample));
    assert.ok(!validator.isValid({}));
  });

  it("always produces a schema that accepts its samples", () => {
    const samples: JsonValue[] = [
      { id: 1, when: "2024-01-02", tags: ["a", "a"], nested: { x: null, y: [1, 2.5, "s", { z: true }] } },
      { id: 2.5, when: "soon", tags: [], nested: { x: 1 }, extra: {} },
      [],
      "text",
      null,
      { id: "three", nested: [] },
    ];
    for (const options of [{}, { enumLimit: 3 }, { ranges: true }, { closed: true }, { enumLimit: 2, enumMinRepeats: 1, ranges: true, closed: true }]) {
      const validator = new Validator(inferSchema(samples, options));
      for (const sample of samples) {
        assert.ok(validator.isValid(sample), `${JSON.stringify(options)} refused ${JSON.stringify(sample)}`);
      }
    }
  });
});
