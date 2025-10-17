import jsep from "jsep";
import type {
  ArrayExpression as JsepArrayExpression,
  BinaryExpression as JsepBinaryExpression,
  CallExpression as JsepCallExpression,
  Compound as JsepCompound,
  ConditionalExpression as JsepConditionalExpression,
  Expression as JsepExpression,
  Identifier as JsepIdentifier,
  Literal as JsepLiteral,
  MemberExpression as JsepMemberExpression,
  SequenceExpression as JsepSequenceExpression,
  UnaryExpression as JsepUnaryExpression,
} from "jsep";
import regexPlugin from "@jsep-plugin/regex";

import type { BaseFilter, BaseFormulaMap, VaultFile } from "./types.ts";
import { createGlobalFunctionScope } from "./global-functions.ts";
import { tryParseDuration } from "./duration.ts";

type CompiledExpression = {
  readonly ast: JsepExpression;
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
  // JavaScript keywords that collide with Obsidian function names.
  "if",
]);

const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const IDENTIFIER_CHAR_PATTERN = /[A-Za-z0-9_$]/;

const GLOBAL_FUNCTION_ALIASES: Record<string, string> = {
  "if": "_if",
  "file": "_fileFn",
};

jsep.plugins.register(regexPlugin);
jsep.addLiteral("undefined", undefined);
jsep.addLiteral("Infinity", Infinity);
jsep.addLiteral("NaN", Number.NaN);
try {
  jsep.addBinaryOp("??", 2);
} catch {
  // Operator already registered.
}

function isIdentifierCharacter(char: string | undefined): boolean {
  if (!char) return false;
  return IDENTIFIER_CHAR_PATTERN.test(char);
}

function normalizeExpressionSource(expression: string): string {
  let result = "";
  let index = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escaping = false;

  while (index < expression.length) {
    const char = expression[index];

    if (inSingle) {
      result += char;
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === "'") {
        inSingle = false;
      }
      index += 1;
      continue;
    }

    if (inDouble) {
      result += char;
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === '"') {
        inDouble = false;
      }
      index += 1;
      continue;
    }

    if (inTemplate) {
      result += char;
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === "`") {
        inTemplate = false;
      }
      index += 1;
      continue;
    }

    if (char === "'") {
      inSingle = true;
      result += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      inDouble = true;
      result += char;
      index += 1;
      continue;
    }

    if (char === "`") {
      inTemplate = true;
      result += char;
      index += 1;
      continue;
    }

    let replaced = false;

    for (const [name, alias] of Object.entries(GLOBAL_FUNCTION_ALIASES)) {
      if (!expression.startsWith(name, index)) continue;

      const previousChar = expression[index - 1];
      const nextChar = expression[index + name.length];

      if (
        isIdentifierCharacter(previousChar) ||
        previousChar === "." ||
        isIdentifierCharacter(nextChar)
      ) {
        continue;
      }

      let probe = index + name.length;
      while (probe < expression.length && /\s/.test(expression[probe])) {
        probe += 1;
      }

      if (expression[probe] === "(") {
        result += alias;
        index += name.length;
        replaced = true;
        break;
      }
    }

    if (replaced) {
      continue;
    }

    result += char;
    index += 1;
  }

  return result;
}

function isValidIdentifier(identifier: string): boolean {
  return (
    IDENTIFIER_PATTERN.test(identifier) &&
    !RESERVED_IDENTIFIERS.has(identifier)
  );
}

type ScopeValues = Record<string, unknown>;
type JsValue =
  | number
  | string
  | boolean
  | bigint
  | symbol
  | null
  | undefined
  | object;

const BUILTIN_SCOPE_ENTRIES: Record<string, unknown> = {
  Array,
  Boolean,
  Date,
  JSON,
  Map,
  Math,
  Number,
  Object,
  Reflect,
  RegExp,
  Set,
  String,
  Symbol,
  WeakMap,
  WeakSet,
  BigInt,
};

function hasScopeIdentifier(scope: ScopeValues, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(scope, name);
}

function toPropertyKey(value: unknown): PropertyKey {
  if (typeof value === "string" || typeof value === "symbol") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return String(value);
}

function ensureTargetObject(value: unknown): object | Function {
  if (value === null || value === undefined) {
    throw new TypeError(`Cannot read properties of ${value}`);
  }
  if (typeof value === "object" || typeof value === "function") {
    return value as object | Function;
  }
  return Object(value);
}

function toNumeric(value: unknown): number {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  return Number(value);
}

function toNullishAwareDuration(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "string") {
    const parsed = tryParseDuration(value);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
}

function nativeAdd(left: unknown, right: unknown): unknown {
  // deno-lint-ignore no-explicit-any
  return (left as any) + (right as any);
}

function nativeCompare(
  operator: ">" | "<" | ">=" | "<=",
  left: unknown,
  right: unknown,
): boolean {
  // deno-lint-ignore no-explicit-any
  const lhs = left as any;
  // deno-lint-ignore no-explicit-any
  const rhs = right as any;
  switch (operator) {
    case ">":
      return lhs > rhs;
    case "<":
      return lhs < rhs;
    case ">=":
      return lhs >= rhs;
    case "<=":
      return lhs <= rhs;
  }
}

function applyAddition(left: unknown, right: unknown): unknown {
  if (left instanceof Date) {
    const duration = toNullishAwareDuration(right);
    if (duration !== null) {
      return new Date(left.getTime() + duration);
    }
  }

  if (right instanceof Date) {
    const duration = toNullishAwareDuration(left);
    if (duration !== null) {
      return new Date(right.getTime() + duration);
    }
  }

  return nativeAdd(left, right);
}

function applySubtraction(left: unknown, right: unknown): unknown {
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() - right.getTime();
  }

  if (left instanceof Date) {
    const duration = toNullishAwareDuration(right);
    if (duration !== null) {
      return new Date(left.getTime() - duration);
    }
  }

  return toNumeric(left) - toNumeric(right);
}

function createRegExpLiteral(literal: JsepLiteral): RegExp {
  const regexData = (literal as JsepLiteral & {
    regex?: { pattern: string; flags?: string };
  }).regex;
  if (!regexData) {
    throw new Error("Expected regex metadata on literal.");
  }
  return new RegExp(regexData.pattern, regexData.flags);
}

function evaluateLiteral(node: JsepLiteral): unknown {
  const regexData = (node as JsepLiteral & {
    regex?: { pattern: string; flags?: string };
  }).regex;
  if (regexData) {
    return createRegExpLiteral(node);
  }
  return node.value;
}

interface ResolvedMember {
  readonly objectValue: unknown;
  readonly propertyKey: PropertyKey;
  readonly value: unknown;
}

function resolveMemberExpression(
  node: JsepMemberExpression,
  scope: ScopeValues,
): ResolvedMember {
  const objectValue = evaluateExpressionNode(node.object, scope);
  const propertyValue = node.computed
    ? evaluateExpressionNode(node.property, scope)
    : (node.property as JsepIdentifier).name;
  const propertyKey = node.computed
    ? toPropertyKey(propertyValue)
    : (node.property as JsepIdentifier).name;

  const target = ensureTargetObject(objectValue);
  const value = Reflect.get(
    target as Record<PropertyKey, unknown>,
    propertyKey,
  );

  return { objectValue, propertyKey, value };
}

function evaluateIdentifier(
  node: JsepIdentifier,
  scope: ScopeValues,
): unknown {
  if (hasScopeIdentifier(scope, node.name)) {
    return scope[node.name];
  }
  throw new ReferenceError(`"${node.name}" is not defined`);
}

function evaluateUnaryExpression(
  node: JsepUnaryExpression,
  scope: ScopeValues,
): unknown {
  if (node.operator === "typeof" && node.argument.type === "Identifier") {
    const identifier = node.argument as JsepIdentifier;
    if (!hasScopeIdentifier(scope, identifier.name)) {
      return "undefined";
    }
  }

  const argument = evaluateExpressionNode(node.argument, scope);

  switch (node.operator) {
    case "!":
      return !argument;
    case "+":
      return +toNumeric(argument);
    case "-":
      return -toNumeric(argument);
    case "~":
      return ~Number(argument);
    case "typeof":
      return typeof argument;
    case "void":
      return undefined;
    default:
      throw new Error(`Unsupported unary operator "${node.operator}".`);
  }
}

function evaluateBinaryExpression(
  node: JsepBinaryExpression,
  scope: ScopeValues,
): unknown {
  if (node.operator === "&&") {
    const left = evaluateExpressionNode(node.left, scope);
    if (!left) {
      return left;
    }
    return evaluateExpressionNode(node.right, scope);
  }

  if (node.operator === "||") {
    const left = evaluateExpressionNode(node.left, scope);
    if (left) {
      return left;
    }
    return evaluateExpressionNode(node.right, scope);
  }

  if (node.operator === "??") {
    const left = evaluateExpressionNode(node.left, scope);
    return evaluateNullishCoalescing(
      left,
      () => evaluateExpressionNode(node.right, scope),
    );
  }

  const left = evaluateExpressionNode(node.left, scope);
  const right = evaluateExpressionNode(node.right, scope);

  switch (node.operator) {
    case "+":
      return applyAddition(left, right);
    case "-":
      return applySubtraction(left, right);
    case "*":
      return toNumeric(left) * toNumeric(right);
    case "/":
      return toNumeric(left) / toNumeric(right);
    case "%":
      return toNumeric(left) % toNumeric(right);
    case "**":
      return toNumeric(left) ** toNumeric(right);
    case "==":
      return (left as JsValue) == (right as JsValue);
    case "!=":
      return (left as JsValue) != (right as JsValue);
    case "===":
      return left === right;
    case "!==":
      return left !== right;
    case ">":
      return nativeCompare(">", left, right);
    case "<":
      return nativeCompare("<", left, right);
    case ">=":
      return nativeCompare(">=", left, right);
    case "<=":
      return nativeCompare("<=", left, right);
    case "instanceof":
      if (typeof right !== "function") {
        throw new TypeError("Right-hand side of instanceof must be callable.");
      }
      return (left as object) instanceof (right as Function);
    case "in": {
      if (
        (typeof right !== "object" || right === null) &&
        typeof right !== "function"
      ) {
        throw new TypeError(
          "Right-hand side of 'in' should be an object or function.",
        );
      }
      const key = toPropertyKey(left);
      return key in (right as Record<PropertyKey, unknown>);
    }
    default:
      throw new Error(`Unsupported binary operator "${node.operator}".`);
  }
}

function evaluateNullishCoalescing(
  left: unknown,
  getRight: () => unknown,
): unknown {
  if (left !== null && left !== undefined) {
    return left;
  }
  return getRight();
}

function evaluateConditionalExpression(
  node: JsepConditionalExpression,
  scope: ScopeValues,
): unknown {
  const test = evaluateExpressionNode(node.test, scope);
  if (test) {
    return evaluateExpressionNode(node.consequent, scope);
  }
  return evaluateExpressionNode(node.alternate, scope);
}

function evaluateCallExpression(
  node: JsepCallExpression,
  scope: ScopeValues,
): unknown {
  let callable: unknown;
  let thisValue: unknown = undefined;

  if (node.callee.type === "MemberExpression") {
    const resolved = resolveMemberExpression(
      node.callee as JsepMemberExpression,
      scope,
    );
    callable = resolved.value;
    thisValue = resolved.objectValue;
  } else {
    callable = evaluateExpressionNode(node.callee, scope);
  }

  if (typeof callable !== "function") {
    throw new TypeError("Attempted to call a non-function value.");
  }

  const args = node.arguments.map((arg) => evaluateExpressionNode(arg, scope));
  return (callable as (...args: unknown[]) => unknown).apply(thisValue, args);
}

function evaluateMemberAccess(
  node: JsepMemberExpression,
  scope: ScopeValues,
): unknown {
  return resolveMemberExpression(node, scope).value;
}

function evaluateArrayExpression(
  node: JsepArrayExpression,
  scope: ScopeValues,
): unknown[] {
  const result: unknown[] = [];
  for (const element of node.elements) {
    if (element === null) {
      result.push(undefined);
      continue;
    }
    result.push(evaluateExpressionNode(element, scope));
  }
  return result;
}

function evaluateSequenceExpression(
  node: JsepSequenceExpression,
  scope: ScopeValues,
): unknown {
  let value: unknown = undefined;
  for (const expression of node.expressions) {
    value = evaluateExpressionNode(expression, scope);
  }
  return value;
}

function evaluateCompoundExpression(
  node: JsepCompound,
  scope: ScopeValues,
): unknown {
  let value: unknown = undefined;
  for (const entry of node.body) {
    value = evaluateExpressionNode(entry, scope);
  }
  return value;
}

function evaluateExpressionNode(
  node: JsepExpression,
  scope: ScopeValues,
): unknown {
  switch (node.type) {
    case "ArrayExpression":
      return evaluateArrayExpression(node as JsepArrayExpression, scope);
    case "BinaryExpression":
      return evaluateBinaryExpression(node as JsepBinaryExpression, scope);
    case "CallExpression":
      return evaluateCallExpression(node as JsepCallExpression, scope);
    case "Compound":
      return evaluateCompoundExpression(node as JsepCompound, scope);
    case "ConditionalExpression":
      return evaluateConditionalExpression(
        node as JsepConditionalExpression,
        scope,
      );
    case "Identifier":
      return evaluateIdentifier(node as JsepIdentifier, scope);
    case "Literal":
      return evaluateLiteral(node as JsepLiteral);
    case "MemberExpression":
      return evaluateMemberAccess(node as JsepMemberExpression, scope);
    case "SequenceExpression":
      return evaluateSequenceExpression(
        node as JsepSequenceExpression,
        scope,
      );
    case "ThisExpression":
      if (hasScopeIdentifier(scope, "this")) {
        return scope["this"];
      }
      return undefined;
    case "UnaryExpression":
      return evaluateUnaryExpression(node as JsepUnaryExpression, scope);
    default:
      throw new Error(`Unsupported expression node "${node.type}".`);
  }
}

function compileExpression(
  expression: string,
): CompiledExpression {
  try {
    const ast = jsep(expression);
    return { ast };
  } catch (error) {
    throw new Error(
      `Failed to parse expression "${expression}"`,
      { cause: error },
    );
  }
}

function evaluateCompiled(
  compiled: CompiledExpression,
  scope: ScopeValues,
): unknown {
  return evaluateExpressionNode(compiled.ast, scope);
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

  const scope: Record<string, unknown> = Object.create(null);
  scope.file = createFileExpression(file);
  scope.frontmatter = frontmatter;
  scope.metadata = metadata;
  scope.note = note;
  scope.properties = properties;

  const globalFunctions = createGlobalFunctionScope();
  const globalFunctionKeys = new Set(Object.keys(globalFunctions));

  for (const [key, value] of Object.entries(note)) {
    if (
      !Object.prototype.hasOwnProperty.call(scope, key) &&
      typeof key === "string" &&
      isValidIdentifier(key) &&
      !globalFunctionKeys.has(key)
    ) {
      scope[key] = value;
    }
  }

  for (const [key, value] of Object.entries(globalFunctions)) {
    if (!Object.prototype.hasOwnProperty.call(scope, key)) {
      scope[key] = value;
    }

    const alias = GLOBAL_FUNCTION_ALIASES[key];
    if (
      alias &&
      !Object.prototype.hasOwnProperty.call(scope, alias)
    ) {
      scope[alias] = value;
    }
  }

  for (const [key, value] of Object.entries(BUILTIN_SCOPE_ENTRIES)) {
    if (!Object.prototype.hasOwnProperty.call(scope, key)) {
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

    const normalized = normalizeExpressionSource(trimmed);

    let compiled = compiledExpressions.get(normalized);
    if (!compiled) {
      compiled = compileExpression(normalized);
      compiledExpressions.set(normalized, compiled);
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
