/** Dispatches a command and turns failures into messages and exit codes. */

import { SchemaError } from "../validator.js";
import { UsageError } from "./args.js";
import { EXIT_OK, EXIT_TROUBLE, inferCommand, lintCommand, validateCommand } from "./commands.js";
import { InputError, Io } from "./input.js";

const USAGE = `usage: schema-check <command> [options]

commands:
  validate --schema <file> <data>...   check data files against a schema
    --jsonl            read one document per line
    --best             show only the error most worth fixing
    --fail-fast        stop each document at its first error
    --quiet            say nothing about documents that pass
    --output text|json report format, one JSON object per document for json
    --no-formats       treat format as a note
    --strict           refuse unknown schema keywords
  lint [--strict] <schema>...          check that schemas are well formed
  infer [options] <data>...            write a schema from sample documents
    --jsonl            read one document per line
    --ranges           record the smallest and largest numbers
    --closed           reject properties the samples didn't have
    --enum-limit <n>   list strings as an enum if at most n distinct ones repeat
    --no-formats       don't look for formats

A data file of - means standard input.

exit codes: 0 all good, 1 data or schema failed the check, 2 couldn't run`;

export function run(args: readonly string[], io: Io): number {
  const [command, ...rest] = args;
  try {
    switch (command) {
      case undefined:
      case "help":
      case "--help":
      case "-h":
        io.out(USAGE);
        return command === undefined ? EXIT_TROUBLE : EXIT_OK;
      case "validate":
        return validateCommand(rest, io);
      case "lint":
        return lintCommand(rest, io);
      case "infer":
        return inferCommand(rest, io);
      default:
        throw new UsageError(`unknown command ${command}`);
    }
  } catch (error) {
    if (error instanceof UsageError) {
      io.err(`schema-check: ${error.message}`);
      io.err("run schema-check --help for the options");
      return EXIT_TROUBLE;
    }
    if (error instanceof InputError || error instanceof SchemaError) {
      io.err(`schema-check: ${error.message}`);
      return EXIT_TROUBLE;
    }
    throw error;
  }
}
