import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { parseArgs, requireCount, UsageError } from "../src/cli/args.js";
import { run } from "../src/cli/main.js";
import { fakeIo, FakeIo } from "./helpers.js";

const SCHEMA = JSON.stringify({
  type: "object",
  required: ["name"],
  properties: { name: { type: "string" }, age: { type: "integer", minimum: 0 }, day: { format: "date" } },
});

function runWith(args: string[], files: Record<string, string> = {}, stdin = ""): { code: number; io: FakeIo } {
  const io = fakeIo({ "s.json": SCHEMA, ...files }, stdin);
  return { code: run(args, io), io };
}

describe("parseArgs", () => {
  const spec = { flags: ["--a"], valued: ["--b"] };

  it("reads flags, both value forms and positionals", () => {
    const parsed = parseArgs(["--a", "x", "--b", "1", "y", "-"], spec);
    assert.ok(parsed.flags.has("--a"));
    assert.equal(parsed.values.get("--b"), "1");
    assert.deepEqual(parsed.positional, ["x", "y", "-"]);
    assert.equal(parseArgs(["--b=2=3"], spec).values.get("--b"), "2=3");
    assert.equal(parseArgs(["--b="], spec).values.get("--b"), "");
  });

  it("stops at --", () => {
    assert.deepEqual(parseArgs(["--", "--a", "-x"], spec).positional, ["--a", "-x"]);
  });

  it("refuses bad usage", () => {
    assert.throws(() => parseArgs(["--c"], spec), UsageError);
    assert.throws(() => parseArgs(["-c"], spec), UsageError);
    assert.throws(() => parseArgs(["--b"], spec), /needs a value/);
    assert.throws(() => parseArgs(["--a=1"], spec), /doesn't take a value/);
  });

  it("reads counts", () => {
    const parsed = parseArgs(["--b", "12"], spec);
    assert.equal(requireCount(parsed, "--b", 0), 12);
    assert.equal(requireCount(parsed, "--missing", 7), 7);
    assert.throws(() => requireCount(parseArgs(["--b", "-1"], spec), "--b", 0), UsageError);
  });
});

describe("validate command", () => {
  it("passes good data with exit 0", () => {
    const { code, io } = runWith(["validate", "--schema", "s.json", "d.json"], { "d.json": '{"name":"a"}' });
    assert.equal(code, 0);
    assert.deepEqual(io.stdout, ["d.json: ok"]);
  });

  it("reports bad data with positions and exit 1", () => {
    const { code, io } = runWith(["validate", "--schema", "s.json", "d.json"], { "d.json": '{\n  "age": -1\n}' });
    assert.equal(code, 1);
    assert.deepEqual(io.stdout, [
      "d.json: invalid (2 errors)",
      "  line 1, column 1: (root): is missing the property \"name\"",
      "  line 2, column 10: /age: must be >= 0",
    ]);
  });

  it("indents alternatives", () => {
    const files = { "o.json": '{"oneOf":[{"type":"string"},{"minimum":5}]}', "d.json": "1" };
    const { io } = runWith(["validate", "--schema", "o.json", "d.json"], files);
    assert.deepEqual(io.stdout, [
      "d.json: invalid (1 error)",
      "  line 1, column 1: (root): must match exactly one of the alternatives, but matches none",
      "    alternative 1:",
      "      line 1, column 1: (root): must be string, not number",
      "    alternative 2:",
      "      line 1, column 1: (root): must be >= 5",
    ]);
  });

  it("shows only the best error on request but still counts them", () => {
    const { io } = runWith(["validate", "--schema", "s.json", "--best", "d.json"], { "d.json": '{"age":-1}' });
    assert.deepEqual(io.stdout, ["d.json: invalid (2 errors)", '  line 1, column 1: (root): is missing the property "name"']);
  });

  it("stops at the first error with --fail-fast", () => {
    const { io } = runWith(["validate", "--schema", "s.json", "--fail-fast", "d.json"], { "d.json": '{"age":-1}' });
    assert.equal(io.stdout[0], "d.json: invalid (1 error)");
  });

  it("hides passing documents with --quiet", () => {
    const { code, io } = runWith(["validate", "--schema", "s.json", "--quiet", "d.json"], { "d.json": '{"name":"a"}' });
    assert.equal(code, 0);
    assert.deepEqual(io.stdout, []);
  });

  it("honors --no-formats", () => {
    const files = { "d.json": '{"name":"a","day":"soon"}' };
    assert.equal(runWith(["validate", "--schema", "s.json", "d.json"], files).code, 1);
    assert.equal(runWith(["validate", "--schema", "s.json", "--no-formats", "d.json"], files).code, 0);
  });

  it("reads standard input", () => {
    const { code, io } = runWith(["validate", "--schema", "s.json", "-"], {}, '{"name":"a"}');
    assert.equal(code, 0);
    assert.deepEqual(io.stdout, ["(stdin): ok"]);
  });

  it("checks several files and keeps going", () => {
    const files = { "a.json": "{", "b.json": "1", "c.json": '{"name":"a"}' };
    const { code, io } = runWith(["validate", "--schema", "s.json", "a.json", "b.json", "c.json"], files);
    assert.equal(code, 1);
    assert.match(io.stdout[0], /^a\.json: not JSON: line 1, column 2/);
    assert.match(io.stdout[1], /^b\.json: invalid/);
    assert.equal(io.stdout.at(-1), "c.json: ok");
  });

  it("warns about duplicate keys without failing", () => {
    const { code, io } = runWith(["validate", "--schema", "s.json", "d.json"], { "d.json": '{"name":1,"name":"a"}' });
    assert.equal(code, 0);
    assert.match(io.stderr[0], /duplicate key at \/name/);
  });

  it("handles JSONL by line, skipping blanks", () => {
    const text = '{"name":"a"}\n\n{"age":1}\nnope\n';
    const { code, io } = runWith(["validate", "--schema", "s.json", "--jsonl", "d.jsonl"], { "d.jsonl": text });
    assert.equal(code, 1);
    assert.deepEqual(io.stdout, [
      "d.jsonl:1: ok",
      "d.jsonl:3: invalid (1 error)",
      '  column 1: (root): is missing the property "name"',
      "d.jsonl:4: not JSON: line 1, column 1: expected a JSON value",
    ]);
  });

  it("doesn't take a colon in a file name for a JSONL record", () => {
    const { io } = runWith(["validate", "--schema", "s.json", "d:7"], { "d:7": "1" });
    assert.match(io.stdout[1], /^ {2}line 1, column 1: /);
  });

  it("writes one JSON object per document", () => {
    const text = '{"name":"a"}\n{"age":-1}\nnope\n';
    const { io } = runWith(["validate", "--schema", "s.json", "--jsonl", "--output", "json", "d.jsonl"], { "d.jsonl": text });
    const reports = io.stdout.map((line) => JSON.parse(line));
    assert.equal(reports[0].valid, true);
    assert.deepEqual(reports[0].errors, []);
    assert.equal(reports[1].valid, false);
    assert.equal(reports[1].errorCount, 2);
    const age = reports[1].errors.find((error: { instancePath: string }) => error.instancePath === "/age");
    assert.equal(age.keyword, "minimum");
    assert.equal(age.schemaPath, "/properties/age/minimum");
    assert.equal(age.line, 2);
    assert.equal(age.column, 8);
    assert.equal(reports[2].valid, false);
    assert.match(reports[2].syntaxError, /JSON value/);
  });

  it("includes alternatives in JSON output, and --best opens them", () => {
    const files = { "o.json": '{"anyOf":[{"type":"string"},{"minimum":5}]}', "d.json": "1" };
    const all = JSON.parse(runWith(["validate", "--schema", "o.json", "--output=json", "d.json"], files).io.stdout[0]);
    assert.equal(all.errors[0].branches.length, 2);
    assert.equal(all.errors[0].branches[1][0].keyword, "minimum");
    const best = JSON.parse(runWith(["validate", "--schema", "o.json", "--output=json", "--best", "d.json"], files).io.stdout[0]);
    assert.equal(best.errors.length, 1);
    assert.equal(best.errorCount, 1);
    assert.notEqual(best.errors[0].keyword, "anyOf");
  });

  it("exits 2 when it can't start", () => {
    assert.equal(runWith(["validate", "d.json"]).code, 2);
    assert.equal(runWith(["validate", "--schema", "s.json"]).code, 2);
    assert.equal(runWith(["validate", "--schema", "none.json", "d.json"], { "d.json": "1" }).code, 2);
    assert.equal(runWith(["validate", "--schema", "s.json", "none.json"]).code, 2);
    assert.equal(runWith(["validate", "--schema", "s.json", "--output", "xml", "d.json"]).code, 2);
    assert.equal(runWith(["validate", "--schema", "s.json", "--nope", "d.json"]).code, 2);
  });

  it("exits 2 on a broken or unsound schema, naming the problem", () => {
    const broken = runWith(["validate", "--schema", "b.json", "d.json"], { "b.json": "{", "d.json": "1" });
    assert.equal(broken.code, 2);
    assert.match(broken.io.stderr[0], /b\.json: line 1, column 2/);
    const unsound = runWith(["validate", "--schema", "b.json", "d.json"], { "b.json": '{"type":"nope"}', "d.json": "1" });
    assert.equal(unsound.code, 2);
    assert.match(unsound.io.stderr[0], /unknown type/);
  });

  it("applies --strict to the schema", () => {
    const files = { "b.json": '{"nope":1}', "d.json": "1" };
    assert.equal(runWith(["validate", "--schema", "b.json", "d.json"], files).code, 0);
    assert.equal(runWith(["validate", "--schema", "b.json", "--strict", "d.json"], files).code, 2);
  });
});

describe("lint command", () => {
  it("passes sound schemas", () => {
    const { code, io } = runWith(["lint", "s.json"]);
    assert.equal(code, 0);
    assert.deepEqual(io.stdout, ["s.json: ok"]);
  });

  it("reports problems with positions", () => {
    const { code, io } = runWith(["lint", "b.json"], { "b.json": '{\n  "type": "nope"\n}' });
    assert.equal(code, 1);
    assert.deepEqual(io.stdout, ['b.json: line 2, column 11: #/type: unknown type "nope"']);
  });

  it("names standard input the way validate does", () => {
    assert.deepEqual(runWith(["lint", "-"], {}, "{}").io.stdout, ["(stdin): ok"]);
    assert.match(runWith(["lint", "-"], {}, '{"type":"nope"}').io.stdout[0], /^\(stdin\): line 1/);
  });

  it("honors --strict", () => {
    const files = { "b.json": '{"requird":[]}' };
    assert.equal(runWith(["lint", "b.json"], files).code, 0);
    const { code, io } = runWith(["lint", "--strict", "b.json"], files);
    assert.equal(code, 1);
    assert.match(io.stdout[0], /unknown keyword requird/);
  });

  it("exits 2 without usable input", () => {
    assert.equal(runWith(["lint"]).code, 2);
    assert.equal(runWith(["lint", "none.json"]).code, 2);
    assert.equal(runWith(["lint", "b.json"], { "b.json": "{" }).code, 2);
  });
});

describe("infer command", () => {
  it("prints a schema covering all inputs", () => {
    const { code, io } = runWith(["infer", "a.json", "b.json"], { "a.json": '{"x":1}', "b.json": '{"x":2.5,"y":"s"}' });
    assert.equal(code, 0);
    const schema = JSON.parse(io.stdout.join("\n"));
    assert.deepEqual(schema.properties, { x: { type: "number" }, y: { type: "string" } });
    assert.deepEqual(schema.required, ["x"]);
  });

  it("takes JSONL from standard input and its options", () => {
    const { io } = runWith(["infer", "--jsonl", "--ranges", "--closed", "--enum-limit", "1", "-"], {}, '{"n":1,"s":"a"}\n{"n":9,"s":"a"}\n');
    const schema = JSON.parse(io.stdout.join("\n"));
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.properties.n, { type: "integer", minimum: 1, maximum: 9 });
    assert.deepEqual(schema.properties.s.enum, ["a"]);
  });

  it("exits 2 on bad samples and bad options", () => {
    const broken = runWith(["infer", "a.json"], { "a.json": "{" });
    assert.equal(broken.code, 2);
    assert.deepEqual(broken.io.stdout, []);
    assert.match(broken.io.stderr[0], /not JSON/);
    assert.equal(runWith(["infer"]).code, 2);
    assert.equal(runWith(["infer", "--enum-limit", "x", "a.json"], { "a.json": "1" }).code, 2);
  });
});

describe("dispatch", () => {
  it("prints help", () => {
    const { code, io } = runWith(["--help"]);
    assert.equal(code, 0);
    assert.match(io.stdout[0], /^usage:/);
  });

  it("exits 2 with no command or an unknown one", () => {
    assert.equal(runWith([]).code, 2);
    const { code, io } = runWith(["frobnicate"]);
    assert.equal(code, 2);
    assert.match(io.stderr[0], /unknown command frobnicate/);
  });
});

describe("the real binary", () => {
  const bin = fileURLToPath(new URL("../src/cli/bin.js", import.meta.url));
  const examples = fileURLToPath(new URL("../../examples/", import.meta.url));
  const execute = (args: string[], input?: string) => spawnSync(process.execPath, [bin, ...args], { input, encoding: "utf8" });

  it("passes the good example", () => {
    const result = execute(["validate", "--schema", `${examples}person.schema.json`, `${examples}good.json`]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /good\.json: ok/);
  });

  it("fails the bad example and shows each problem", () => {
    const result = execute(["validate", "--schema", `${examples}person.schema.json`, `${examples}bad.json`]);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, /line 3, column 10: \/age: must be >= 0/);
    assert.match(result.stdout, /\/nickname: is not allowed here/);
    assert.match(result.stdout, /\/tags: must not repeat items/);
  });

  it("reads standard input and fails on the JSONL example's second line", () => {
    const result = execute(["validate", "--schema", `${examples}person.schema.json`, "--jsonl", `${examples}people.jsonl`]);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, /people\.jsonl:2: invalid/);
    const piped = execute(["infer", "-"], '{"a":1}');
    assert.equal(piped.status, 0, piped.stderr);
    assert.equal(JSON.parse(piped.stdout).properties.a.type, "integer");
  });

  it("exits 2 for a missing file", () => {
    const result = execute(["lint", "no-such-file.json"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /can't read/);
  });
});
