/** Keywords that combine schemas over the same value. */

import { ValidationError } from "../errors.js";
import { join } from "../json/pointer.js";
import { JsonValue } from "../json/values.js";
import { apply, CompiledNode, failure, KeywordCompiler, KeywordContext, NONE } from "./types.js";

function compileList(value: JsonValue, keyword: string, context: KeywordContext): CompiledNode[] {
  const at = join(context.path, keyword);
  return (value as JsonValue[]).map((schema, index) => context.compile(schema, join(at, index)));
}

export const allOf: KeywordCompiler = (value, context) => {
  const nodes = compileList(value, "allOf", context);
  return (instance, path, failFast) => {
    const errors: ValidationError[] = [];
    for (const node of nodes) {
      errors.push(...apply(node, instance, path, failFast));
      if (failFast && errors.length > 0) break;
    }
    return errors;
  };
};

export const anyOf: KeywordCompiler = (value, context) => {
  const nodes = compileList(value, "anyOf", context);
  return (instance, path, failFast) => {
    const branches: ValidationError[][] = [];
    for (const node of nodes) {
      const errors = apply(node, instance, path, failFast);
      if (errors.length === 0) return NONE;
      branches.push(errors);
    }
    const error = failure(context, "anyOf", path, "must match at least one of the alternatives");
    error.branches = branches;
    return [error];
  };
};

export const oneOf: KeywordCompiler = (value, context) => {
  const nodes = compileList(value, "oneOf", context);
  return (instance, path, failFast) => {
    const branches = nodes.map((node) => apply(node, instance, path, failFast));
    const passing = branches.flatMap((errors, index) => (errors.length === 0 ? [index] : []));
    if (passing.length === 1) return NONE;
    if (passing.length === 0) {
      const error = failure(context, "oneOf", path, "must match exactly one of the alternatives, but matches none");
      error.branches = branches;
      return [error];
    }
    const listing = passing.map((index) => index + 1).join(" and ");
    return [failure(context, "oneOf", path, `must match exactly one of the alternatives, but matches ${listing}`, { passing })];
  };
};

export const not: KeywordCompiler = (value, context) => {
  const node = context.compile(value, join(context.path, "not"));
  return (instance, path) =>
    apply(node, instance, path, true).length > 0 ? NONE : [failure(context, "not", path, "must not match the schema under not")];
};

/** Holds then and else too: without an if they do nothing, so they have no check of their own. */
export const ifKeyword: KeywordCompiler = (value, context) => {
  const condition = context.compile(value, join(context.path, "if"));
  const { then: thenSchema, else: elseSchema } = context.schema;
  const thenNode = thenSchema === undefined ? undefined : context.compile(thenSchema, join(context.path, "then"));
  const elseNode = elseSchema === undefined ? undefined : context.compile(elseSchema, join(context.path, "else"));
  return (instance, path, failFast) => {
    const next = apply(condition, instance, path, true).length === 0 ? thenNode : elseNode;
    return next === undefined ? NONE : apply(next, instance, path, failFast);
  };
};
