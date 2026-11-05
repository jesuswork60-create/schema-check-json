/** Loads documents for the commands, one per file or one per line of a JSONL file. */

import { JsonSyntaxError, parseJson, ParsedDocument } from "../json/parser.js";

/** What the commands need from the outside world. Tests pass a fake one. */
export interface Io {
  readFile(path: string): string;
  readStdin(): string;
  out(line: string): void;
  err(line: string): void;
}

/** A file or stream that couldn't be used at all. Not the same thing as data failing a schema. */
export class InputError extends Error {}

export interface Loaded {
  /** The name to show: the path, with :line added for JSONL records. */
  source: string;
  /** The line the document starts on, which is only above 1 for JSONL records. */
  firstLine: number;
  /** Whether this is one line of a JSONL file, whose positions are all on line 1. */
  record: boolean;
  document: ParsedDocument;
}

export function readSource(path: string, io: Io): string {
  try {
    return path === "-" ? io.readStdin() : io.readFile(path);
  } catch (error) {
    throw new InputError(`can't read ${path}: ${(error as Error).message}`);
  }
}

export function displayName(path: string): string {
  return path === "-" ? "(stdin)" : path;
}

/** Reads a document that the command can't go on without, such as the schema. */
export function loadRequired(path: string, io: Io): ParsedDocument {
  try {
    return parseJson(readSource(path, io));
  } catch (error) {
    if (error instanceof JsonSyntaxError) throw new InputError(`${displayName(path)}: ${error.message}`);
    throw error;
  }
}

export type LoadOutcome = { ok: true; loaded: Loaded } | { ok: false; source: string; message: string };

/** Yields each document of a data source. A broken one is reported and the rest still get read. */
export function* loadDocuments(path: string, jsonl: boolean, io: Io): Generator<LoadOutcome> {
  const name = displayName(path);
  const text = readSource(path, io);
  if (!jsonl) {
    yield parseOne(text, name, 1, false);
    return;
  }
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "") continue;
    yield parseOne(lines[i], `${name}:${i + 1}`, i + 1, true);
  }
}

function parseOne(text: string, source: string, firstLine: number, record: boolean): LoadOutcome {
  try {
    return { ok: true, loaded: { source, firstLine, record, document: parseJson(text) } };
  } catch (error) {
    if (error instanceof JsonSyntaxError) return { ok: false, source, message: error.message };
    throw error;
  }
}
