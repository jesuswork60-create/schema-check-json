/** What every keyword implementation shares. */

import { ValidationError } from "../errors.js";
import { FormatCheck } from "../formats.js";
import { join } from "../json/pointer.js";
import { JsonObject, JsonValue } from "../json/values.js";

/** Tests one value against one keyword. Returns its failures, usually none. */
export type Check = (value: JsonValue, path: string, failFast: boolean) => ValidationError[];

/** A schema turned into checks. Reference cycles make these form a graph, not a tree. */
export interface CompiledNode {
  path: string;
  checks: Check[];
}

export interface KeywordContext {
  /** The schema object holding the keyword, for keywords that read their neighbours. */
  schema: JsonObject;
  /** JSON Pointer to the schema object. */
  path: string;
  /** Compiles a schema found at a pointer. Compiling the same place twice gives the same node. */
  compile(schema: JsonValue, path: string): CompiledNode;
  /** Compiles the schema a reference points to. */
  compileReference(reference: string): CompiledNode;
  /** The format checks in force, or undefined when formats are turned off. */
  formats: Readonly<Record<string, FormatCheck>> | undefined;
}

/** Builds the check for a keyword, or returns undefined if there's nothing to do at run time. */
export type KeywordCompiler = (value: JsonValue, context: KeywordContext) => Check | undefined;

export const NONE: ValidationError[] = [];

/** "1 item" or "2 items", for messages. */
export function counted(count: number, noun: string, plural = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : plural}`;
}

/** Runs a compiled schema on a value. */
export function apply(node: CompiledNode, value: JsonValue, path: string, failFast: boolean): ValidationError[] {
  let errors = NONE;
  for (const check of node.checks) {
    const found = check(value, path, failFast);
    if (found.length > 0) {
      errors = errors === NONE ? found : errors.concat(found);
      if (failFast) break;
    }
  }
  return errors;
}

/** Makes the error for a keyword of the schema at `context`. */
export function failure(
  context: KeywordContext,
  keyword: string,
  path: string,
  message: string,
  params: Record<string, JsonValue> = {},
): ValidationError {
  return { instancePath: path, schemaPath: join(context.path, keyword), keyword, message, params };
}
