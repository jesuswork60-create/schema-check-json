import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { bestMatch, formatError, formatTree, leaves } from "../src/errors.js";
import { errorsOf } from "./helpers.js";

describe("bestMatch", () => {
  it("is undefined without errors", () => {
    assert.equal(bestMatch([]), undefined);
  });

  it("prefers the shallow error", () => {
    const schema = { properties: { a: { properties: { b: { type: "string" } } } }, required: ["z"] };
    const best = bestMatch(errorsOf(schema, { a: { b: 1 } }));
    assert.equal(best?.keyword, "required");
  });

  it("keeps schema order between equals", () => {
    const best = bestMatch(errorsOf({ properties: { a: { type: "string" }, b: { type: "string" } } }, { a: 1, b: 1 }));
    assert.equal(best?.instancePath, "/a");
  });

  it("prefers a concrete error over an anyOf at the same depth", () => {
    const schema = { anyOf: [{ type: "string" }], minimum: 5 };
    assert.equal(bestMatch(errorsOf(schema, 1))?.keyword, "minimum");
  });

  it("opens anyOf and picks the branch of the right shape", () => {
    const schema = {
      anyOf: [
        { type: "string" },
        { type: "object", required: ["a"], properties: { a: { type: "number" } } },
      ],
    };
    const best = bestMatch(errorsOf(schema, { a: "x" }));
    assert.equal(best?.instancePath, "/a");
    assert.equal(best?.keyword, "type");
  });

  it("picks the branch with the fewest problems", () => {
    const schema = {
      oneOf: [
        { required: ["a", "b", "c"] },
        { required: ["a", "d"] },
      ],
    };
    const best = bestMatch(errorsOf(schema, { a: 1, x: 1 }));
    assert.equal(best?.params.property, "d");
  });

  it("uses every branch when all have the wrong shape", () => {
    const best = bestMatch(errorsOf({ anyOf: [{ type: "string" }, { type: "object" }] }, 1));
    assert.equal(best?.keyword, "type");
  });

  it("goes through nested anyOf", () => {
    const schema = { anyOf: [{ type: "string" }, { anyOf: [{ type: "number" }, { type: "object", required: ["k"] }] }] };
    assert.equal(bestMatch(errorsOf(schema, {}))?.keyword, "required");
  });

  it("returns the oneOf itself when too many branches matched", () => {
    const best = bestMatch(errorsOf({ oneOf: [true, true] }, 1));
    assert.equal(best?.keyword, "oneOf");
  });
});

describe("leaves", () => {
  it("replaces alternatives with what failed inside them", () => {
    const errors = errorsOf({ anyOf: [{ type: "string" }, { anyOf: [{ minimum: 5 }, { const: 9 }] }], maximum: 0 }, 1);
    assert.deepEqual(leaves(errors).map((error) => error.keyword).sort(), ["const", "maximum", "minimum", "type"]);
  });

  it("keeps a oneOf that matched too often", () => {
    assert.deepEqual(leaves(errorsOf({ oneOf: [true, true] }, 1)).map((error) => error.keyword), ["oneOf"]);
  });
});

describe("formatting", () => {
  it("names the root", () => {
    assert.equal(formatError(errorsOf({ type: "string" }, 1)[0]), "(root): must be string, not number");
    assert.equal(formatError(errorsOf({ items: { type: "string" } }, [1])[0]), "/0: must be string, not number");
  });

  it("indents the alternatives", () => {
    const lines = formatTree(errorsOf({ oneOf: [{ type: "string" }, { minimum: 5 }] }, 1));
    assert.deepEqual(lines, [
      "(root): must match exactly one of the alternatives, but matches none",
      "  alternative 1:",
      "    (root): must be string, not number",
      "  alternative 2:",
      "    (root): must be >= 5",
    ]);
  });
});
