/** What validation reports, and how to pick out and print the failure that matters most. */

import { parsePointer } from "./json/pointer.js";
import { JsonValue } from "./json/values.js";

export interface ValidationError {
  /** JSON Pointer to the failing part of the data. Empty for the whole document. */
  instancePath: string;
  /** JSON Pointer to the keyword in the schema. After a $ref this is the keyword's real home. */
  schemaPath: string;
  keyword: string;
  message: string;
  params: Record<string, JsonValue>;
  /** For anyOf and oneOf: what went wrong in each alternative, in schema order. */
  branches?: ValidationError[][];
}

const WEAK = new Set(["anyOf", "oneOf"]);

function depth(error: ValidationError): number {
  return parsePointer(error.instancePath)?.length ?? 0;
}

function better(a: ValidationError, b: ValidationError): boolean {
  const weakA = WEAK.has(a.keyword);
  const weakB = WEAK.has(b.keyword);
  if (weakA !== weakB) return weakB;
  return depth(a) < depth(b);
}

/** A branch that failed on the type of the value itself was probably not the one intended. */
function wrongShape(branch: ValidationError[], at: string): boolean {
  return branch.some((error) => error.keyword === "type" && error.instancePath === at);
}

function deepest(branch: ValidationError[]): number {
  return Math.max(...branch.map(depth));
}

function pickBranch(error: ValidationError): ValidationError[] | undefined {
  const failing = (error.branches ?? []).filter((branch) => branch.length > 0);
  if (failing.length === 0) return undefined;
  const fitting = failing.filter((branch) => !wrongShape(branch, error.instancePath));
  const pool = fitting.length > 0 ? fitting : failing;
  return pool.reduce((best, branch) => {
    if (branch.length !== best.length) return branch.length < best.length ? branch : best;
    return deepest(branch) > deepest(best) ? branch : best;
  });
}

/**
 * Picks the error most worth showing. Shallow errors beat deep ones, because fixing them often
 * fixes the rest, and concrete keywords beat anyOf and oneOf. Those two are then opened up, and the
 * alternative the data came closest to is searched in turn. It's a heuristic, not a promise.
 */
export function bestMatch(errors: ValidationError[]): ValidationError | undefined {
  if (errors.length === 0) return undefined;
  const chosen = errors.reduce((best, error) => (better(error, best) ? error : best));
  const branch = pickBranch(chosen);
  return branch === undefined ? chosen : bestMatch(branch);
}

/** Every concrete failure, with anyOf and oneOf replaced by the errors of their alternatives. */
export function leaves(errors: ValidationError[]): ValidationError[] {
  return errors.flatMap((error) => {
    const branches = error.branches?.filter((branch) => branch.length > 0) ?? [];
    return branches.length === 0 ? [error] : branches.flatMap(leaves);
  });
}

/** Renders "/a/b: message", using "(root)" for the whole document. */
export function formatError(error: ValidationError): string {
  return `${error.instancePath || "(root)"}: ${error.message}`;
}

/** Renders errors one per line, with the alternatives of anyOf and oneOf indented below them. */
export function formatTree(errors: ValidationError[], indent = ""): string[] {
  const lines: string[] = [];
  for (const error of errors) {
    lines.push(indent + formatError(error));
    error.branches?.forEach((branch, index) => {
      if (branch.length > 0) {
        lines.push(`${indent}  alternative ${index + 1}:`);
        lines.push(...formatTree(branch, `${indent}    `));
      }
    });
  }
  return lines;
}
