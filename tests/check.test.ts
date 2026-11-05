import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkSchema } from "../src/schema/check.js";
import { SchemaError, Validator } from "../src/validator.js";
import { JsonValue } from "../src/json/values.js";

function issueAt(schema: JsonValue, path: string, fragment: RegExp, strict = false): void {
  const issues = checkSchema(schema, { strict });
  const found = issues.find((issue) => issue.path === path);
  assert.ok(found, `no issue at ${path}: ${JSON.stringify(issues)}`);
  assert.match(found.message, fragment);
}

describe("checkSchema", () => {
  it("is happy with sound schemas", () => {
    assert.deepEqual(checkSchema(true), []);
    assert.deepEqual(checkSchema({}), []);
    const schema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $defs: { a: { type: ["string", "null"] } },
      type: "object",
      properties: { x: { $ref: "#/$defs/a" }, y: { enum: [1, "a"] } },
      patternProperties: { "^z": { minimum: 1 } },
      required: ["x"],
      dependentRequired: { x: ["y"] },
      allOf: [{ minProperties: 1 }],
    };
    assert.deepEqual(checkSchema(schema), []);
  });

  it("refuses schemas that aren't objects or booleans", () => {
    issueAt(1, "", /object or a boolean/);
    issueAt([], "", /object or a boolean/);
    issueAt({ properties: { a: 1 } }, "/properties/a", /object or a boolean/);
    issueAt({ items: "x" }, "/items", /object or a boolean/);
    issueAt({ allOf: [true, null] }, "/allOf/1", /object or a boolean/);
  });

  it("checks the shape of each keyword", () => {
    issueAt({ minimum: "1" }, "/minimum", /a number/);
    issueAt({ multipleOf: 0 }, "/multipleOf", /above zero/);
    issueAt({ multipleOf: -1 }, "/multipleOf", /above zero/);
    issueAt({ minLength: -1 }, "/minLength", /whole number/);
    issueAt({ maxItems: 1.5 }, "/maxItems", /whole number/);
    issueAt({ enum: 1 }, "/enum", /an array/);
    issueAt({ uniqueItems: 1 }, "/uniqueItems", /a boolean/);
    issueAt({ format: 1 }, "/format", /a string/);
    issueAt({ allOf: [] }, "/allOf", /non-empty array/);
    issueAt({ anyOf: {} }, "/anyOf", /non-empty array/);
    issueAt({ properties: [] }, "/properties", /object of schemas/);
    issueAt({ prefixItems: true }, "/prefixItems", /non-empty array/);
  });

  it("accepts a whole number written with a decimal point", () => {
    assert.deepEqual(checkSchema({ minLength: 2.0 }), []);
  });

  it("checks type names", () => {
    issueAt({ type: "strng" }, "/type", /unknown type "strng"/);
    issueAt({ type: ["string", 1] }, "/type", /unknown type 1/);
    issueAt({ type: [] }, "/type", /at least one/);
    issueAt({ type: ["string", "string"] }, "/type", /repeats/);
  });

  it("checks required lists", () => {
    issueAt({ required: "a" }, "/required", /array of strings/);
    issueAt({ required: [1] }, "/required", /array of strings/);
    issueAt({ required: ["a", "a"] }, "/required", /repeats/);
    issueAt({ dependentRequired: { a: "b" } }, "/dependentRequired/a", /array of strings/);
    issueAt({ dependentRequired: [] }, "/dependentRequired", /string lists/);
  });

  it("checks patterns", () => {
    issueAt({ pattern: "(" }, "/pattern", /bad pattern/);
    issueAt({ pattern: 1 }, "/pattern", /a string/);
    issueAt({ patternProperties: { "[": true } }, "/patternProperties/[", /bad pattern/);
  });

  it("looks inside nested schemas with exact paths", () => {
    issueAt({ properties: { "a/b": { items: { type: "nope" } } } }, "/properties/a~1b/items/type", /unknown type/);
    issueAt({ $defs: { x: { minimum: "1" } } }, "/$defs/x/minimum", /a number/);
    issueAt({ definitions: { x: { minimum: "1" } } }, "/definitions/x/minimum", /a number/);
    issueAt({ if: { not: { minimum: "1" } } }, "/if/not/minimum", /a number/);
    issueAt({ dependentSchemas: { a: 1 } }, "/dependentSchemas/a", /object or a boolean/);
  });

  it("names keywords it can't honor rather than ignoring them", () => {
    for (const keyword of ["$dynamicRef", "unevaluatedProperties", "unevaluatedItems", "$anchor", "dependencies", "additionalItems"]) {
      issueAt({ [keyword]: {} }, `/${keyword}`, /not supported/);
    }
  });

  it("lets unknown keywords pass unless strict", () => {
    assert.deepEqual(checkSchema({ requird: ["a"] }), []);
    issueAt({ requird: ["a"] }, "/requird", /unknown keyword/, true);
    issueAt({ items: { minimun: 1 } }, "/items/minimun", /unknown keyword/, true);
    assert.deepEqual(checkSchema({ title: "x", default: 1, examples: [], $comment: "y" }, { strict: true }), []);
  });

  it("isn't tripped by keys named like object methods", () => {
    issueAt({ constructor: 1 }, "/constructor", /unknown keyword/, true);
    assert.deepEqual(checkSchema({ properties: { constructor: true } }, { strict: true }), []);
  });

  it("doesn't read inside enum, const or default", () => {
    assert.deepEqual(checkSchema({ enum: [{ type: "nope" }], const: { minimum: "x" }, default: { $ref: "elsewhere" } }), []);
  });
});

describe("checkSchema references", () => {
  it("wants a local target that exists", () => {
    issueAt({ $ref: "#/$defs/none" }, "/$ref", /doesn't exist/);
    issueAt({ $ref: 1 }, "/$ref", /must be a string/);
    issueAt({ $ref: "other.json" }, "/$ref", /inside this document/);
    issueAt({ $ref: "#name" }, "/$ref", /inside this document/);
  });

  it("checks the schema at the target", () => {
    issueAt({ extra: { minimum: "x" }, $ref: "#/extra" }, "/extra/minimum", /a number/);
    issueAt({ extra: 1, $ref: "#/extra" }, "/extra", /object or a boolean/);
  });

  it("follows chains through unknown places", () => {
    issueAt({ a: { $ref: "#/b" }, b: { $ref: "#/c" }, $ref: "#/a" }, "/b/$ref", /doesn't exist/);
  });

  it("finds direct and indirect loops", () => {
    issueAt({ $ref: "#" }, "", /reference loop: # -> #/);
    issueAt({ $defs: { a: { $ref: "#/$defs/b" }, b: { $ref: "#/$defs/a" } }, $ref: "#/$defs/a" }, "/$defs/a", /reference loop/);
    issueAt({ allOf: [{ $ref: "#" }] }, "", /reference loop/);
    issueAt({ anyOf: [{ type: "null" }, { not: { $ref: "#" } }] }, "", /reference loop/);
    issueAt({ if: { $ref: "#" } }, "", /reference loop/);
    issueAt({ dependentSchemas: { a: { $ref: "#" } } }, "", /reference loop/);
  });

  it("finds a loop that nothing outside refers to", () => {
    const issues = checkSchema({ $defs: { a: { $ref: "#/$defs/b" }, b: { $ref: "#/$defs/a" } } });
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, /reference loop/);
  });

  it("allows loops that consume data", () => {
    assert.deepEqual(checkSchema({ properties: { next: { $ref: "#" } } }), []);
    assert.deepEqual(checkSchema({ items: { $ref: "#" } }), []);
    assert.deepEqual(checkSchema({ additionalProperties: { $ref: "#" } }), []);
    assert.deepEqual(checkSchema({ prefixItems: [{ $ref: "#" }] }), []);
  });

  it("allows two references to the same place", () => {
    assert.deepEqual(checkSchema({ $defs: { a: true }, allOf: [{ $ref: "#/$defs/a" }, { $ref: "#/$defs/a" }] }), []);
  });
});

describe("Validator construction", () => {
  it("throws SchemaError listing all problems", () => {
    assert.throws(
      () => new Validator({ minimum: "1", type: "nope" }),
      (error: unknown) => {
        assert.ok(error instanceof SchemaError);
        assert.equal(error.issues.length, 2);
        assert.match(error.message, /2 problems/);
        assert.match(error.message, /#\/minimum/);
        return true;
      },
    );
  });

  it("refuses what isn't JSON", () => {
    assert.throws(() => new Validator({ const: undefined }), TypeError);
    assert.throws(() => new Validator({}).validate(undefined), TypeError);
    assert.throws(() => new Validator({}).validate({ a: new Date(0) }), TypeError);
  });

  it("honors strict", () => {
    assert.throws(() => new Validator({ nope: 1 }, { strict: true }), SchemaError);
    assert.ok(new Validator({ nope: 1 }).isValid(1));
  });
});
