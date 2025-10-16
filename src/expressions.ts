import type { BaseFilter, BaseFormulaMap, VaultFile } from "./types.ts";

type CompiledExpression = {
  readonly argNames: string[];
  readonly evaluator: (...args: unknown[]) => unknown;
};

export interface EvaluationState {
  readonly scope: Record<string, unknown>;
  readonly evaluate: (expression: string, label: string) => unknown;
}

const RESERVED_IDENTIFIERS = new Set<string>([
  "arguments",
  "eval",
  "prototype",
  "constructor",
  "__proto__",
  "super",
  "globalThis",
  "window",
]);

const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function isValidIdentifier(identifier: string): boolean {
  return (
    IDENTIFIER_PATTERN.test(identifier) &&
    !RESERVED_IDENTIFIERS.has(identifier)
  );
}

function compileExpression(
  expression: string,
  scope: Record<string, unknown>,
): CompiledExpression {
  const argNames = Object.keys(scope);
  const evaluator = new Function(
    ...argNames,
    `"use strict"; return (${expression});`,
  ) as (...args: unknown[]) => unknown;
  return { argNames, evaluator };
}

function evaluateCompiled(
  compiled: CompiledExpression,
  scope: Record<string, unknown>,
): unknown {
  const args = compiled.argNames.map((name) => scope[name]);
  return compiled.evaluator(...args);
}

function normalizeListValue(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    return [value];
  }
  return value;
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  return undefined;
}

function createFileExpression(file: VaultFile): Record<string, unknown> {
  const {
    backlinks = [],
    embeds = [],
    links = [],
    tags = [],
    stat,
  } = file;

  const tagSet = new Set(tags.map((tag) => tag.toLowerCase()));
  const linkTargets = new Set(
    links.map((link) => link.target.trim().toLowerCase()),
  );
  const linkResolvedTargets = new Set(
    links
      .map((link) => link.resolvedPath?.trim().toLowerCase())
      .filter((target): target is string => typeof target === "string"),
  );

  const resolveLinkComparable = (input: unknown): string | undefined => {
    if (!input) return undefined;
    if (typeof input === "string") return input.trim().toLowerCase();
    if (typeof input === "object") {
      const record = input as Record<string, unknown>;
      if (typeof record["path"] === "string") {
        return (record["path"] as string).trim().toLowerCase();
      }
      if (typeof record["target"] === "string") {
        return (record["target"] as string).trim().toLowerCase();
      }
      if (typeof record["relativePath"] === "string") {
        return (record["relativePath"] as string).trim().toLowerCase();
      }
      if (typeof record["name"] === "string") {
        return (record["name"] as string).trim().toLowerCase();
      }
    }
    return undefined;
  };

  const fileExpression: Record<string, unknown> = {
    backlinks,
    ctime: stat.birthtime ?? stat.ctime ?? undefined,
    embeds,
    ext: file.ext,
    file: undefined,
    folder: file.folder,
    links,
    mtime: stat.mtime ?? undefined,
    name: file.name,
    path: file.relativePath,
    properties: file.properties ?? {},
    size: stat.size,
    tags,
    asLink(display?: string) {
      return {
        path: file.relativePath,
        display,
        isEmbed: false,
      };
    },
    hasLink(other: unknown): boolean {
      const comparable = resolveLinkComparable(other);
      if (!comparable) return false;
      if (linkTargets.has(comparable)) return true;
      if (linkResolvedTargets.has(comparable)) return true;
      return false;
    },
    hasProperty(name: unknown): boolean {
      if (typeof name !== "string") return false;
      const props = file.properties ?? {};
      return Object.prototype.hasOwnProperty.call(props, name);
    },
    hasTag(...values: unknown[]): boolean {
      const normalized = values
        .map((value) => normalizeString(value)?.toLowerCase())
        .filter((value): value is string => typeof value === "string");
      if (normalized.length === 0) return false;
      return normalized.some((value) => tagSet.has(value));
    },
    inFolder(folder: unknown): boolean {
      if (typeof folder !== "string") return false;
      return file.folder === folder || file.folder.startsWith(`${folder}/`);
    },
  };

  fileExpression.file = fileExpression;
  return fileExpression;
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return normalizeListValue(value)
      .map((entry) => formatValue(entry))
      .join(", ");
  }
  if (typeof value === "object") {
    if (
      "path" in (value as Record<string, unknown>) &&
      typeof (value as Record<string, unknown>)["path"] === "string"
    ) {
      const linkValue = value as Record<string, unknown>;
      const display = linkValue["display"];
      if (typeof display === "string" && display.length > 0) {
        return display;
      }
      return (linkValue["path"] as string) ?? "";
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function buildEvaluationState(
  file: VaultFile,
  formulas: BaseFormulaMap | undefined,
): EvaluationState {
  const note = file.frontmatter ?? {};
  const metadata = file.metadata ?? {};
  const properties = file.properties ?? {};
  const frontmatter = file.frontmatter ?? {};

  const scope: Record<string, unknown> = {
    file: createFileExpression(file),
    frontmatter,
    metadata,
    note,
    properties,
  };

  for (const [key, value] of Object.entries(note)) {
    if (
      !Object.prototype.hasOwnProperty.call(scope, key) &&
      typeof key === "string" &&
      isValidIdentifier(key)
    ) {
      scope[key] = value;
    }
  }

  const compiledExpressions = new Map<string, CompiledExpression>();
  const formulaCache = new Map<string, unknown>();
  const evaluating = new Set<string>();
  const formulaDefinitions = formulas ?? {};

  const evaluate = (expression: string, label: string): unknown => {
    const trimmed = typeof expression === "string" ? expression.trim() : "";
    if (trimmed.length === 0) {
      return undefined;
    }

    let compiled = compiledExpressions.get(trimmed);
    if (!compiled) {
      compiled = compileExpression(trimmed, scope);
      compiledExpressions.set(trimmed, compiled);
    }

    try {
      return evaluateCompiled(compiled, scope);
    } catch (error) {
      throw new Error(
        `Failed to evaluate ${label}`,
        { cause: error },
      );
    }
  };

  const formulaProxy = new Proxy<Record<string, unknown>>(
    {},
    {
      has(_target, propKey) {
        return typeof propKey === "string" &&
          Object.prototype.hasOwnProperty.call(formulaDefinitions, propKey);
      },
      get(_target, propKey, receiver) {
        if (typeof propKey !== "string") {
          return Reflect.get(_target, propKey, receiver);
        }

        if (formulaCache.has(propKey)) {
          return formulaCache.get(propKey);
        }

        if (
          !Object.prototype.hasOwnProperty.call(
            formulaDefinitions,
            propKey,
          )
        ) {
          return undefined;
        }

        if (evaluating.has(propKey)) {
          throw new Error(
            `Circular formula reference detected for "${propKey}"`,
          );
        }

        const expression = formulaDefinitions[propKey];
        if (typeof expression !== "string" || expression.trim().length === 0) {
          formulaCache.set(propKey, undefined);
          return undefined;
        }

        evaluating.add(propKey);
        try {
          const value = evaluate(expression, `formula "${propKey}"`);
          formulaCache.set(propKey, value);
          return value;
        } catch (error) {
          throw new Error(
            `Failed to evaluate formula "${propKey}"`,
            { cause: error },
          );
        } finally {
          evaluating.delete(propKey);
        }
      },
    },
  );

  scope.formula = formulaProxy;

  return { scope, evaluate };
}

function filterExpressionsValid(
  compound: Record<string, unknown>,
): boolean {
  return Object.keys(compound).every((key) =>
    key === "and" || key === "or" || key === "not"
  );
}

function ensureFilterList(
  value: unknown,
  description: string,
): ReadonlyArray<BaseFilter> {
  if (!Array.isArray(value)) {
    throw new Error(`${description} must be an array.`);
  }
  return value as ReadonlyArray<BaseFilter>;
}

function evaluateFilterLiteral(
  literal: string,
  evaluation: EvaluationState,
  context: string,
): boolean {
  const trimmed = literal.trim();
  if (trimmed.length === 0) return false;
  const label = `${context} expression "${trimmed}"`;
  const result = evaluation.evaluate(trimmed, label);
  return Boolean(result);
}

function evaluateFilterNode(
  node: BaseFilter,
  evaluation: EvaluationState,
  context: string,
): boolean {
  if (typeof node === "string") {
    return evaluateFilterLiteral(node, evaluation, context);
  }

  if (!node || typeof node !== "object" || Array.isArray(node)) {
    throw new Error("Filter entry must be a string or object.");
  }

  const compound = node as Record<string, unknown>;
  if (!filterExpressionsValid(compound)) {
    const invalidKeys = Object.keys(compound).filter((key) =>
      key !== "and" && key !== "or" && key !== "not"
    );
    throw new Error(
      `Filter contains unsupported keys: ${invalidKeys.join(", ")}`,
    );
  }

  if ("and" in compound) {
    const entries = ensureFilterList(compound["and"], `${context} "and" group`);
    for (const entry of entries) {
      if (!evaluateFilterNode(entry, evaluation, `${context} (and)`)) {
        return false;
      }
    }
  }

  if ("or" in compound) {
    const entries = ensureFilterList(compound["or"], `${context} "or" group`);
    if (entries.length === 0) {
      return false;
    }
    let matched = false;
    for (const entry of entries) {
      if (evaluateFilterNode(entry, evaluation, `${context} (or)`)) {
        matched = true;
        break;
      }
    }
    if (!matched) {
      return false;
    }
  }

  if ("not" in compound) {
    const entries = ensureFilterList(compound["not"], `${context} "not" group`);
    for (const entry of entries) {
      if (evaluateFilterNode(entry, evaluation, `${context} (not)`)) {
        return false;
      }
    }
  }

  return true;
}

export function matchesFilter(
  filter: BaseFilter | undefined,
  evaluation: EvaluationState,
  context: string,
): boolean {
  if (filter === undefined || filter === null) return true;
  try {
    return evaluateFilterNode(filter, evaluation, context);
  } catch (error) {
    throw new Error(`Failed to process ${context}`, { cause: error });
  }
}
