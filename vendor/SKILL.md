---
name: Materialize Obsidian Base
description: Process an Obsidian `.base` file against its Vault, and output the resulting table.
---

# Materialize Obsidian Base

This skill allows you to process an Obsidian `.base` file against an Obsidian
vault, and output the resulting table.

## Instructions

```sh
scripts/materialize-base path/to/vault/base_file.base --view="Desired View"
```

This will output the base contents as a Markdown table, mirroring what the user
sees when opening this base in their Obsidian UI.

If `view` is not provided, the first view lists in the `.base` file will be
used.

The CLI automatically walks parent directories of the base file to find the
vault root (identified by a `.obsidian` folder). If no vault is detected, the
CLI exits and asks you to pass `--vault=/absolute/path/to/vault` to override
detection.

Run `scripts/materialize-base --help` for more documentation.
