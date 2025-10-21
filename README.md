# `materalize-base`

CLI Utility and Claude Skill for reading an [Obsidian](https://help.obsidian.md)
[Base](https://help.obsidian.md/bases) file, querying its Vault, and returning
the the specified table formatted as Markdown.

The intended use case is manipulating an Obsidian vault with an AI coding agent
(like Claude Code), allowing it to view and use your Bases in the same way that
you do.

This does not use any Obsidian APIs - it attempts to emulate the Obsidian
functionality. The emulation may be imperfect, PRs are welcome.

## CLI Usage

Download the binary for your platform from Releases.

```sh
materialize-base path/to/your.base [--vault=test-vault] [--view=your_view]
```

- `--vault` defaults to the nearest ancestor directory that contains a
  `.obsidian` folder.
- `--view` defaults to the first view defined in the base.

When the base file lives within an Obsidian vault, you can usually omit
`--vault` entirely—the CLI will detect the vault root automatically. If the base
sits outside of a vault, pass `--vault=/absolute/path/to/your/vault` to proceed.

## Skill Usage

An Agent Skill is provided, allowing for discovery with Claude Code (and
potentially other AI Agents).

For Claude Code, grab the skill directory from Releases and add it to your
vault's `.claude/skills` directory. See
[Claude Code Skills Docs](https://docs.claude.com/en/docs/claude-code/skills)
for more info.

## Future Plans

- Add the CLI utility to [homebrew](https://brew.sh)

## Non-Goals

- [dataview](https://blacksmithgu.github.io/obsidian-dataview/) support
