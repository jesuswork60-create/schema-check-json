/** Turns a checked schema into a graph of nodes that can be run over and over. */

import { FormatCheck } from "../formats.js";
import { referenceToPointer, resolvePointer } from "../json/pointer.js";
import { hasOwn, isObject, JsonValue } from "../json/values.js";
import * as arrays from "../keywords/arrays.js";
import * as general from "../keywords/general.js";
import * as logic from "../keywords/logic.js";
import * as objects from "../keywords/objects.js";
import * as scalars from "../keywords/scalars.js";
import { CompiledNode, KeywordCompiler, KeywordContext } from "../keywords/types.js";

/** Keywords that do something at validation time. Any others in a schema are only notes. */
const COMPILERS: Readonly<Record<string, KeywordCompiler>> = {
  $ref: general.ref,
  type: general.type,
  enum: general.enumKeyword,
  const: general.constKeyword,
  minimum: scalars.minimum,
  maximum: scalars.maximum,
  exclusiveMinimum: scalars.exclusiveMinimum,
  exclusiveMaximum: scalars.exclusiveMaximum,
  multipleOf: scalars.multipleOf,
  minLength: scalars.minLength,
  maxLength: scalars.maxLength,
  pattern: scalars.pattern,
  format: scalars.format,
  prefixItems: arrays.prefixItems,
  items: arrays.items,
  contains: arrays.contains,
  minItems: arrays.minItems,
  maxItems: arrays.maxItems,
  uniqueItems: arrays.uniqueItems,
  properties: objects.properties,
  patternProperties: objects.patternProperties,
  additionalProperties: objects.additionalProperties,
  propertyNames: objects.propertyNames,
  required: objects.required,
  minProperties: objects.minProperties,
  maxProperties: objects.maxProperties,
  dependentRequired: objects.dependentRequired,
  dependentSchemas: objects.dependentSchemas,
  allOf: logic.allOf,
  anyOf: logic.anyOf,
  oneOf: logic.oneOf,
  not: logic.not,
  if: logic.ifKeyword,
};

export function compile(root: JsonValue, formats: Readonly<Record<string, FormatCheck>> | undefined): CompiledNode {
  const nodes = new Map<string, CompiledNode>();

  const compileAt = (schema: JsonValue, path: string): CompiledNode => {
    const existing = nodes.get(path);
    if (existing !== undefined) return existing;
    // Registered before its keywords compile, so a reference back to it finds this node.
    const node: CompiledNode = { path, checks: [] };
    nodes.set(path, node);
    if (schema === false) {
      node.checks.push((_value, at) => [
        { instancePath: at, schemaPath: path, keyword: "false schema", message: "is not allowed here", params: {} },
      ]);
      return node;
    }
    if (!isObject(schema)) return node;
    const context: KeywordContext = {
      schema,
      path,
      compile: compileAt,
      compileReference(reference) {
        const pointer = referenceToPointer(reference) as string;
        return compileAt(resolvePointer(root, pointer) as JsonValue, pointer);
      },
      formats,
    };
    for (const keyword of Object.keys(schema)) {
      if (!hasOwn(COMPILERS, keyword)) continue;
      const check = COMPILERS[keyword](schema[keyword], context);
      if (check !== undefined) node.checks.push(check);
    }
    return node;
  };

  return compileAt(root, "");
}
