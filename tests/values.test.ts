import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isMultipleOf } from "../src/json/decimal.js";
import { assertJsonValue, canonicalKey, codePointLength, jsonEqual, jsonType, setOwn, JsonObject } from "../src/json/values.js";

describe("jsonEqual", () => {
  it("ignores key order but not array order", () => {
    assert.ok(jsonEqual({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 }));
    assert.ok(!jsonEqual([1, 2], [2, 1]));
  });

  it("treats 1 and 1.0 as equal and keeps types apart", () => {
    assert.ok(jsonEqual(1, 1.0));
    assert.ok(!jsonEqual(1, "1"));
    assert.ok(!jsonEqual(0, false));
    assert.ok(!jsonEqual(null, false));
    assert.ok(!jsonEqual([], {}));
  });

  it("notices a missing key even when the counts match", () => {
    assert.ok(!jsonEqual({ a: 1 }, { b: 1 }));
    assert.ok(!jsonEqual({ a: 1 }, { a: 1, b: 2 }));
  });

  it("isn't fooled by inherited names", () => {
    assert.ok(!jsonEqual({ toString: 1 }, { a: 1 }));
  });
});

describe("canonicalKey", () => {
  it("is the same exactly for equal values", () => {
    assert.equal(canonicalKey({ a: 1, b: { c: 2, d: 3 } }), canonicalKey({ b: { d: 3, c: 2 }, a: 1.0 }));
    assert.notEqual(canonicalKey([1, 2]), canonicalKey([2, 1]));
    assert.notEqual(canonicalKey("1"), canonicalKey(1));
    assert.notEqual(canonicalKey(null), canonicalKey("null"));
  });

  it("can't be confused by strings that look like structure", () => {
    assert.notEqual(canonicalKey(["a", "b"]), canonicalKey(['a","b']));
    assert.notEqual(canonicalKey({ a: "1,b:2" }), canonicalKey({ a: "1", b: "2" }));
  });
});

describe("small helpers", () => {
  it("names JSON types", () => {
    assert.equal(jsonType(null), "null");
    assert.equal(jsonType([]), "array");
    assert.equal(jsonType({}), "object");
    assert.equal(jsonType(1.5), "number");
  });

  it("counts code points", () => {
    assert.equal(codePointLength("abc"), 3);
    assert.equal(codePointLength("a\u{1F600}"), 2);
    assert.equal(codePointLength(""), 0);
  });

  it("sets __proto__ as ordinary data", () => {
    const object: JsonObject = {};
    setOwn(object, "__proto__", 5);
    assert.equal(Object.getPrototypeOf(object), Object.prototype);
    assert.deepEqual(Object.keys(object), ["__proto__"]);
    assert.equal(object["__proto__"], 5);
  });
});

describe("assertJsonValue", () => {
  it("accepts what JSON can hold", () => {
    assertJsonValue({ a: [1, "x", null, true, { b: 2 }] });
    assertJsonValue(Object.create(null));
  });

  it("allows the same object twice when it isn't a cycle", () => {
    const shared = { a: 1 };
    assertJsonValue([shared, shared]);
  });

  it("refuses everything else and says where", () => {
    assert.throws(() => assertJsonValue(undefined), /undefined/);
    assert.throws(() => assertJsonValue({ a: [NaN] }), /\/a\/0 is NaN/);
    assert.throws(() => assertJsonValue({ a: Infinity }), /Infinity/);
    assert.throws(() => assertJsonValue({ a: new Date(0) }), /\/a is an instance of Date/);
    assert.throws(() => assertJsonValue(() => 1), /function/);
    assert.throws(() => assertJsonValue(new Map()), /Map/);
  });

  it("refuses cycles", () => {
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    assert.throws(() => assertJsonValue(loop), /\/self refers to itself/);
  });
});

describe("isMultipleOf", () => {
  it("gets the cases binary floats get wrong", () => {
    assert.ok(isMultipleOf(0.3, 0.1));
    assert.ok(isMultipleOf(1.1, 0.1));
    assert.ok(isMultipleOf(4.35, 0.01));
    assert.ok(isMultipleOf(19.99, 0.01));
  });

  it("says no when it should", () => {
    assert.ok(!isMultipleOf(0.35, 0.1));
    assert.ok(!isMultipleOf(7, 2));
    assert.ok(!isMultipleOf(1, 0.3));
  });

  it("handles negatives and zero", () => {
    assert.ok(isMultipleOf(-6, 3));
    assert.ok(isMultipleOf(0, 0.5));
    assert.ok(isMultipleOf(-0.5, 0.25));
    assert.ok(!isMultipleOf(-7, 2));
  });

  it("handles numbers written with exponents", () => {
    assert.ok(isMultipleOf(1e21, 1));
    assert.ok(isMultipleOf(1e-7, 1e-8));
    assert.ok(!isMultipleOf(1e-8, 1e-7));
    assert.ok(isMultipleOf(1e308, 1e-300));
    assert.ok(isMultipleOf(1.5e300, 0.5));
  });
});
