/**
 * The table of keywords this library knows and the shape each one's value must have. The schema
 * checker walks it, so adding a keyword starts with a line here.
 */

export type Rule =
  | "any"
  | "boolean"
  | "string"
  | "number"
  | "positiveNumber"
  | "count"
  | "schema"
  | "schemaList"
  | "schemaMap"
  | "patternSchemaMap"
  | "regex"
  | "stringList"
  | "stringListMap"
  | "array"
  | "type"
  | "reference";

export const KEYWORDS: Readonly<Record<string, Rule>> = {
  // Identification and notes. The validator doesn't act on these.
  $schema: "string",
  $id: "string",
  $comment: "string",
  title: "string",
  description: "string",
  default: "any",
  examples: "array",
  deprecated: "boolean",
  readOnly: "boolean",
  writeOnly: "boolean",
  contentEncoding: "string",
  contentMediaType: "string",
  contentSchema: "schema",
  // Containers for shared schemas.
  $defs: "schemaMap",
  definitions: "schemaMap",
  // Any value.
  $ref: "reference",
  type: "type",
  enum: "array",
  const: "any",
  // Numbers.
  minimum: "number",
  maximum: "number",
  exclusiveMinimum: "number",
  exclusiveMaximum: "number",
  multipleOf: "positiveNumber",
  // Strings.
  minLength: "count",
  maxLength: "count",
  pattern: "regex",
  format: "string",
  // Arrays.
  items: "schema",
  prefixItems: "schemaList",
  contains: "schema",
  minContains: "count",
  maxContains: "count",
  minItems: "count",
  maxItems: "count",
  uniqueItems: "boolean",
  // Objects.
  properties: "schemaMap",
  patternProperties: "patternSchemaMap",
  additionalProperties: "schema",
  propertyNames: "schema",
  required: "stringList",
  minProperties: "count",
  maxProperties: "count",
  dependentRequired: "stringListMap",
  dependentSchemas: "schemaMap",
  // Combining schemas.
  allOf: "schemaList",
  anyOf: "schemaList",
  oneOf: "schemaList",
  not: "schema",
  if: "schema",
  then: "schema",
  else: "schema",
};

/** Real keywords that would change results if honored, so ignoring them would mislead. */
export const UNSUPPORTED: ReadonlySet<string> = new Set([
  "$anchor",
  "$dynamicAnchor",
  "$dynamicRef",
  "$recursiveAnchor",
  "$recursiveRef",
  "$vocabulary",
  "unevaluatedItems",
  "unevaluatedProperties",
  "additionalItems",
  "dependencies",
]);

/** Keywords that apply a schema to the same value, which is how a reference loop can form. */
export const IN_PLACE: readonly string[] = ["allOf", "anyOf", "oneOf", "not", "if", "then", "else", "dependentSchemas"];

export const TYPE_NAMES: ReadonlySet<string> = new Set(["null", "boolean", "number", "integer", "string", "array", "object"]);
