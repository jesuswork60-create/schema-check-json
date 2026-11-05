/** A small option parser. Each command says which flags and valued options it takes. */

export class UsageError extends Error {}

export interface OptionSpec {
  /** Options that stand alone, such as --strict. */
  flags: readonly string[];
  /** Options that take a value, either as --name value or --name=value. */
  valued: readonly string[];
}

export interface ParsedArgs {
  flags: Set<string>;
  values: Map<string, string>;
  positional: string[];
}

export function parseArgs(args: readonly string[], spec: OptionSpec): ParsedArgs {
  const parsed: ParsedArgs = { flags: new Set(), values: new Map(), positional: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") {
      parsed.positional.push(...args.slice(i + 1));
      break;
    }
    if (!arg.startsWith("--")) {
      // A lone - is an ordinary argument that means standard input.
      if (arg.startsWith("-") && arg !== "-") throw new UsageError(`unknown option ${arg}`);
      parsed.positional.push(arg);
      continue;
    }
    const equals = arg.indexOf("=");
    const name = equals === -1 ? arg : arg.slice(0, equals);
    if (spec.flags.includes(name)) {
      if (equals !== -1) throw new UsageError(`${name} doesn't take a value`);
      parsed.flags.add(name);
    } else if (spec.valued.includes(name)) {
      if (equals !== -1) {
        parsed.values.set(name, arg.slice(equals + 1));
      } else {
        i++;
        if (i >= args.length) throw new UsageError(`${name} needs a value`);
        parsed.values.set(name, args[i]);
      }
    } else {
      throw new UsageError(`unknown option ${name}`);
    }
  }
  return parsed;
}

export function requireCount(parsed: ParsedArgs, name: string, fallback: number): number {
  const text = parsed.values.get(name);
  if (text === undefined) return fallback;
  if (!/^[0-9]+$/.test(text)) throw new UsageError(`${name} must be a whole number, not ${text}`);
  return Number(text);
}
