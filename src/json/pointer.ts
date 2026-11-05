/** JSON Pointers (RFC 6901) and the "#/..." reference form that carries them in a URI fragment. */

import { hasOwn, isObject, JsonValue } from "./values.js";

export function escapeToken(token: string): string {
  return token.replace(/~/g, "~0").replace(/\//g, "~1");
}

export function unescapeToken(token: string): string {
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

export function join(pointer: string, token: string | number): string {
  return `${pointer}/${escapeToken(String(token))}`;
}

/** Splits a pointer into tokens, or returns undefined if it isn't a pointer. */
export function parsePointer(pointer: string): string[] | undefined {
  if (pointer === "") return [];
  if (!pointer.startsWith("/") || /~(?![01])/.test(pointer)) return undefined;
  return pointer.slice(1).split("/").map(unescapeToken);
}

/** Finds what a pointer names. Array indexes have to be canonical, so 01 and - find nothing. */
export function resolvePointer(root: JsonValue, pointer: string): JsonValue | undefined {
  const tokens = parsePointer(pointer);
  if (tokens === undefined) return undefined;
  let current: JsonValue = root;
  for (const token of tokens) {
    if (Array.isArray(current)) {
      if (!/^(0|[1-9][0-9]*)$/.test(token) || Number(token) >= current.length) return undefined;
      current = current[Number(token)];
    } else if (isObject(current) && hasOwn(current, token)) {
      current = current[token];
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * Turns a local reference such as "#/$defs/a%20b" into the pointer "/$defs/a b". Returns undefined
 * for anything that points outside the document or isn't a pointer fragment.
 */
export function referenceToPointer(reference: string): string | undefined {
  if (!reference.startsWith("#")) return undefined;
  let decoded: string;
  try {
    decoded = decodeURIComponent(reference.slice(1));
  } catch {
    return undefined;
  }
  return parsePointer(decoded) === undefined ? undefined : decoded;
}
