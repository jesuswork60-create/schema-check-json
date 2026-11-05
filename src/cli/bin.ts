#!/usr/bin/env node
import { readFileSync } from "node:fs";

import { Io } from "./input.js";
import { run } from "./main.js";

const io: Io = {
  readFile: (path) => readFileSync(path, "utf8"),
  readStdin: () => readFileSync(0, "utf8"),
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
};

process.exitCode = run(process.argv.slice(2), io);
