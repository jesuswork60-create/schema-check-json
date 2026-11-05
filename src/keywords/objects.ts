/** Keywords for objects. Each ignores values of other types. */

import { ValidationError } from "../errors.js";
import { join } from "../json/pointer.js";
import { hasOwn, isObject, JsonObject, JsonValue } from "../json/values.js";
import { apply, CompiledNode, counted, failure, KeywordCompiler, NONE } from "./types.js";

export const properties: KeywordCompiler = (value, context) => {
  const schemas = value as JsonObject;
  const at = join(context.path, "properties");
  const nodes: [string, CompiledNode][] = Object.keys(schemas).map((key) => [key, context.compile(schemas[key], join(at, key))]);
  return (instance, path, failFast) => {
    if (!isObject(instance)) return NONE;
    const errors: ValidationError[] = [];
    for (const [key, node] of nodes) {
      if (!hasOwn(instance, key)) continue;
      errors.push(...apply(node, instance[key], join(path, key), failFast));
      if (failFast && errors.length > 0) break;
    }
    return errors;
  };
};

export const patternProperties: KeywordCompiler = (value, context) => {
  const schemas = value as JsonObject;
  const at = join(context.path, "patternProperties");
  const entries = Object.keys(schemas).map((source) => ({
    regex: new RegExp(source, "u"),
    node: context.compile(schemas[source], join(at, source)),
  }));
  return (instance, path, failFast) => {
    if (!isObject(instance)) return NONE;
    const errors: ValidationError[] = [];
    for (const key of Object.keys(instance)) {
      for (const { regex, node } of entries) {
        if (!regex.test(key)) continue;
        errors.push(...apply(node, instance[key], join(path, key), failFast));
        if (failFast && errors.length > 0) return errors;
      }
    }
    return errors;
  };
};

export const additionalProperties: KeywordCompiler = (value, context) => {
  const node = context.compile(value, join(context.path, "additionalProperties"));
  const named = isObject(context.schema.properties) ? context.schema.properties : {};
  const patterns = isObject(context.schema.patternProperties)
    ? Object.keys(context.schema.patternProperties).map((source) => new RegExp(source, "u"))
    : [];
  return (instance, path, failFast) => {
    if (!isObject(instance)) return NONE;
    const errors: ValidationError[] = [];
    for (const key of Object.keys(instance)) {
      if (hasOwn(named, key) || patterns.some((regex) => regex.test(key))) continue;
      if (value === false) {
        errors.push(failure(context, "additionalProperties", join(path, key), "is not allowed here", { property: key }));
      } else {
        errors.push(...apply(node, instance[key], join(path, key), failFast));
      }
      if (failFast && errors.length > 0) break;
    }
    return errors;
  };
};

export const propertyNames: KeywordCompiler = (value, context) => {
  const node = context.compile(value, join(context.path, "propertyNames"));
  return (instance, path, failFast) => {
    if (!isObject(instance)) return NONE;
    const errors: ValidationError[] = [];
    for (const key of Object.keys(instance)) {
      const problems = apply(node, key, path, true);
      if (problems.length > 0) {
        errors.push(failure(context, "propertyNames", path, `has a bad property name ${JSON.stringify(key)}: ${problems[0].message}`, { property: key }));
        if (failFast) break;
      }
    }
    return errors;
  };
};

export const required: KeywordCompiler = (value, context) => {
  const names = value as string[];
  return (instance, path) => {
    if (!isObject(instance)) return NONE;
    const missing = names.filter((name) => !hasOwn(instance, name));
    return missing.map((name) => failure(context, "required", path, `is missing the property ${JSON.stringify(name)}`, { property: name }));
  };
};

export const minProperties: KeywordCompiler = (value, context) => {
  const limit = value as number;
  return (instance, path) => {
    if (!isObject(instance) || Object.keys(instance).length >= limit) return NONE;
    return [failure(context, "minProperties", path, `must have at least ${counted(limit, "property", "properties")}`, { limit })];
  };
};

export const maxProperties: KeywordCompiler = (value, context) => {
  const limit = value as number;
  return (instance, path) => {
    if (!isObject(instance) || Object.keys(instance).length <= limit) return NONE;
    return [failure(context, "maxProperties", path, `must have at most ${counted(limit, "property", "properties")}`, { limit })];
  };
};

export const dependentRequired: KeywordCompiler = (value, context) => {
  const rules = value as Record<string, string[]>;
  return (instance, path) => {
    if (!isObject(instance)) return NONE;
    const errors: ValidationError[] = [];
    for (const trigger of Object.keys(rules)) {
      if (!hasOwn(instance, trigger)) continue;
      for (const name of rules[trigger]) {
        if (hasOwn(instance, name)) continue;
        const message = `must have ${JSON.stringify(name)} because it has ${JSON.stringify(trigger)}`;
        errors.push(failure(context, "dependentRequired", path, message, { property: name, because: trigger }));
      }
    }
    return errors;
  };
};

export const dependentSchemas: KeywordCompiler = (value, context) => {
  const schemas = value as JsonObject;
  const at = join(context.path, "dependentSchemas");
  const entries: [string, CompiledNode][] = Object.keys(schemas).map((key) => [key, context.compile(schemas[key] as JsonValue, join(at, key))]);
  return (instance, path, failFast) => {
    if (!isObject(instance)) return NONE;
    const errors: ValidationError[] = [];
    for (const [trigger, node] of entries) {
      if (!hasOwn(instance, trigger)) continue;
      errors.push(...apply(node, instance, path, failFast));
      if (failFast && errors.length > 0) break;
    }
    return errors;
  };
};
