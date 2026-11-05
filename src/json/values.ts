/** The shapes a parsed JSON document can take, and the comparisons the validator needs. */

export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export interface JsonObject {
  [key: string]: JsonValue;
}

export type JsonType = "null" | "boolean" | "number" | "string" | "array" | "object";

export function jsonType(value: JsonValue): JsonType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value as JsonType;
}

export function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

/** Sets a key as plain data, so that a key named __proto__ can't touch the prototype. */
export function setOwn(object: JsonObject, key: string, value: JsonValue): void {
  if (key === "__proto__") {
    Object.defineProperty(object, key, { value, enumerable: true, writable: true, configurable: true });
  } else {
    object[key] = value;
  }
}

/** JSON equality: 1 and 1.0 are equal, key order doesn't matter, array order does. */
export function jsonEqual(a: JsonValue, b: JsonValue): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((item, i) => jsonEqual(item, b[i]));
  }
  if (isObject(a) && isObject(b)) {
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    return keys.every((key) => hasOwn(b, key) && jsonEqual(a[key], b[key]));
  }
  return false;
}

/** A string that is the same for exactly the values that are jsonEqual. */
export function canonicalKey(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalKey).join(",")}]`;
  if (isObject(value)) {
    const parts = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalKey(value[key])}`);
    return `{${parts.join(",")}}`;
  }
  return JSON.stringify(value);
}

/** String length as JSON Schema counts it, where an emoji is one character and not two. */
export function codePointLength(text: string): number {
  let count = 0;
  for (const _ of text) count++;
  return count;
}

/**
 * Throws unless the value is something JSON could have produced. Callers holding parsed JSON
 * are always fine; this catches undefined, NaN, Dates, class instances and cycles from code.
 */
export function assertJsonValue(value: unknown, path = ""): asserts value is JsonValue {
  const active = new Set<object>();
  const visit = (item: unknown, at: string): void => {
    if (item === null || typeof item === "boolean" || typeof item === "string") return;
    if (typeof item === "number") {
      if (!Number.isFinite(item)) throw new TypeError(`${at || "the value"} is ${item}, which JSON can't represent`);
      return;
    }
    if (typeof item !== "object") throw new TypeError(`${at || "the value"} is a ${typeof item}, which JSON can't represent`);
    if (active.has(item)) throw new TypeError(`${at || "the value"} refers to itself`);
    active.add(item);
    if (Array.isArray(item)) {
      item.forEach((entry, index) => visit(entry, `${at}/${index}`));
    } else {
      const prototype = Object.getPrototypeOf(item);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(`${at || "the value"} is an instance of ${prototype.constructor?.name ?? "a class"}, not plain JSON`);
      }
      for (const key of Object.keys(item)) visit((item as Record<string, unknown>)[key], `${at}/${key}`);
    }
    active.delete(item);
  };
  visit(value, path);
}
