/** The main entry point: compile a schema once, then validate as much data as you like. */

import { ValidationError } from "./errors.js";
import { FormatCheck, FORMATS } from "./formats.js";
import { assertJsonValue, JsonValue } from "./json/values.js";
import { apply, CompiledNode } from "./keywords/types.js";
import { checkSchema, SchemaIssue } from "./schema/check.js";
import { compile } from "./schema/compile.js";

export class SchemaError extends Error {
  constructor(readonly issues: SchemaIssue[]) {
    const lines = issues.map((issue) => `  #${issue.path}: ${issue.message}`);
    super(`the schema has ${issues.length === 1 ? "a problem" : `${issues.length} problems`}:\n${lines.join("\n")}`);
    this.name = "SchemaError";
  }
}

export interface ValidatorOptions {
  /** Report unknown keywords as schema problems. Off by default, as the specification has it. */
  strict?: boolean;
  /** Set to false to treat format as a note and not a check. */
  checkFormats?: boolean;
  /** Extra format checks, or replacements for the standard ones. */
  formats?: Record<string, FormatCheck>;
  /** Stop at the first failure instead of collecting them all. */
  failFast?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export class Validator {
  private readonly root: CompiledNode;
  private readonly failFast: boolean;

  /** Throws SchemaError if the schema has problems. */
  constructor(schema: unknown, options: ValidatorOptions = {}) {
    assertJsonValue(schema);
    const issues = checkSchema(schema, { strict: options.strict });
    if (issues.length > 0) throw new SchemaError(issues);
    const formats = options.checkFormats === false ? undefined : { ...FORMATS, ...options.formats };
    this.root = compile(schema, formats);
    this.failFast = options.failFast ?? false;
  }

  /** Throws TypeError for values JSON couldn't hold, such as undefined or a Date. */
  validate(value: unknown): ValidationResult {
    assertJsonValue(value);
    const errors = apply(this.root, value as JsonValue, "", this.failFast);
    return { valid: errors.length === 0, errors };
  }

  isValid(value: unknown): boolean {
    return this.validate(value).valid;
  }
}
