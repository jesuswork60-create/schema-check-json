/**
 * Writes a schema from sample documents. The result accepts every sample it was given. How much
 * more it accepts depends on the options, and a few samples can only suggest what the data allows.
 */

import { FORMATS } from "./formats.js";
import { isObject, JsonObject, JsonValue, setOwn } from "./json/values.js";

export interface InferOptions {
  /** List string values as an enum if there are at most this many distinct ones. 0 turns it off. */
  enumLimit?: number;
  /** A value has to appear at least this many times on average before an enum is written. */
  enumMinRepeats?: number;
  /** Look for a format that all the strings share. */
  detectFormats?: boolean;
  /** Write the smallest and largest numbers seen as minimum and maximum. */
  ranges?: boolean;
  /** Write additionalProperties: false, so that keys not seen in the samples are rejected. */
  closed?: boolean;
}

/** Tried in this order, so the most specific format that fits is the one reported. */
const FORMAT_CANDIDATES = ["date-time", "date", "time", "uuid", "email", "ipv4", "ipv6", "uri"];

const DIALECT = "https://json-schema.org/draft/2020-12/schema";

class Shape {
  seen = 0;
  nulls = 0;
  booleans = 0;
  numbers = 0;
  fractional = false;
  smallest = Infinity;
  largest = -Infinity;
  strings = 0;
  distinct: Set<string> | undefined = new Set();
  formats: string[];
  arrays = 0;
  shortest = Infinity;
  longest = 0;
  items: Shape | undefined;
  objects = 0;
  readonly properties = new Map<string, Shape>();

  constructor(private readonly options: Required<InferOptions>) {
    this.formats = options.detectFormats ? [...FORMAT_CANDIDATES] : [];
  }

  add(value: JsonValue): void {
    this.seen++;
    if (value === null) this.nulls++;
    else if (typeof value === "boolean") this.booleans++;
    else if (typeof value === "number") this.addNumber(value);
    else if (typeof value === "string") this.addString(value);
    else if (Array.isArray(value)) this.addArray(value);
    else if (isObject(value)) this.addObject(value);
  }

  private addNumber(value: number): void {
    this.numbers++;
    if (!Number.isInteger(value)) this.fractional = true;
    this.smallest = Math.min(this.smallest, value);
    this.largest = Math.max(this.largest, value);
  }

  private addString(value: string): void {
    this.strings++;
    this.formats = this.formats.filter((name) => FORMATS[name](value));
    if (this.distinct !== undefined) {
      this.distinct.add(value);
      // Past the limit the set can't become an enum, so stop paying for it.
      if (this.distinct.size > this.options.enumLimit) this.distinct = undefined;
    }
  }

  private addArray(value: JsonValue[]): void {
    this.arrays++;
    this.shortest = Math.min(this.shortest, value.length);
    this.longest = Math.max(this.longest, value.length);
    for (const item of value) {
      this.items ??= new Shape(this.options);
      this.items.add(item);
    }
  }

  private addObject(value: JsonObject): void {
    this.objects++;
    for (const key of Object.keys(value)) {
      let property = this.properties.get(key);
      if (property === undefined) {
        property = new Shape(this.options);
        this.properties.set(key, property);
      }
      property.add(value[key]);
    }
  }

  private typeNames(): string[] {
    const names: string[] = [];
    if (this.nulls > 0) names.push("null");
    if (this.booleans > 0) names.push("boolean");
    if (this.numbers > 0) names.push(this.fractional ? "number" : "integer");
    if (this.strings > 0) names.push("string");
    if (this.arrays > 0) names.push("array");
    if (this.objects > 0) names.push("object");
    return names;
  }

  toSchema(): JsonObject {
    const names = this.typeNames();
    const schema: JsonObject = {};
    if (names.length > 0) schema.type = names.length === 1 ? names[0] : names;
    if (this.numbers > 0 && this.options.ranges) {
      schema.minimum = this.smallest;
      schema.maximum = this.largest;
    }
    if (this.strings > 0) this.describeStrings(schema, names.length === 1);
    if (this.items !== undefined) schema.items = this.items.toSchema();
    if (this.objects > 0) this.describeObjects(schema);
    return schema;
  }

  private describeStrings(schema: JsonObject, onlyStrings: boolean): void {
    if (this.formats.length > 0) schema.format = this.formats[0];
    const values = this.distinct;
    if (values === undefined || !onlyStrings || this.options.enumLimit === 0) return;
    if (this.strings >= values.size * this.options.enumMinRepeats) {
      schema.enum = [...values].sort();
    }
  }

  private describeObjects(schema: JsonObject): void {
    if (this.properties.size > 0) {
      const properties: JsonObject = {};
      for (const [key, shape] of this.properties) setOwn(properties, key, shape.toSchema());
      schema.properties = properties;
    }
    const required = [...this.properties].filter(([, shape]) => shape.seen === this.objects).map(([key]) => key);
    if (required.length > 0) schema.required = required;
    if (this.options.closed) schema.additionalProperties = false;
  }
}

/** Builds one schema that covers all the samples. With no samples it accepts anything. */
export function inferSchema(samples: JsonValue[], options: InferOptions = {}): JsonObject {
  const settings: Required<InferOptions> = {
    enumLimit: options.enumLimit ?? 0,
    enumMinRepeats: options.enumMinRepeats ?? 2,
    detectFormats: options.detectFormats ?? true,
    ranges: options.ranges ?? false,
    closed: options.closed ?? false,
  };
  const shape = new Shape(settings);
  for (const sample of samples) shape.add(sample);
  return { $schema: DIALECT, ...shape.toSchema() };
}
