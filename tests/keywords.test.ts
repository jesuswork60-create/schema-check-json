import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { errorsOf, isValid } from "./helpers.js";

function check(schema: unknown, good: unknown[], bad: unknown[]): void {
  for (const value of good) assert.ok(isValid(schema, value), `should accept ${JSON.stringify(value)}`);
  for (const value of bad) assert.ok(!isValid(schema, value), `should refuse ${JSON.stringify(value)}`);
}

describe("boolean schemas", () => {
  it("true accepts and false refuses everything", () => {
    check(true, [1, null, {}, []], []);
    check(false, [], [1, null, {}, []]);
  });

  it("an empty schema accepts everything", () => {
    check({}, [1, "a", null, [], {}], []);
  });

  it("false reports where it sits in the schema", () => {
    const [error] = errorsOf({ properties: { a: false } }, { a: 1 });
    assert.equal(error.instancePath, "/a");
    assert.equal(error.schemaPath, "/properties/a");
    assert.equal(error.keyword, "false schema");
  });
});

describe("type", () => {
  it("knows integers by value and not by spelling", () => {
    check({ type: "integer" }, [1, 1.0, -3, 0, 1e3], [1.5, "1", true, null]);
  });

  it("keeps booleans apart from numbers", () => {
    check({ type: "number" }, [1, 1.5], [true, false, "1"]);
    check({ type: "boolean" }, [true, false], [0, 1, "true"]);
  });

  it("takes a list", () => {
    check({ type: ["string", "null"] }, ["a", null], [1, []]);
  });

  it("tells arrays, objects and null apart", () => {
    check({ type: "array" }, [[]], [{}, null]);
    check({ type: "object" }, [{}], [[], null]);
    check({ type: "null" }, [null], [0, false, "", [], {}]);
  });

  it("says what it wanted and found", () => {
    const [error] = errorsOf({ type: ["string", "null"] }, 1);
    assert.equal(error.message, "must be string or null, not number");
    assert.deepEqual(error.params, { expected: ["string", "null"], actual: "number" });
  });
});

describe("enum and const", () => {
  it("compare as JSON", () => {
    check({ enum: [1, "a", null, [1, { b: 2 }]] }, [1, 1.0, "a", null, [1, { b: 2 }]], [2, "1", false, [1], [{ b: 2 }, 1]]);
    check({ const: { a: 1, b: 2 } }, [{ b: 2, a: 1 }], [{ a: 1 }, { a: 1, b: 3 }]);
    check({ const: null }, [null], [0, false]);
    check({ const: false }, [false], [0, null, ""]);
  });

  it("an empty enum accepts nothing", () => {
    check({ enum: [] }, [], [1, null]);
  });

  it("shortens long values in messages", () => {
    const [error] = errorsOf({ const: "x".repeat(100) }, "y");
    assert.ok(error.message.length < 80, error.message);
    assert.ok(error.message.endsWith("..."));
    assert.equal(error.params.expected, "x".repeat(100));
  });
});

describe("number keywords", () => {
  it("apply their limits, inclusive or not", () => {
    check({ minimum: 2 }, [2, 3], [1.99]);
    check({ maximum: 2 }, [2, 1], [2.01]);
    check({ exclusiveMinimum: 2 }, [2.01], [2]);
    check({ exclusiveMaximum: 2 }, [1.99], [2]);
  });

  it("use exact multiples", () => {
    check({ multipleOf: 0.1 }, [0.3, 1.1, 0, -0.7], [0.35]);
    check({ multipleOf: 0.01 }, [4.35, 19.99], [4.355]);
    check({ multipleOf: 3 }, [9, -9], [10]);
  });

  it("ignore other types", () => {
    check({ minimum: 2, maximum: 3, multipleOf: 2 }, ["a", null, [], {}, true], []);
  });
});

describe("string keywords", () => {
  it("count code points", () => {
    check({ minLength: 2 }, ["ab", "\u{1F600}\u{1F600}"], ["a", "\u{1F600}", ""]);
    check({ maxLength: 2 }, ["ab", "\u{1F600}\u{1F600}"], ["abc", "\u{1F600}\u{1F600}a"]);
  });

  it("match patterns anywhere unless anchored", () => {
    check({ pattern: "b+" }, ["abbc"], ["ac"]);
    check({ pattern: "^b+$" }, ["bb"], ["abb"]);
  });

  it("read patterns as unicode", () => {
    check({ pattern: "^.$" }, ["\u{1F600}"], ["ab"]);
    check({ pattern: "^\\p{Lu}$" }, ["É"], ["é"]);
  });

  it("ignore other types", () => {
    check({ minLength: 5, pattern: "^x$" }, [1, null, [], {}], []);
  });
});

describe("format", () => {
  it("is checked by default", () => {
    check({ format: "date" }, ["2024-02-29", 12], ["2023-02-29"]);
  });

  it("can be turned off", () => {
    assert.ok(isValid({ format: "date" }, "nope", { checkFormats: false }));
  });

  it("passes names nobody registered", () => {
    assert.ok(isValid({ format: "shoe-size" }, "nope"));
    assert.ok(isValid({ format: "constructor" }, "nope"));
    assert.ok(isValid({ format: "__proto__" }, "nope"));
  });

  it("takes custom checks that can replace standard ones", () => {
    const formats = { even: (text: string) => text.length % 2 === 0, date: () => true };
    assert.ok(isValid({ format: "even" }, "ab", { formats }));
    assert.ok(!isValid({ format: "even" }, "abc", { formats }));
    assert.ok(isValid({ format: "date" }, "nope", { formats }));
  });
});

describe("array keywords", () => {
  it("items covers everything without prefixItems", () => {
    check({ items: { type: "number" } }, [[], [1, 2]], [[1, "a"]]);
    check({ items: false }, [[]], [[1]]);
  });

  it("items covers only what prefixItems leaves", () => {
    const schema = { prefixItems: [{ type: "string" }, { type: "number" }], items: { type: "boolean" } };
    check(schema, [[], ["a"], ["a", 1], ["a", 1, true, false]], [[1], ["a", "b"], ["a", 1, 2]]);
  });

  it("prefixItems alone leaves the rest free, whatever the keyword order", () => {
    check({ prefixItems: [{ type: "string" }] }, [["a", 1, null]], [[1]]);
    check({ items: false, prefixItems: [true] }, [[1]], [[1, 2]]);
  });

  it("names the failing index", () => {
    const errors = errorsOf({ prefixItems: [true], items: { type: "string" } }, [0, "a", 1]);
    assert.deepEqual(errors.map((error) => error.instancePath), ["/2"]);
    assert.equal(errors[0].schemaPath, "/items/type");
  });

  it("size limits", () => {
    check({ minItems: 1, maxItems: 2 }, [[1], [1, 2]], [[], [1, 2, 3]]);
  });

  it("uniqueItems compares as JSON", () => {
    check({ uniqueItems: true }, [[1, "1", true], [[1], [2]], [{ a: 1 }, { a: 2 }], [0, false], [null, 0]], [[1, 1.0], [{ a: 1, b: 2 }, { b: 2, a: 1 }], [[1, [2]], [1, [2]]]]);
    check({ uniqueItems: false }, [[1, 1]], []);
  });

  it("uniqueItems points at the two items", () => {
    const [error] = errorsOf({ uniqueItems: true }, ["a", "b", "a"]);
    assert.deepEqual(error.params, { first: 0, second: 2 });
  });

  it("contains needs one match by default", () => {
    check({ contains: { type: "string" } }, [["a"], [1, "a"]], [[], [1, 2]]);
  });

  it("minContains and maxContains shift the count", () => {
    const schema = { contains: { const: 1 }, minContains: 2, maxContains: 3 };
    check(schema, [[1, 1], [1, 2, 1, 1]], [[1], [1, 1, 1, 1], []]);
    check({ contains: { const: 1 }, minContains: 0 }, [[], [2]], []);
    check({ contains: { const: 1 }, minContains: 0, maxContains: 1 }, [[], [1]], [[1, 1]]);
  });

  it("minContains and maxContains do nothing alone", () => {
    check({ minContains: 3, maxContains: 0 }, [[], [1]], []);
  });

  it("all ignore other types", () => {
    check({ items: false, minItems: 2, uniqueItems: true, contains: false }, ["a", 1, {}, null], []);
  });
});

describe("object keywords", () => {
  it("properties checks only what is present", () => {
    check({ properties: { a: { type: "number" } } }, [{}, { a: 1 }, { b: "x" }], [{ a: "x" }]);
  });

  it("properties isn't fooled by inherited names", () => {
    check({ properties: { toString: { type: "number" } } }, [{}], [{ toString: "x" }]);
    check({ required: ["toString"] }, [{ toString: 1 }], [{}]);
  });

  it("required lists every missing name", () => {
    const errors = errorsOf({ required: ["a", "b", "c"] }, { b: 1 });
    assert.deepEqual(errors.map((error) => error.params.property), ["a", "c"]);
    assert.equal(errors[0].instancePath, "");
  });

  it("a null value counts as present", () => {
    check({ required: ["a"] }, [{ a: null }], [{}]);
  });

  it("patternProperties applies every match", () => {
    const schema = { patternProperties: { "^a": { type: "number" }, "z$": { minimum: 5 } } };
    check(schema, [{ b: "x" }, { ab: 1 }, { az: 6 }], [{ ab: "x" }, { az: 1 }, { bz: 1 }]);
  });

  it("additionalProperties skips named and patterned keys", () => {
    const schema = { properties: { a: true }, patternProperties: { "^x-": true }, additionalProperties: { type: "number" } };
    check(schema, [{ a: "s", "x-y": "s", b: 1 }], [{ b: "s" }]);
  });

  it("additionalProperties false names each extra key", () => {
    const errors = errorsOf({ properties: { a: true }, additionalProperties: false }, { a: 1, b: 2, c: 3 });
    assert.deepEqual(errors.map((error) => error.instancePath), ["/b", "/c"]);
    assert.equal(errors[0].keyword, "additionalProperties");
  });

  it("additionalProperties only sees its own schema object", () => {
    const schema = { allOf: [{ properties: { a: true } }], additionalProperties: false };
    check(schema, [{}], [{ a: 1 }]);
  });

  it("propertyNames checks keys", () => {
    check({ propertyNames: { maxLength: 2 } }, [{}, { ab: 1 }], [{ abc: 1 }]);
    const [error] = errorsOf({ propertyNames: { pattern: "^a" } }, { b: 1 });
    assert.equal(error.keyword, "propertyNames");
    assert.equal(error.params.property, "b");
    assert.match(error.message, /"b"/);
  });

  it("size limits", () => {
    check({ minProperties: 1, maxProperties: 2 }, [{ a: 1 }, { a: 1, b: 2 }], [{}, { a: 1, b: 2, c: 3 }]);
  });

  it("dependentRequired", () => {
    const schema = { dependentRequired: { card: ["cvv", "expiry"] } };
    check(schema, [{}, { cvv: 1 }, { card: 1, cvv: 1, expiry: 1 }], [{ card: 1 }, { card: 1, cvv: 1 }]);
    assert.equal(errorsOf(schema, { card: 1 }).length, 2);
  });

  it("dependentSchemas", () => {
    const schema = { dependentSchemas: { card: { required: ["cvv"], properties: { cvv: { type: "number" } } } } };
    check(schema, [{}, { cvv: "x" }, { card: 1, cvv: 1 }], [{ card: 1 }, { card: 1, cvv: "x" }]);
  });

  it("handle a key called __proto__ as data", () => {
    const value = JSON.parse('{"__proto__": 1}');
    check({ properties: { ["__proto__"]: { type: "string" } } }, [{}], []);
    assert.ok(!isValid({ additionalProperties: false }, value));
    assert.ok(isValid({ required: ["__proto__"] }, value));
    assert.ok(!isValid({ required: ["__proto__"] }, {}));
    const schema = JSON.parse('{"properties": {"__proto__": {"type": "string"}}}');
    assert.ok(!isValid(schema, value));
    assert.ok(isValid(schema, JSON.parse('{"__proto__": "s"}')));
  });

  it("all ignore other types", () => {
    check({ properties: { a: false }, required: ["a"], additionalProperties: false, minProperties: 1 }, [[], "a", 1, null], []);
  });
});

describe("combining keywords", () => {
  it("allOf collects from each", () => {
    const errors = errorsOf({ allOf: [{ type: "string" }, { minimum: 1 }, { const: "a" }] }, 0);
    assert.deepEqual(errors.map((error) => error.schemaPath), ["/allOf/0/type", "/allOf/1/minimum", "/allOf/2/const"]);
  });

  it("anyOf needs one and keeps what went wrong in each", () => {
    const schema = { anyOf: [{ type: "string" }, { minimum: 5 }] };
    check(schema, ["a", 6], [1]);
    const [error] = errorsOf(schema, 1);
    assert.equal(error.keyword, "anyOf");
    assert.deepEqual(error.branches?.map((branch) => branch[0].keyword), ["type", "minimum"]);
  });

  it("oneOf needs exactly one", () => {
    const schema = { oneOf: [{ multipleOf: 2 }, { multipleOf: 3 }] };
    check(schema, [2, 3, 4, 9], [1, 6]);
    const [none] = errorsOf(schema, 1);
    assert.equal(none.branches?.length, 2);
    assert.match(none.message, /matches none/);
    const [both] = errorsOf(schema, 6);
    assert.equal(both.branches, undefined);
    assert.deepEqual(both.params, { passing: [0, 1] });
    assert.match(both.message, /matches 1 and 2/);
  });

  it("not", () => {
    check({ not: { type: "string" } }, [1, null], ["a"]);
    check({ not: true }, [], [1]);
    check({ not: false }, [1], []);
  });

  it("if picks then or else", () => {
    const schema = { if: { type: "number" }, then: { minimum: 5 }, else: { maxLength: 1 } };
    check(schema, [6, "a"], [1, "ab"]);
  });

  it("if without a matching branch passes", () => {
    check({ if: { type: "number" }, then: { minimum: 5 } }, [6, "abc"], [1]);
    check({ if: { type: "number" }, else: { type: "null" } }, [1, null], ["a"]);
    check({ if: true }, [1], []);
  });

  it("then and else do nothing without if", () => {
    check({ then: false, else: false }, [1], []);
  });

  it("if's own failures aren't reported", () => {
    const errors = errorsOf({ if: { type: "number" }, then: { minimum: 5 }, else: false }, 1);
    assert.deepEqual(errors.map((error) => error.schemaPath), ["/then/minimum"]);
  });

  it("nested paths stay exact", () => {
    const schema = { properties: { a: { items: { properties: { "b/c": { type: "string" } } } } } };
    const [error] = errorsOf(schema, { a: [{}, { "b/c": 1 }] });
    assert.equal(error.instancePath, "/a/1/b~1c");
    assert.equal(error.schemaPath, "/properties/a/items/properties/b~1c/type");
  });
});

describe("references", () => {
  it("follow local pointers", () => {
    const schema = { $defs: { n: { type: "number" } }, properties: { a: { $ref: "#/$defs/n" } } };
    check(schema, [{ a: 1 }], [{ a: "x" }]);
    assert.equal(errorsOf(schema, { a: "x" })[0].schemaPath, "/$defs/n/type");
  });

  it("decode escapes in the reference", () => {
    const schema = { $defs: { "a/b": { type: "number" }, "c d": { type: "string" }, "e~f": { type: "null" } }, prefixItems: [{ $ref: "#/$defs/a~1b" }, { $ref: "#/$defs/c%20d" }, { $ref: "#/$defs/e~0f" }] };
    check(schema, [[1, "s", null]], [["s"], [1, 1], [1, "s", 1]]);
  });

  it("can point anywhere in the document", () => {
    const schema = { properties: { a: { type: "number" }, b: { $ref: "#/properties/a" } } };
    check(schema, [{ b: 1 }], [{ b: "x" }]);
    check({ prefixItems: [{ type: "string" }, { $ref: "#/prefixItems/0" }] }, [["a", "b"]], [["a", 1]]);
    check({ custom: { type: "null" }, items: { $ref: "#/custom" } }, [[null]], [[1]]);
  });

  it("support recursive data", () => {
    const tree = { type: "object", required: ["value"], properties: { value: { type: "number" }, children: { type: "array", items: { $ref: "#" } } } };
    check(tree, [{ value: 1 }, { value: 1, children: [{ value: 2, children: [{ value: 3 }] }] }], [{ value: 1, children: [{ value: 2, children: [{}] }] }]);
    const [error] = errorsOf(tree, { value: 1, children: [{ value: "x" }] });
    assert.equal(error.instancePath, "/children/0/value");
    assert.equal(error.schemaPath, "/properties/value/type");
  });

  it("support mutual recursion through data", () => {
    const schema = {
      $ref: "#/$defs/a",
      $defs: {
        a: { type: "object", properties: { b: { $ref: "#/$defs/b" } } },
        b: { type: "array", items: { $ref: "#/$defs/a" } },
      },
    };
    check(schema, [{ b: [{ b: [] }] }], [{ b: {} }, { b: [{ b: [1] }] }]);
  });

  it("apply alongside sibling keywords", () => {
    const schema = { $defs: { n: { type: "number" } }, $ref: "#/$defs/n", minimum: 5 };
    check(schema, [5], [4, "a"]);
  });

  it("reach a boolean schema", () => {
    check({ $defs: { no: false }, $ref: "#/$defs/no" }, [], [1]);
  });
});

describe("messages", () => {
  it("get singular and plural right", () => {
    assert.equal(errorsOf({ minLength: 1 }, "")[0].message, "must have at least 1 character");
    assert.equal(errorsOf({ minLength: 2 }, "")[0].message, "must have at least 2 characters");
    assert.equal(errorsOf({ maxItems: 1 }, [1, 2])[0].message, "must have at most 1 item");
    assert.equal(errorsOf({ minProperties: 1 }, {})[0].message, "must have at least 1 property");
    assert.equal(errorsOf({ maxProperties: 2 }, { a: 1, b: 2, c: 3 })[0].message, "must have at most 2 properties");
    assert.equal(errorsOf({ contains: true }, [])[0].message, "must contain at least 1 matching item, found 0");
  });
});

describe("failFast", () => {
  const schema = { type: "object", required: ["a", "b"], properties: { a: true, b: true, c: { type: "string" }, d: { type: "string" } }, additionalProperties: false };

  it("stops early but agrees on the verdict", () => {
    const value = { c: 1, d: 1, e: 1 };
    assert.ok(errorsOf(schema, value).length > 1);
    assert.equal(errorsOf({ properties: schema.properties }, value, { failFast: true }).length, 1);
    assert.equal(isValid(schema, value, { failFast: true }), false);
    assert.equal(isValid(schema, { a: 1, b: 2 }, { failFast: true }), true);
  });

  it("reaches through items and allOf", () => {
    assert.equal(errorsOf({ items: { type: "string" } }, [1, 2], { failFast: true }).length, 1);
    assert.equal(errorsOf({ allOf: [{ type: "string" }, { const: 1 }] }, 0, { failFast: true }).length, 1);
  });
});
