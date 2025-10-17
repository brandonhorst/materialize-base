const MILLISECONDS_IN_SECOND = 1_000;
const MILLISECONDS_IN_MINUTE = 60 * MILLISECONDS_IN_SECOND;
const MILLISECONDS_IN_HOUR = 60 * MILLISECONDS_IN_MINUTE;
const MILLISECONDS_IN_DAY = 24 * MILLISECONDS_IN_HOUR;
const MILLISECONDS_IN_WEEK = 7 * MILLISECONDS_IN_DAY;
const MILLISECONDS_IN_MONTH = 30 * MILLISECONDS_IN_DAY;
const MILLISECONDS_IN_YEAR = 365 * MILLISECONDS_IN_DAY;

const DURATION_UNIT_MULTIPLIERS = new Map<string, number>([
  ["y", MILLISECONDS_IN_YEAR],
  ["year", MILLISECONDS_IN_YEAR],
  ["years", MILLISECONDS_IN_YEAR],
  ["M", MILLISECONDS_IN_MONTH],
  ["month", MILLISECONDS_IN_MONTH],
  ["months", MILLISECONDS_IN_MONTH],
  ["w", MILLISECONDS_IN_WEEK],
  ["week", MILLISECONDS_IN_WEEK],
  ["weeks", MILLISECONDS_IN_WEEK],
  ["d", MILLISECONDS_IN_DAY],
  ["day", MILLISECONDS_IN_DAY],
  ["days", MILLISECONDS_IN_DAY],
  ["h", MILLISECONDS_IN_HOUR],
  ["hour", MILLISECONDS_IN_HOUR],
  ["hours", MILLISECONDS_IN_HOUR],
  ["m", MILLISECONDS_IN_MINUTE],
  ["min", MILLISECONDS_IN_MINUTE],
  ["mins", MILLISECONDS_IN_MINUTE],
  ["minute", MILLISECONDS_IN_MINUTE],
  ["minutes", MILLISECONDS_IN_MINUTE],
  ["s", MILLISECONDS_IN_SECOND],
  ["sec", MILLISECONDS_IN_SECOND],
  ["secs", MILLISECONDS_IN_SECOND],
  ["second", MILLISECONDS_IN_SECOND],
  ["seconds", MILLISECONDS_IN_SECOND],
]);

const DURATION_PATTERN =
  /(-?\d+(?:\.\d+)?)\s*(years?|y|months?|M|weeks?|w|days?|d|hours?|h|minutes?|mins?|min|m|seconds?|secs?|sec|s)/gi;

export function parseDuration(input: string): number {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new Error("duration() requires a non-empty string.");
  }

  DURATION_PATTERN.lastIndex = 0;
  let total = 0;
  let lastIndex = 0;
  let matched = false;
  let exec: RegExpExecArray | null;

  while ((exec = DURATION_PATTERN.exec(trimmed)) !== null) {
    matched = true;
    if (exec.index !== lastIndex) {
      const between = trimmed.slice(lastIndex, exec.index);
      if (/\S/.test(between)) {
        throw new Error(
          `Invalid duration segment "${between.trim()}" in "${input}".`,
        );
      }
    }

    const amount = Number.parseFloat(exec[1]);
    if (!Number.isFinite(amount)) {
      throw new Error(`Invalid duration value "${exec[1]}" in "${input}".`);
    }

    const unitRaw = exec[2];
    const multiplier = DURATION_UNIT_MULTIPLIERS.get(unitRaw) ??
      DURATION_UNIT_MULTIPLIERS.get(unitRaw.toLowerCase());
    if (multiplier === undefined) {
      throw new Error(`Unsupported duration unit "${unitRaw}" in "${input}".`);
    }

    total += amount * multiplier;
    lastIndex = DURATION_PATTERN.lastIndex;
  }

  if (!matched) {
    throw new Error(`Unable to parse duration string "${input}".`);
  }

  if (lastIndex < trimmed.length) {
    const remainder = trimmed.slice(lastIndex);
    if (/\S/.test(remainder)) {
      throw new Error(
        `Invalid trailing content "${remainder.trim()}" in "${input}".`,
      );
    }
  }

  return total;
}

export function tryParseDuration(input: unknown): number | null {
  if (typeof input !== "string") {
    return null;
  }

  try {
    return parseDuration(input);
  } catch {
    return null;
  }
}
