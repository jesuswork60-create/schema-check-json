import { ValidationError } from "../src/errors.js";
import { Io } from "../src/cli/input.js";
import { Validator, ValidatorOptions } from "../src/validator.js";

export function isValid(schema: unknown, value: unknown, options?: ValidatorOptions): boolean {
  return new Validator(schema, options).isValid(value);
}

export function errorsOf(schema: unknown, value: unknown, options?: ValidatorOptions): ValidationError[] {
  return new Validator(schema, options).validate(value).errors;
}

export interface FakeIo extends Io {
  stdout: string[];
  stderr: string[];
}

export function fakeIo(files: Record<string, string> = {}, stdin = ""): FakeIo {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    readFile(path) {
      if (!Object.prototype.hasOwnProperty.call(files, path)) throw new Error("no such file");
      return files[path];
    },
    readStdin: () => stdin,
    out: (line) => void stdout.push(line),
    err: (line) => void stderr.push(line),
  };
}
