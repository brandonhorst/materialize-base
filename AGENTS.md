# Repository Guidelines

This is a Deno CLI to read Obsidian Bases files, and query an Obsidian vault
accordingly, and return the output in markdown. Obsidian provides no API for
this, so we're doing it ourselves.

Scraped Obsidian Bases docs are all provided in obsidian-base-docs/.

## Project Structure & Module Organization

Core CLI logic lives in `module.ts`, which wires together runtime flags and
orchestrates vault queries. Supporting utilities sit under `src/`, e.g.
`src/materalize.ts` for query planning, `src/parse-file.ts` for Obsidian
markdown ingestion, and `src/types.ts` for shared interfaces. Tests reside in
`test/` as `*.test.ts` files mirroring their source counterparts. Scraped
reference material is kept in `obsidian-base-docs/`; treat it as read-only
documentation inputs. Configuration for tasks, formatting, and dependency
imports is centralized in `deno.json`.

## Build, Test, and Development Commands

- `deno task check`: Run formatter, linter, and type-check to keep the codebase
  healthy.
- `deno task test`: Execute all unit tests under `test/`.
- `deno task coverage`: Generate coverage data into `cov_profile/` and report
  totals.
- `deno task demo`: Try the CLI end-to-end with a local base definition.

## Coding Style & Naming Conventions

Default to 2-space indentation and rely on `deno fmt` for layout. Prefer
TypeScript `readonly` modifiers for data passed across modules, and use explicit
return types on exported functions. Follow `camelCase` for variables and
functions, `PascalCase` for types and classes, and kebab-case for new filenames.
Imports should be relative within `src/` and managed via `deno.json` when
pulling from `@std`.

## Testing Guidelines

Add focused unit tests beside related code using the `*.test.ts` suffix (e.g.,
`test/parse-file.test.ts`). Use Deno’s built-in testing APIs and the
`@std/assert` helpers already imported in existing suites. Aim to cover edge
cases such as empty vault folders or malformed formulas; regenerate coverage
with `deno task coverage` and keep the reported percentage from regressing.

## Commit & Pull Request Guidelines

Keep commits scoped and descriptive, and group mechanical format changes
separately when possible. Pull requests should summarize the user-visible
behavior change, link any issue or Obsidian Base spec consulted, and include CLI
output samples or screenshots when altering markdown generation.

## Security & Configuration Tips

Never commit private vault contents; point demos to sanitized paths. Respect the
filesystem permissions Deno requires—document any new `--allow-*` flags added to
`module.ts`. If new configuration knobs are introduced, extend `deno.json` tasks
so contributors can reproduce the workflow with a single command.
