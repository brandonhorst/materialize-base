import { assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path/join";
import { fromFileUrl } from "@std/path/from-file-url";

const decoder = new TextDecoder();
const projectRoot = fromFileUrl(new URL("../", import.meta.url));
const moduleEntryPath = join(projectRoot, "module.ts");
const testVaultDir = join(projectRoot, "test-vault");

interface RunCliOptions {
  readonly view?: string;
  readonly omitVaultPath?: boolean;
  readonly cwd?: string;
}

interface RunCommandOptions {
  readonly cwd?: string;
}

async function runCli(
  baseRelativePath: string,
  options: RunCliOptions = {},
) {
  const args = [
    "run",
    "--allow-read",
    moduleEntryPath,
    baseRelativePath,
  ];

  if (options.view) {
    args.push("--view", options.view);
  }

  if (!options.omitVaultPath) {
    args.push("--vault-path", "test-vault");
  }

  return await runCliCommand(args, { cwd: options.cwd });
}

async function runCliCommand(
  args: string[],
  options: RunCommandOptions = {},
) {
  const command = new Deno.Command(Deno.execPath(), {
    args,
    cwd: options.cwd ?? projectRoot,
  });

  const { code, stdout, stderr } = await command.output();
  return {
    code,
    stdout: decoder.decode(stdout).replaceAll("\r\n", "\n"),
    stderr: decoder.decode(stderr),
  };
}

function extractTableLines(stdout: string, viewName: string): string[] {
  const marker = `# ${viewName}`;
  const markerIndex = stdout.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`View "${viewName}" not found in output:\n${stdout}`);
  }

  const afterMarker = stdout.slice(markerIndex + marker.length);
  const tableStartIndex = afterMarker.indexOf("|");
  if (tableStartIndex === -1) {
    return [];
  }

  const tableText = afterMarker.slice(tableStartIndex).split("\n");
  const lines: string[] = [];

  for (const line of tableText) {
    if (!line.trim().startsWith("|")) {
      break;
    }
    lines.push(line.trimEnd());
  }

  return lines;
}

interface TableOptions {
  readonly sortRows?: boolean;
}

function assertTableEquals(
  actual: string[],
  expected: string[],
  options: TableOptions = {},
) {
  const sortRows = options.sortRows ?? false;

  assertEquals(
    actual.length >= 2,
    true,
    "Table output should include at least a header and separator row.",
  );
  assertEquals(actual[0], expected[0], "Header row mismatch.");
  assertEquals(actual[1], expected[1], "Separator row mismatch.");

  const actualRows = actual.slice(2);
  const expectedRows = expected.slice(2);

  if (sortRows) {
    actualRows.sort();
    expectedRows.sort();
  }

  assertEquals(actualRows, expectedRows, "Table rows mismatch.");
}

Deno.test("CLI renders expected markdown for the demo vault", async () => {
  const { code, stdout, stderr } = await runCli("test-vault/simple.base");

  assertEquals(code, 0, `CLI exited with ${code}. stderr:\n${stderr}`);
  assertEquals(stderr, "", "Expected no stderr output from CLI run.");

  const expected = [
    "| Title | file.name | Shouting |",
    "| --- | --- | --- |",
    "| Brainstorm Ideas | ideas | BRAINSTORM IDEAS |",
    "| Realize Base Roadmap | project-overview | REALIZE BASE ROADMAP |",
    "| Project Template | project-template | PROJECT TEMPLATE |",
    "| Project Beta Support | project-beta | PROJECT BETA SUPPORT |",
    "| Project Alpha Launch | project-alpha | PROJECT ALPHA LAUNCH |",
    "| Research Gamma Exploration | research-gamma | RESEARCH GAMMA EXPLORATION |",
  ];

  const table = extractTableLines(stdout, "Tagged notes");
  assertTableEquals(table, expected, { sortRows: true });
});

Deno.test("CLI renders project summary view with advanced formulas", async () => {
  const { code, stdout, stderr } = await runCli("test-vault/projects.base");

  assertEquals(code, 0, `CLI exited with ${code}. stderr:\n${stderr}`);
  assertEquals(stderr, "", "Expected no stderr output from CLI run.");

  const expected = [
    "| Project | Normalized Status | Total Effort | High Effort? | Linked to Sync? |",
    "| --- | --- | --- | --- | --- |",
    "| Project Alpha Launch | active | 5 | false | true |",
    "| Research Gamma Exploration | planning | 8 | true | false |",
  ];

  const table = extractTableLines(stdout, "Project Summary");
  assertTableEquals(table, expected, { sortRows: true });
});

Deno.test("CLI limits archived project view results", async () => {
  const { code, stdout, stderr } = await runCli(
    "test-vault/projects.base",
    { view: "Archived Projects" },
  );

  assertEquals(code, 0, `CLI exited with ${code}. stderr:\n${stderr}`);
  assertEquals(stderr, "", "Expected no stderr output from CLI run.");

  const expected = [
    "| Project | Status | Total Effort | Owner (Upper) |",
    "| --- | --- | --- | --- |",
    "| Project Beta Support | archived | 2 | ALEX |",
  ];

  const table = extractTableLines(stdout, "Archived Projects");
  assertTableEquals(table, expected);
});

Deno.test("CLI respects property map order for project base", async () => {
  const { code, stdout, stderr } = await runCli(
    "test-vault/projects.base",
    { view: "Property Ordered Projects" },
  );

  assertEquals(code, 0, `CLI exited with ${code}. stderr:\n${stderr}`);
  assertEquals(stderr, "", "Expected no stderr output from CLI run.");

  const expected = [
    "| Project | Status | Normalized Status | Total Effort | High Effort? | Linked to Sync? | Owner (Upper) |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    "| Project Alpha Launch | active | active | 5 | false | true | JAMIE |",
    "| Project Beta Support | archived | archived | 2 | false | false | ALEX |",
    "| Research Gamma Exploration | planning | planning | 8 | true | false | TAYLOR |",
  ];

  const table = extractTableLines(stdout, "Property Ordered Projects");
  assertTableEquals(table, expected, { sortRows: true });
});

Deno.test("CLI evaluates meeting formulas and filters", async () => {
  const { code, stdout, stderr } = await runCli("test-vault/meetings.base");

  assertEquals(code, 0, `CLI exited with ${code}. stderr:\n${stderr}`);
  assertEquals(stderr, "", "Expected no stderr output from CLI run.");

  const expected = [
    "| note.title | formula.attendanceCount | formula.facilitatorUpper | formula.titleLink |",
    "| --- | --- | --- | --- |",
    "| Sprint Retrospective | 3 | ALEX | Sprint Retrospective |",
  ];

  const table = extractTableLines(stdout, "Upcoming Meetings");
  assertTableEquals(table, expected);
});

Deno.test("CLI renders secondary meeting diagnostics view", async () => {
  const { code, stdout, stderr } = await runCli(
    "test-vault/meetings.base",
    { view: "Meeting Diagnostics" },
  );

  assertEquals(code, 0, `CLI exited with ${code}. stderr:\n${stderr}`);
  assertEquals(stderr, "", "Expected no stderr output from CLI run.");

  const expected = [
    "| formula.attendanceCount | formula.facilitatorUpper | formula.isPlanned | formula.titleLink |",
    "| --- | --- | --- | --- |",
    "| 3 | ALEX | true | Sprint Retrospective |",
    "| 3 | JAMIE | false | Weekly Sync |",
  ];

  const table = extractTableLines(stdout, "Meeting Diagnostics");
  assertTableEquals(table, expected, { sortRows: true });
});

Deno.test("CLI uses the working directory when --vault-path is omitted", async () => {
  const { code, stdout, stderr } = await runCli("unnamed-view.base", {
    omitVaultPath: true,
    cwd: testVaultDir,
  });

  assertEquals(code, 0, `CLI exited with ${code}. stderr:\n${stderr}`);
  assertEquals(stderr, "", "Expected no stderr output from CLI run.");
  assertStringIncludes(stdout, "# Untitled view");

  const expected = [
    "| note.title |",
    "| --- |",
    "| Project Alpha Launch |",
    "| Project Beta Support |",
    "| Research Gamma Exploration |",
  ];

  const table = extractTableLines(stdout, "Untitled view");
  assertTableEquals(table, expected, { sortRows: true });
});

Deno.test("CLI renders placeholder table when no columns are defined", async () => {
  const { code, stdout, stderr } = await runCli("test-vault/minimal.base");

  assertEquals(code, 0, `CLI exited with ${code}. stderr:\n${stderr}`);
  assertEquals(stderr, "", "Expected no stderr output from CLI run.");

  const expected = [
    "|  |",
    "| --- |",
  ];

  const table = extractTableLines(stdout, "Empty Output");
  assertEquals(table, expected);
});

Deno.test("CLI fails when base file cannot be read", async () => {
  const basePath = "test-vault/missing.base";
  const { code, stderr } = await runCli(basePath);

  assertEquals(code, 1, "Expected CLI to exit with failure.");
  assertStringIncludes(
    stderr,
    `Unable to read base file at ${basePath}`,
  );
});

Deno.test("CLI fails when base file has invalid YAML structure", async () => {
  const { code, stderr } = await runCli("test-vault/invalid-structure.base");

  assertEquals(code, 1, "Expected CLI to exit with failure.");
  assertStringIncludes(stderr, "Failed to parse base file as YAML.");
  assertStringIncludes(stderr, "Parsed base file is not a valid object.");
});

Deno.test("CLI fails when base file defines no views", async () => {
  const { code, stderr } = await runCli("test-vault/no-views.base");

  assertEquals(code, 1, "Expected CLI to exit with failure.");
  assertStringIncludes(stderr, "Base file does not define any views.");
});

Deno.test("CLI fails when requested view does not exist", async () => {
  const { code, stderr } = await runCli("test-vault/projects.base", {
    view: "Missing View",
  });

  assertEquals(code, 1, "Expected CLI to exit with failure.");
  assertStringIncludes(stderr, 'View "Missing View" not found in base file.');
});

Deno.test("CLI surfaces filter processing errors", async () => {
  const { code, stderr } = await runCli("test-vault/filter-errors.base");

  assertEquals(code, 1, "Expected CLI to exit with failure.");
  assertStringIncludes(
    stderr,
    "Failed to process base filters for file",
  );
  assertStringIncludes(stderr, '"and" group must be an array.');
});
