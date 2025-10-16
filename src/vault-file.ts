import { basename, dirname, extname, relative } from "@std/path";
import { parse as parseYaml } from "@std/yaml";
import { normalizePath } from "./path-utils.ts";
import type { VaultFile, VaultLink } from "./types.ts";

const FRONTMATTER_PATTERN =
  /^---\s*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)\s*\r?\n?/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectTags(
  frontmatter: Record<string, unknown>,
  content: string,
): string[] {
  const tagSet = new Set<string>();

  const frontmatterTags = frontmatter["tags"];
  if (typeof frontmatterTags === "string") {
    tagSet.add(frontmatterTags);
  } else if (Array.isArray(frontmatterTags)) {
    for (const tag of frontmatterTags) {
      if (typeof tag === "string") {
        tagSet.add(tag);
      }
    }
  }

  const tagPattern = /(^|\s)#([A-Za-z0-9/_-]+)/g;
  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = tagPattern.exec(content)) !== null) {
    tagSet.add(tagMatch[2]);
  }

  return Array.from(tagSet);
}

function collectLinks(content: string): {
  links: VaultLink[];
  embeds: VaultLink[];
} {
  const linkPattern = /(!)?\[\[([^\]\|#^]+)(?:#?[^\]\|]*)?(?:\|([^\]]+))?\]\]/g;
  const links: VaultLink[] = [];
  const embeds: VaultLink[] = [];

  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(content)) !== null) {
    const isEmbed = match[1] === "!";
    const target = match[2].trim();
    const display = typeof match[3] === "string" ? match[3].trim() : undefined;
    const link: VaultLink = {
      raw: match[0],
      target,
      display,
      isEmbed,
    };
    if (isEmbed) {
      embeds.push(link);
    } else {
      links.push(link);
    }
  }

  return { links, embeds };
}

/**
 * Parses a vault file from disk, extracting metadata for markdown files.
 */
export async function parseVaultFile(
  path: string,
  vaultRoot: string,
): Promise<VaultFile> {
  const stat = await Deno.stat(path);
  const fileName = basename(path);
  const extRaw = extname(fileName);
  const ext = extRaw.replace(/^\./, "").toLowerCase();
  const name = ext.length > 0 ? fileName.slice(0, -ext.length - 1) : fileName;
  const relativePath = normalizePath(relative(vaultRoot, path));
  const folder = normalizePath(relative(vaultRoot, dirname(path))) || ".";

  const base: VaultFile = {
    path,
    relativePath,
    name,
    ext,
    folder,
    stat,
    backlinks: [],
  };

  if (ext !== "md") {
    return base;
  }

  const fullText = await Deno.readTextFile(path);

  let content = fullText;
  let frontmatter: Record<string, unknown> = {};
  const frontmatterMatch = FRONTMATTER_PATTERN.exec(fullText);
  if (frontmatterMatch) {
    try {
      const parsed = parseYaml(frontmatterMatch[1]);
      if (isRecord(parsed)) {
        frontmatter = parsed;
      }
    } catch (error) {
      throw new Error(`Unable to parse frontmatter for ${path}`, {
        cause: error,
      });
    }
    content = fullText.slice(frontmatterMatch[0].length);
  }

  const metadata: Record<string, unknown> = {};
  const properties = { ...frontmatter, ...metadata };
  const tags = collectTags(frontmatter, content);
  const { links, embeds } = collectLinks(content);

  return {
    ...base,
    frontmatter,
    metadata,
    properties,
    content,
    tags,
    links,
    embeds,
  };
}
