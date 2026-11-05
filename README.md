# schema-check-json

A JSON Schema validator for Node, written in TypeScript with no runtime dependencies. It follows
the 2020-12 draft for the keywords it supports, and it cares most about the part that usually gets
least attention: telling you what is wrong and where. Errors carry a line and column in the data
file, and anyOf and oneOf failures keep the details of each alternative.

It also checks schemas before using them (typos in type names, broken patterns, references to
nowhere, references that loop forever) and can draft a schema from sample documents.

## Install

There is no package on a registry. Clone the repository, then:

```
npm install
npm run build
```

The command line tool is then `node dist/src/cli/bin.js`. `npm link` puts it on your path as
`schema-check`. Node 22 or later is needed.

## Command line

The `examples` folder has a schema and some data to try it on:

```
$ schema-check validate --schema examples/person.schema.json examples/good.json examples/bad.json
examples/good.json: ok
examples/bad.json: invalid (4 errors)
  line 6, column 15: /nickname: is not allowed here
  line 3, column 10: /age: must be >= 0
  line 4, column 14: /contact: must match at least one of the alternatives
    alternative 1:
      line 4, column 25: /contact/email: must be a valid email
    alternative 2:
      line 4, column 14: /contact: is missing the property "phone"
  line 5, column 11: /tags: must not repeat items, but 0 and 1 are equal
```

`--best` keeps only the error most worth fixing first. `--jsonl` treats each line as a document, and
`--output json` prints one JSON object per document for other programs to read. A data file of `-`
means standard input.

`lint` checks schemas without any data, and `--strict` also refuses keywords it doesn't know, which
is how a misspelled `requird` gets caught:

```
$ schema-check lint --strict my.schema.json
my.schema.json: line 3, column 14: #/requird: unknown keyword requird
```

`infer` drafts a schema from samples. Treat the result as a starting point, since samples can only
show what the data happened to contain:

```
$ schema-check infer --jsonl --enum-limit 3 examples/people.jsonl
```

Exit codes are 0 when everything passed, 1 when data or a schema failed the check, and 2 when the
tool couldn't do its job at all (bad options, an unreadable file, a schema with problems).

## Library

```ts
import { Validator, bestMatch, formatError } from "schema-check-json";

const validator = new Validator({
  type: "object",
  required: ["sku"],
  properties: { sku: { type: "string", pattern: "^[A-Z]+-[0-9]+$" }, price: { multipleOf: 0.01 } },
});

const { valid, errors } = validator.validate({ sku: "abc", price: 4.35 });
if (!valid) console.log(formatError(bestMatch(errors)!));
// /sku: must match the pattern ^[A-Z]+-[0-9]+$
```

`new Validator` throws `SchemaError` when the schema has problems, and compiling once is meant to be
followed by many calls to `validate`. Options are `strict`, `checkFormats`, `formats` (your own
checks by name) and `failFast`.

Also exported: `checkSchema`, `inferSchema`, `parseJson` (a strict parser that knows positions and
duplicate keys), `leaves` and `formatTree`.

## What is covered

`type`, `enum`, `const`, the numeric limits and `multipleOf` (computed exactly, so 0.3 is a multiple
of 0.1), `minLength`, `maxLength` (in code points), `pattern`, `format`, `items`, `prefixItems`,
`contains`, `minContains`, `maxContains`, `minItems`, `maxItems`, `uniqueItems`, `properties`,
`patternProperties`, `additionalProperties`, `propertyNames`, `required`, `minProperties`,
`maxProperties`, `dependentRequired`, `dependentSchemas`, `allOf`, `anyOf`, `oneOf`, `not`, `if`,
`then`, `else`, boolean schemas, and `$ref` within the document.

Formats checked: `date`, `time`, `date-time`, `duration`, `email`, `hostname`, `ipv4`, `ipv6`, `uri`,
`uri-reference`, `uuid`, `regex`, `json-pointer`, `relative-json-pointer`. Any other name passes,
as the specification allows.

## Tests

```
npm test
```

This compiles everything and runs the `node:test` suites in `tests/`. It doesn't run the official
JSON Schema test suite, so conformance is only as good as the tests written here.

## Known limitations

- References must stay in the same document. `$id` is accepted but doesn't change how references
  resolve.
- `$anchor`, `$dynamicRef`, `unevaluatedProperties`, `unevaluatedItems`, and the older `dependencies`
  and `additionalItems` aren't supported. A schema that uses them is refused rather than quietly
  checked with them ignored.
- `$schema` isn't read. Every schema is treated as 2020-12, so a draft-07 schema that uses `items`
  as an array is refused.
- A `$ref` can point at anything inside the document. If it lands on a map such as `#/properties`,
  the map gets read as if it were a schema.
- Numbers are JavaScript doubles, so integers above 2^53 have already lost precision by the time a
  keyword sees them. That includes `multipleOf`.
- Patterns run on the JavaScript regular expression engine with the `u` flag. There is no protection
  from patterns that take exponential time, so don't compile schemas you don't trust.
- `hostname`, `email` and `uri` are ASCII only, and the internationalized formats aren't recognized,
  so `idn-email`, `iri` and friends always pass.
- `required` errors point at the object and not at a line for the missing key, since there is none.
  Columns count UTF-16 units, which a tab or an emoji can make look off.
- Duplicate keys in data only produce a warning, and the last value is the one validated.
- The CLI reads whole files into memory, JSONL included, and the parser keeps a position for every
  value. Very large inputs will use a lot of it.
- `bestMatch` is a heuristic, and it can pick something other than what you'd have fixed first.
