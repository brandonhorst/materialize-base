import { parseArgs } from "@std/cli/parse-args";
import { parseBaseFile } from "./src/base-file.ts";
import { materialize } from "./src/materialize.ts";
import type { ObsidianBaseDefinition } from "./src/types.ts";
import { walkVault } from "./src/vault.ts";
import { getAncestorVaultPath } from "./src/vault-path.ts";

export async function resolveVaultPath(
  basePath: string,
  explicitVaultPath: string | undefined,
): Promise<string> {
  if (explicitVaultPath) {
    return explicitVaultPath;
  }

  console.error("CWD", Deno.cwd());
  console.error("Base Path", basePath);
  const inferredVaultPath = await getAncestorVaultPath(basePath);
  console.error("Inferred Vault Path", inferredVaultPath);
  if (inferredVaultPath) {
    return inferredVaultPath;
  }

  throw new Error(
    "Unable to determine vault path. Provide --vault or place the base within an Obsidian vault (with a .obsidian directory).",
  );
}

function fail(message: string, cause?: unknown): never {
  const details = cause instanceof Error ? `\n\n${cause.message}` : "";
  console.error(`${message}${details}`);
  Deno.exit(1);
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function renderMarkdownTable(rows: string[][]): string {
  if (rows.length === 0) {
    const placeholder = [""]; // ensure a minimal table
    return [`| ${escapeCell(placeholder[0])} |`, "| --- |"].join("\n");
  }

  const [header, ...body] = rows;
  const headerLine = `| ${header.map(escapeCell).join(" | ")} |`;
  const separator = `| ${header.map(() => "---").join(" | ")} |`;
  const bodyLines = body.map((row) => `| ${row.map(escapeCell).join(" | ")} |`);
  return [headerLine, separator, ...bodyLines].join("\n");
}

function printHelp(): void {
  console.log(
    [
      "Usage: materialize-base <base-path> [--view=<view-name>] [--vault=<path>]",
      "",
      "Arguments:",
      "  <base-path>              Required path to the Obsidian .base file to materialize.",
      "",
      "Options:",
      "  --view=<view-name>       View name to render. Defaults to the first view in the base.",
      "  --vault=<path>           Overrides the vault root. Defaults to the nearest ancestor",
      "                           directory containing a .obsidian directory.",
      "  --help                   Show this message.",
    ].join("\n"),
  );
}

async function main() {
  const argData = parseArgs(Deno.args, {
    string: ["view", "vault"],
    boolean: ["help"],
  });

  if (argData.help) {
    printHelp();
    return;
  }

  const [basePathArg] = argData._;
  if (!basePathArg || typeof basePathArg !== "string") {
    fail("Missing required base-path argument.");
  }

  const viewArg = typeof argData.view === "string" ? argData.view : undefined;
  const explicitVaultPath = typeof argData.vault === "string" &&
      argData.vault.length > 0
    ? argData.vault
    : undefined;
  let vaultPath: string;
  try {
    vaultPath = await resolveVaultPath(basePathArg, explicitVaultPath);
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Failed to determine vault path.";
    fail(message);
  }

  let baseData: ObsidianBaseDefinition;
  try {
    baseData = await parseBaseFile(basePathArg);
  } catch (error) {
    if (error instanceof Error) {
      const cause = error.cause instanceof Error ? error.cause : undefined;
      fail(error.message, cause);
    }
    fail("Failed to load base file.");
  }

  const originalViews = Array.isArray(baseData.views) ? baseData.views : [];
  if (originalViews.length === 0) {
    fail("Base file does not define any views.");
  }

  let selectedViewIndex = 0;
  if (viewArg) {
    selectedViewIndex = originalViews.findIndex(
      (view) => typeof view?.name === "string" && view.name === viewArg,
    );
    if (selectedViewIndex === -1) {
      fail(`View "${viewArg}" not found in base file.`);
    }
  }

  const selectedView = originalViews[selectedViewIndex];
  const selectedViewName =
    typeof selectedView.name === "string" && selectedView.name.length > 0
      ? selectedView.name
      : "Untitled view";

  const vaultFiles = await walkVault(vaultPath);

  const result = await materialize(baseData, selectedViewName, vaultFiles);
  const markdownTable = renderMarkdownTable(result);

  console.log(`# ${selectedViewName}`);
  if (markdownTable.length > 0) {
    console.log();
    console.log(markdownTable);
  }
}

if (import.meta.main) {
  await main();
}
