# `materalize-base`

CLI Utility for reading an [Obsidian](https://help.obsidian.md)
[Base](https://help.obsidian.md/bases) file, and returning the the specified
table formatted as Markdown.

The intended use case is manipulating an Obsidian vault with an AI coding agent
(like [Codex](https://developers.openai.com/codex/cli/)), allowing it to view
and use your Bases in the same way that you do.

This does not use any Obsidian APIs - it attempts to emulate the Obsidian
functionality. The emulation may be imperfect, PRs are welcome.

## Status

In active development, not recommended for use just yet.

## Usage

```sh
deno run -A module.ts path/to/your.base [--vault-path=test-vault] [--view=your_view]
```

- `--vault-path` defaults to the current working directory.
- `--view` defaults to the first view defined in the base.

## Future Plans

- Upload to [JSR](https://jsr.io)
- Add a compiled version to [homebrew](https://brew.sh)

## Non-Goals

- [dataview](https://blacksmithgu.github.io/obsidian-dataview/) support
