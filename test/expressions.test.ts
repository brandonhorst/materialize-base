import {
  assertEquals,
  assertInstanceOf,
  assertStrictEquals,
} from "@std/assert";

import { buildEvaluationState } from "../src/expressions.ts";
import type { VaultFile } from "../src/types.ts";

function createTestFile(
  note: Record<string, unknown> = {},
): VaultFile {
  const timestamp = new Date("2024-01-01T00:00:00Z");

  const stat = {
    atime: timestamp,
    birthtime: timestamp,
    ctime: timestamp,
    isDirectory: false,
    isFile: true,
    isSymlink: false,
    mode: null,
    mtime: timestamp,
    size: 0,
  } as unknown as Deno.FileInfo;

  return {
    path: "note.md",
    relativePath: "note.md",
    name: "note",
    ext: "md",
    folder: "",
    stat,
    frontmatter: note,
    metadata: {},
    properties: {},
    tags: [],
    links: [],
    embeds: [],
    backlinks: [],
  };
}

function evaluateExpression(
  expression: string,
  note: Record<string, unknown> = {},
) {
  const file = createTestFile(note);
  const evaluation = buildEvaluationState(file, {});
  return evaluation.evaluate(expression, `test expression "${expression}"`);
}

Deno.test("adds durations to dates using string literals", () => {
  const result = evaluateExpression(
    'date("2024-01-01T00:00:00Z") + "1 day"',
  );

  assertInstanceOf(result, Date);
  assertEquals(result.toISOString(), "2024-01-02T00:00:00.000Z");
});

Deno.test("subtracts duration strings from dates", () => {
  const result = evaluateExpression(
    'date("2024-01-08T00:00:00Z") - "1 week"',
  );

  assertInstanceOf(result, Date);
  assertEquals(result.toISOString(), "2024-01-01T00:00:00.000Z");
});

Deno.test("adds numeric durations produced by duration()", () => {
  const result = evaluateExpression(
    'date("2024-01-01T00:00:00Z") + duration("2 days")',
  );

  assertInstanceOf(result, Date);
  assertEquals(result.toISOString(), "2024-01-03T00:00:00.000Z");
});

Deno.test("subtracts two dates to yield millisecond difference", () => {
  const result = evaluateExpression(
    'date("2024-01-08T00:00:00Z") - date("2024-01-01T00:00:00Z")',
  );

  assertStrictEquals(result, 7 * 24 * 60 * 60 * 1000);
});

Deno.test("supports nullish coalescing in expressions", () => {
  const result = evaluateExpression('note.status ?? "unset"', {
    status: null,
  });

  assertStrictEquals(result, "unset");
});

Deno.test("retains access to standard library helpers", () => {
  const result = evaluateExpression("Array.isArray(note.items)", {
    items: ["a", "b"],
  });

  assertStrictEquals(result, true);
});

Deno.test("invokes methods with the correct this context", () => {
  const result = evaluateExpression('(note.owner ?? "").toLowerCase()', {
    owner: "ALEX",
  });

  assertStrictEquals(result, "alex");
});
