/** Keywords for arrays. Each ignores values of other types. */

import { ValidationError } from "../errors.js";
import { join } from "../json/pointer.js";
import { canonicalKey, JsonValue } from "../json/values.js";
import { apply, counted, failure, KeywordCompiler, NONE } from "./types.js";

export const prefixItems: KeywordCompiler = (value, context) => {
  const nodes = (value as JsonValue[]).map((schema, index) =>
    context.compile(schema, join(join(context.path, "prefixItems"), index)),
  );
  return (instance, path, failFast) => {
    if (!Array.isArray(instance)) return NONE;
    const errors: ValidationError[] = [];
    const count = Math.min(nodes.length, instance.length);
    for (let i = 0; i < count; i++) {
      errors.push(...apply(nodes[i], instance[i], join(path, i), failFast));
      if (failFast && errors.length > 0) break;
    }
    return errors;
  };
};

export const items: KeywordCompiler = (value, context) => {
  const node = context.compile(value, join(context.path, "items"));
  const prefix = context.schema.prefixItems;
  const skip = Array.isArray(prefix) ? prefix.length : 0;
  return (instance, path, failFast) => {
    if (!Array.isArray(instance)) return NONE;
    const errors: ValidationError[] = [];
    for (let i = skip; i < instance.length; i++) {
      errors.push(...apply(node, instance[i], join(path, i), failFast));
      if (failFast && errors.length > 0) break;
    }
    return errors;
  };
};

export const contains: KeywordCompiler = (value, context) => {
  const node = context.compile(value, join(context.path, "contains"));
  const least = (context.schema.minContains as number | undefined) ?? 1;
  const most = context.schema.maxContains as number | undefined;
  return (instance, path) => {
    if (!Array.isArray(instance)) return NONE;
    let found = 0;
    for (const item of instance) {
      if (apply(node, item, path, true).length === 0) found++;
    }
    if (found < least) {
      const keyword = context.schema.minContains === undefined ? "contains" : "minContains";
      return [failure(context, keyword, path, `must contain at least ${counted(least, "matching item")}, found ${found}`, { least, found })];
    }
    if (most !== undefined && found > most) {
      return [failure(context, "maxContains", path, `must contain at most ${counted(most, "matching item")}, found ${found}`, { most, found })];
    }
    return NONE;
  };
};

export const minItems: KeywordCompiler = (value, context) => {
  const limit = value as number;
  return (instance, path) => {
    if (!Array.isArray(instance) || instance.length >= limit) return NONE;
    return [failure(context, "minItems", path, `must have at least ${counted(limit, "item")}`, { limit })];
  };
};

export const maxItems: KeywordCompiler = (value, context) => {
  const limit = value as number;
  return (instance, path) => {
    if (!Array.isArray(instance) || instance.length <= limit) return NONE;
    return [failure(context, "maxItems", path, `must have at most ${counted(limit, "item")}`, { limit })];
  };
};

export const uniqueItems: KeywordCompiler = (value, context) => {
  if (value !== true) return undefined;
  return (instance, path) => {
    if (!Array.isArray(instance)) return NONE;
    const seen = new Map<string, number>();
    for (let i = 0; i < instance.length; i++) {
      const key = canonicalKey(instance[i]);
      const earlier = seen.get(key);
      if (earlier !== undefined) {
        return [failure(context, "uniqueItems", path, `must not repeat items, but ${earlier} and ${i} are equal`, { first: earlier, second: i })];
      }
      seen.set(key, i);
    }
    return NONE;
  };
};
