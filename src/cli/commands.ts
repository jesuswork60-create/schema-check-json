/** The commands behind the CLI. Each returns its exit code. */

import { inferSchema } from "../infer.js";
import { JsonValue } from "../json/values.js";
import { checkSchema } from "../schema/check.js";
import { Validator } from "../validator.js";
import { parseArgs, requireCount, UsageError } from "./args.js";
import { displayName, Io, Loaded, loadDocuments, loadRequired } from "./input.js";
import { jsonReport, ReportStyle, textReport } from "./report.js";

export const EXIT_OK = 0;
export const EXIT_INVALID = 1;
export const EXIT_TROUBLE = 2;

function warnDuplicates(loaded: Loaded, io: Io): void {
  for (const { pointer, position } of loaded.document.duplicates) {
    io.err(`${loaded.source}: warning: line ${position.line}, column ${position.column}: duplicate key at ${pointer}, the last one counts`);
  }
}

export function validateCommand(args: readonly string[], io: Io): number {
  const parsed = parseArgs(args, {
    flags: ["--strict", "--no-formats", "--fail-fast", "--jsonl", "--best", "--quiet"],
    valued: ["--schema", "--output"],
  });
  const schemaPath = parsed.values.get("--schema");
  if (schemaPath === undefined) throw new UsageError("validate needs --schema <file>");
  if (parsed.positional.length === 0) throw new UsageError("validate needs at least one data file, or - for standard input");
  const output = parsed.values.get("--output") ?? "text";
  if (output !== "text" && output !== "json") throw new UsageError(`--output must be text or json, not ${output}`);

  const schema = loadRequired(schemaPath, io);
  const validator = new Validator(schema.value, {
    strict: parsed.flags.has("--strict"),
    checkFormats: !parsed.flags.has("--no-formats"),
    failFast: parsed.flags.has("--fail-fast"),
  });
  const style: ReportStyle = parsed.flags.has("--best") ? "best" : "all";
  const quiet = parsed.flags.has("--quiet");

  let code = EXIT_OK;
  for (const path of parsed.positional) {
    for (const outcome of loadDocuments(path, parsed.flags.has("--jsonl"), io)) {
      if (!outcome.ok) {
        // A record that isn't JSON can't satisfy any schema, so this counts as failed data.
        code = Math.max(code, EXIT_INVALID);
        if (output === "json") {
          io.out(JSON.stringify({ source: outcome.source, valid: false, syntaxError: outcome.message }));
        } else {
          io.out(`${outcome.source}: not JSON: ${outcome.message}`);
        }
        continue;
      }
      warnDuplicates(outcome.loaded, io);
      const { valid, errors } = validator.validate(outcome.loaded.document.value);
      if (!valid) code = Math.max(code, EXIT_INVALID);
      if (valid && quiet) continue;
      if (output === "json") io.out(jsonReport(outcome.loaded, errors, style));
      else textReport(outcome.loaded, errors, style).forEach((line) => io.out(line));
    }
  }
  return code;
}

export function lintCommand(args: readonly string[], io: Io): number {
  const parsed = parseArgs(args, { flags: ["--strict"], valued: [] });
  if (parsed.positional.length === 0) throw new UsageError("lint needs at least one schema file");
  let code = EXIT_OK;
  for (const path of parsed.positional) {
    const document = loadRequired(path, io);
    const issues = checkSchema(document.value, { strict: parsed.flags.has("--strict") });
    if (issues.length === 0) {
      io.out(`${displayName(path)}: ok`);
      continue;
    }
    code = EXIT_INVALID;
    for (const issue of issues) {
      const position = document.locate(issue.path);
      const prefix = position === undefined ? "" : `line ${position.line}, column ${position.column}: `;
      io.out(`${displayName(path)}: ${prefix}#${issue.path}: ${issue.message}`);
    }
  }
  return code;
}

export function inferCommand(args: readonly string[], io: Io): number {
  const parsed = parseArgs(args, {
    flags: ["--jsonl", "--ranges", "--closed", "--no-formats"],
    valued: ["--enum-limit"],
  });
  if (parsed.positional.length === 0) throw new UsageError("infer needs at least one data file, or - for standard input");
  const samples: JsonValue[] = [];
  let broken = false;
  for (const path of parsed.positional) {
    for (const outcome of loadDocuments(path, parsed.flags.has("--jsonl"), io)) {
      if (outcome.ok) {
        samples.push(outcome.loaded.document.value);
      } else {
        io.err(`${outcome.source}: not JSON: ${outcome.message}`);
        broken = true;
      }
    }
  }
  if (broken) return EXIT_TROUBLE;
  const schema = inferSchema(samples, {
    enumLimit: requireCount(parsed, "--enum-limit", 0),
    ranges: parsed.flags.has("--ranges"),
    closed: parsed.flags.has("--closed"),
    detectFormats: !parsed.flags.has("--no-formats"),
  });
  io.out(JSON.stringify(schema, null, 2));
  return EXIT_OK;
}
