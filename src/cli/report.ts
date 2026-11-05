/** How validation results are printed. */

import { bestMatch, formatError, ValidationError } from "../errors.js";
import { Loaded } from "./input.js";

export type ReportStyle = "all" | "best";

function where(loaded: Loaded, error: ValidationError): string {
  const position = loaded.document.locate(error.instancePath);
  if (position === undefined) return "";
  // For a JSONL record only the column helps, since the source name already has the line.
  return loaded.record ? `column ${position.column}: ` : `line ${position.line}, column ${position.column}: `;
}

function treeLines(loaded: Loaded, errors: ValidationError[], indent: string): string[] {
  const lines: string[] = [];
  for (const error of errors) {
    lines.push(`${indent}${where(loaded, error)}${formatError(error)}`);
    error.branches?.forEach((branch, index) => {
      if (branch.length === 0) return;
      lines.push(`${indent}  alternative ${index + 1}:`);
      lines.push(...treeLines(loaded, branch, `${indent}    `));
    });
  }
  return lines;
}

export function textReport(loaded: Loaded, errors: ValidationError[], style: ReportStyle): string[] {
  if (errors.length === 0) return [`${loaded.source}: ok`];
  const count = errors.length === 1 ? "1 error" : `${errors.length} errors`;
  const shown = style === "best" ? [bestMatch(errors) as ValidationError] : errors;
  const lines = [`${loaded.source}: invalid (${count})`];
  if (style === "best") {
    lines.push(`  ${where(loaded, shown[0])}${formatError(shown[0])}`);
  } else {
    lines.push(...treeLines(loaded, shown, "  "));
  }
  return lines;
}

function plainError(error: ValidationError, loaded: Loaded): object {
  const position = loaded.document.locate(error.instancePath);
  return {
    instancePath: error.instancePath,
    schemaPath: error.schemaPath,
    keyword: error.keyword,
    message: error.message,
    params: error.params,
    ...(position === undefined ? {} : { line: position.line + loaded.firstLine - 1, column: position.column }),
    ...(error.branches === undefined
      ? {}
      : { branches: error.branches.map((branch) => branch.map((inner) => plainError(inner, loaded))) }),
  };
}

export function jsonReport(loaded: Loaded, errors: ValidationError[], style: ReportStyle): string {
  const shown = style === "best" && errors.length > 0 ? [bestMatch(errors) as ValidationError] : errors;
  return JSON.stringify({
    source: loaded.source,
    valid: errors.length === 0,
    errorCount: errors.length,
    errors: shown.map((error) => plainError(error, loaded)),
  });
}
