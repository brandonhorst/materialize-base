import type { ExpressionGlobals } from "./types.ts";
import { parseDuration } from "./duration.ts";

function cloneDate(input: Date): Date {
  return new Date(input.getTime());
}

function cloneDateWithStartOfDay(input: Date): Date {
  const result = cloneDate(input);
  result.setHours(0, 0, 0, 0);
  return result;
}

function parseDate(input: string | Date): Date {
  if (input instanceof Date) {
    return cloneDate(input);
  }

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.length === 0) {
      throw new Error("date() requires a non-empty string.");
    }
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Unable to parse date string "${input}".`);
    }
    return parsed;
  }

  throw new Error("date() requires a string or Date argument.");
}

function normalizePathInput(input: unknown): string | undefined {
  if (input instanceof URL) {
    return input.toString();
  }
  if (typeof input === "string") {
    const trimmed = input.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }
  if (input && typeof input === "object") {
    const record = input as Record<string, unknown>;
    const candidates = [
      record["path"],
      record["target"],
      record["url"],
      record["href"],
    ];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }
  }
  return undefined;
}

function createLinkObject(
  path: string,
  display?: unknown,
): Record<string, unknown> {
  const value: Record<string, unknown> = {
    path,
    isEmbed: false,
  };

  if (display !== undefined) {
    value.display = display;
  }

  return value;
}

function normalizeNumber(input: unknown): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) {
      throw new Error("number() requires finite numeric values.");
    }
    return input;
  }

  if (input instanceof Date) {
    return input.getTime();
  }

  if (typeof input === "boolean") {
    return input ? 1 : 0;
  }

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.length === 0) {
      throw new Error("number() cannot parse an empty string.");
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Unable to parse number from "${input}".`);
    }
    return parsed;
  }

  if (input === null || input === undefined) {
    throw new Error("number() cannot convert null or undefined.");
  }

  const primitive = Number(input);
  if (!Number.isFinite(primitive)) {
    throw new Error("number() requires convertible numeric values.");
  }

  return primitive;
}

function ensureNumericArguments(values: ReadonlyArray<number>): void {
  if (values.length === 0) {
    throw new Error("At least one value is required.");
  }
  for (const value of values) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      throw new Error("All arguments must be numbers.");
    }
  }
}

const GLOBAL_FUNCTIONS: ExpressionGlobals = {
  today(): Date {
    return cloneDateWithStartOfDay(new Date());
  },
  now(): Date {
    return new Date();
  },
  date(input: string | Date): Date {
    return parseDate(input);
  },
  duration(value: string): number {
    return parseDuration(value);
  },
  file(path: unknown): Record<string, unknown> {
    const resolved = normalizePathInput(path);
    if (!resolved) {
      throw new Error("file() requires a string, file, link, or URL value.");
    }

    return {
      path: resolved,
      isEmbed: false,
      asLink(display?: unknown) {
        return createLinkObject(resolved, display);
      },
    };
  },
  if<T>(condition: unknown, trueResult: T, falseResult?: T): T | null {
    const truthy = Boolean(condition);
    if (truthy) {
      return trueResult;
    }
    return falseResult ?? null;
  },
  image(path: unknown): string {
    const resolved = normalizePathInput(path);
    const source = resolved ?? "";
    return `![](${source})`;
  },
  icon(name: string): string {
    const normalized = typeof name === "string" && name.trim().length > 0
      ? name.trim()
      : "unknown";
    return `icon(${normalized})`;
  },
  link(path: unknown, display?: unknown): Record<string, unknown> {
    const resolved = normalizePathInput(path);
    if (!resolved) {
      throw new Error("link() requires a string or file-like value.");
    }
    return createLinkObject(resolved, display);
  },
  list(value: unknown): ReadonlyArray<unknown> {
    if (Array.isArray(value)) {
      return value;
    }
    return [value];
  },
  max(...values: ReadonlyArray<number>): number {
    ensureNumericArguments(values);
    return Math.max(...values);
  },
  min(...values: ReadonlyArray<number>): number {
    ensureNumericArguments(values);
    return Math.min(...values);
  },
  number(input: unknown): number {
    return normalizeNumber(input);
  },
};

export function createGlobalFunctionScope(): ExpressionGlobals {
  return { ...GLOBAL_FUNCTIONS };
}
