import type {
  BaseFormulaMap,
  BasePropertyMap,
  ObsidianBaseDefinition,
  VaultFile,
} from "./types.ts";
import {
  buildEvaluationState,
  formatValue,
  matchesFilter,
} from "./expressions.ts";
import type { EvaluationState } from "./expressions.ts";

function deriveColumnKeys(
  viewOrder: ReadonlyArray<unknown> | undefined,
  propertyMap: BasePropertyMap | undefined,
  formulas: BaseFormulaMap | undefined,
): string[] {
  const ordered = Array.isArray(viewOrder)
    ? viewOrder.filter((entry): entry is string => typeof entry === "string")
    : [];
  if (ordered.length > 0) {
    return ordered;
  }

  const propertyKeys = propertyMap ? Object.keys(propertyMap) : [];
  if (propertyKeys.length > 0) {
    return propertyKeys;
  }

  const formulaKeys = formulas
    ? Object.keys(formulas).map((key) => `formula.${key}`)
    : [];

  return formulaKeys;
}

function resolveDisplayName(
  propertyKey: string,
  propertyMap: BasePropertyMap | undefined,
): string {
  const definition = propertyMap?.[propertyKey];
  const displayName = typeof definition?.displayName === "string"
    ? definition.displayName
    : undefined;
  if (displayName && displayName.length > 0) {
    return displayName;
  }
  return propertyKey;
}

export function materialize(
  baseDefinition: ObsidianBaseDefinition,
  viewName: string,
  vaultFiles: VaultFile[],
): string[][] {
  const views = Array.isArray(baseDefinition.views) ? baseDefinition.views : [];
  const selectedView = views.find(
    (view) => typeof view?.name === "string" && view.name === viewName,
  ) ?? views[0];

  if (!selectedView) {
    return [];
  }

  const propertyMap = baseDefinition.properties;
  const formulas = baseDefinition.formulas;
  const columnKeys = deriveColumnKeys(
    selectedView.order,
    propertyMap,
    formulas,
  );

  if (columnKeys.length === 0) {
    return [];
  }

  const header = columnKeys.map((key) => resolveDisplayName(key, propertyMap));
  const rows: string[][] = [header];

  const matches: Array<{
    readonly file: VaultFile;
    readonly evaluation: EvaluationState;
  }> = [];

  for (const file of vaultFiles) {
    const evaluation = buildEvaluationState(file, formulas);
    const baseContext = `base filters for file "${file.relativePath}"`;
    const viewLabel = typeof selectedView.name === "string"
      ? selectedView.name
      : viewName;
    const viewContext =
      `view "${viewLabel}" filters for file "${file.relativePath}"`;

    if (!matchesFilter(baseDefinition.filters, evaluation, baseContext)) {
      continue;
    }

    if (!matchesFilter(selectedView.filters, evaluation, viewContext)) {
      continue;
    }

    matches.push({ file, evaluation });
  }

  const limitValue = selectedView.limit;
  const limit = typeof limitValue === "number" &&
      Number.isFinite(limitValue) &&
      limitValue > 0
    ? Math.floor(limitValue)
    : undefined;

  const limitedMatches = typeof limit === "number"
    ? matches.slice(0, limit)
    : matches;

  for (const { evaluation, file } of limitedMatches) {
    const row: string[] = [];

    for (const columnKey of columnKeys) {
      try {
        const value = evaluation.evaluate(columnKey, `property "${columnKey}"`);
        row.push(formatValue(value));
      } catch (error) {
        throw new Error(
          `Failed to evaluate property "${columnKey}" for file "${file.relativePath}"`,
          { cause: error },
        );
      }
    }

    rows.push(row);
  }

  return rows;
}
