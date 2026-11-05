import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { escapeToken, join, parsePointer, referenceToPointer, resolvePointer, unescapeToken } from "../src/json/pointer.js";

describe("tokens", () => {
  it("escape in the right order", () => {
    assert.equal(escapeToken("a/b~c"), "a~1b~0c");
    assert.equal(unescapeToken("a~1b~0c"), "a/b~c");
    // ~01 is a tilde followed by a 1, not a slash.
    assert.equal(unescapeToken("~01"), "~1");
  });

  it("join escapes what it adds", () => {
    assert.equal(join("/a", "b/c"), "/a/b~1c");
    assert.equal(join("", 3), "/3");
  });
});

describe("parsePointer", () => {
  it("splits pointers", () => {
    assert.deepEqual(parsePointer(""), []);
    assert.deepEqual(parsePointer("/"), [""]);
    assert.deepEqual(parsePointer("/a/~1/~0"), ["a", "/", "~"]);
  });

  it("refuses what isn't a pointer", () => {
    assert.equal(parsePointer("a/b"), undefined);
    assert.equal(parsePointer("/a~2"), undefined);
    assert.equal(parsePointer("/a~"), undefined);
  });
});

describe("resolvePointer", () => {
  const document = { a: [10, { "b/c": 20, "~": 30 }], "": 40, zero: 0 };

  it("finds values", () => {
    assert.equal(resolvePointer(document, "/a/0"), 10);
    assert.equal(resolvePointer(document, "/a/1/b~1c"), 20);
    assert.equal(resolvePointer(document, "/a/1/~0"), 30);
    assert.equal(resolvePointer(document, "/"), 40);
    assert.equal(resolvePointer(document, "/zero"), 0);
    assert.equal(resolvePointer(document, ""), document);
  });

  it("finds nothing where there is nothing", () => {
    assert.equal(resolvePointer(document, "/a/2"), undefined);
    assert.equal(resolvePointer(document, "/a/-"), undefined);
    assert.equal(resolvePointer(document, "/a/00"), undefined);
    assert.equal(resolvePointer(document, "/a/length"), undefined);
    assert.equal(resolvePointer(document, "/zero/x"), undefined);
    assert.equal(resolvePointer(document, "/toString"), undefined);
  });
});

describe("referenceToPointer", () => {
  it("reads local references and decodes them", () => {
    assert.equal(referenceToPointer("#"), "");
    assert.equal(referenceToPointer("#/$defs/a"), "/$defs/a");
    assert.equal(referenceToPointer("#/$defs/a%20b"), "/$defs/a b");
    assert.equal(referenceToPointer("#/a~1b"), "/a~1b");
  });

  it("refuses anything else", () => {
    assert.equal(referenceToPointer("other.json#/a"), undefined);
    assert.equal(referenceToPointer("#anchor"), undefined);
    assert.equal(referenceToPointer("#/%zz"), undefined);
    assert.equal(referenceToPointer("https://example.com/s"), undefined);
  });
});
