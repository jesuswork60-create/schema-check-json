/** Keywords for numbers and strings. Each ignores values of other types. */

import { isMultipleOf } from "../json/decimal.js";
import { codePointLength } from "../json/values.js";
import { counted, failure, KeywordCompiler, NONE } from "./types.js";

function bound(keyword: string, sign: string, passes: (value: number, limit: number) => boolean): KeywordCompiler {
  return (limitValue, context) => {
    const limit = limitValue as number;
    return (instance, path) => {
      if (typeof instance !== "number" || passes(instance, limit)) return NONE;
      return [failure(context, keyword, path, `must be ${sign} ${limit}`, { limit })];
    };
  };
}

export const minimum = bound("minimum", ">=", (value, limit) => value >= limit);
export const maximum = bound("maximum", "<=", (value, limit) => value <= limit);
export const exclusiveMinimum = bound("exclusiveMinimum", ">", (value, limit) => value > limit);
export const exclusiveMaximum = bound("exclusiveMaximum", "<", (value, limit) => value < limit);

export const multipleOf: KeywordCompiler = (value, context) => {
  const divisor = value as number;
  return (instance, path) => {
    if (typeof instance !== "number" || isMultipleOf(instance, divisor)) return NONE;
    return [failure(context, "multipleOf", path, `must be a multiple of ${divisor}`, { divisor })];
  };
};

export const minLength: KeywordCompiler = (value, context) => {
  const limit = value as number;
  return (instance, path) => {
    // A code point takes at least one and at most two UTF-16 units, which often settles it cheaply.
    if (typeof instance !== "string" || instance.length >= limit * 2 || codePointLength(instance) >= limit) return NONE;
    return [failure(context, "minLength", path, `must have at least ${counted(limit, "character")}`, { limit })];
  };
};

export const maxLength: KeywordCompiler = (value, context) => {
  const limit = value as number;
  return (instance, path) => {
    if (typeof instance !== "string" || instance.length <= limit || codePointLength(instance) <= limit) return NONE;
    return [failure(context, "maxLength", path, `must have at most ${counted(limit, "character")}`, { limit })];
  };
};

export const pattern: KeywordCompiler = (value, context) => {
  const source = value as string;
  const regex = new RegExp(source, "u");
  return (instance, path) => {
    if (typeof instance !== "string" || regex.test(instance)) return NONE;
    return [failure(context, "pattern", path, `must match the pattern ${source}`, { pattern: source })];
  };
};

export const format: KeywordCompiler = (value, context) => {
  const name = value as string;
  const test = context.formats?.[name];
  // Formats are open-ended, so a name nobody registered passes instead of failing.
  if (test === undefined || !Object.prototype.hasOwnProperty.call(context.formats, name)) return undefined;
  return (instance, path) => {
    if (typeof instance !== "string" || test(instance)) return NONE;
    return [failure(context, "format", path, `must be a valid ${name}`, { format: name })];
  };
};
