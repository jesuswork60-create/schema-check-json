/** Keywords that apply to any value: type, enum, const and $ref. */

import { canonicalKey, jsonEqual, jsonType, JsonValue } from "../json/values.js";
import { apply, failure, KeywordCompiler, NONE } from "./types.js";

function matchesType(value: JsonValue, name: string): boolean {
  if (name === "integer") return typeof value === "number" && Number.isInteger(value);
  return jsonType(value) === name;
}

function describe(value: JsonValue): string {
  const text = JSON.stringify(value);
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

export const type: KeywordCompiler = (value, context) => {
  const names = (Array.isArray(value) ? value : [value]) as string[];
  const wanted = names.join(" or ");
  return (instance, path) => {
    if (names.some((name) => matchesType(instance, name))) return NONE;
    const actual = jsonType(instance);
    return [failure(context, "type", path, `must be ${wanted}, not ${actual}`, { expected: names, actual })];
  };
};

export const enumKeyword: KeywordCompiler = (value, context) => {
  const allowed = value as JsonValue[];
  const keys = new Set(allowed.map(canonicalKey));
  const listing = allowed.map(describe).join(", ");
  return (instance, path) =>
    keys.has(canonicalKey(instance))
      ? NONE
      : [failure(context, "enum", path, `must be one of ${listing}`, { allowed })];
};

export const constKeyword: KeywordCompiler = (value, context) => (instance, path) =>
  jsonEqual(instance, value)
    ? NONE
    : [failure(context, "const", path, `must equal ${describe(value)}`, { expected: value })];

export const ref: KeywordCompiler = (value, context) => {
  const target = context.compileReference(value as string);
  return (instance, path, failFast) => apply(target, instance, path, failFast);
};
