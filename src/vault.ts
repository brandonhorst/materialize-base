import { join } from "@std/path";
import { parseVaultFile } from "./vault-file.ts";
import { normalizePath } from "./path-utils.ts";
import type { VaultFile, VaultLink } from "./types.ts";

function resolveLinks(
  files: VaultFile[],
  byPath: Map<string, VaultFile>,
  byName: Map<string, VaultFile[]>,
): void {
  const backlinkMap = new Map<string, Set<string>>();

  for (const file of files) {
    if (!file.links && !file.embeds) continue;

    const resolve = (link: VaultLink) => {
      const resolved = resolveLinkTarget(link.target, file, byPath, byName);
      if (resolved) {
        link.resolvedPath = resolved.relativePath;
        const existing = backlinkMap.get(resolved.relativePath) ??
          new Set<string>();
        existing.add(file.relativePath);
        backlinkMap.set(resolved.relativePath, existing);
      }
    };

    if (file.links) {
      for (const link of file.links) resolve(link);
    }
    if (file.embeds) {
      for (const embed of file.embeds) resolve(embed);
    }
  }

  for (const file of files) {
    const backlinks = backlinkMap.get(file.relativePath);
    if (backlinks) {
      file.backlinks = Array.from(backlinks);
    }
  }
}

function resolveLinkTarget(
  targetRaw: string,
  source: VaultFile,
  byPath: Map<string, VaultFile>,
  byName: Map<string, VaultFile[]>,
): VaultFile | undefined {
  const target = targetRaw.trim();
  if (target.length === 0) return undefined;

  const cleaned = normalizePath(target.replace(/[#^].*$/, ""));

  const absoluteCandidates: string[] = [];
  if (cleaned.includes("/")) {
    if (byPath.has(cleaned)) {
      absoluteCandidates.push(cleaned);
    }
    if (!cleaned.endsWith(".md")) {
      absoluteCandidates.push(`${cleaned}.md`);
    }
  } else {
    const folderCandidate = normalizePath(`${source.folder}/${cleaned}`);
    absoluteCandidates.push(folderCandidate);
    if (!folderCandidate.endsWith(".md")) {
      absoluteCandidates.push(`${folderCandidate}.md`);
    }
  }

  for (const candidate of absoluteCandidates) {
    const exact = byPath.get(candidate);
    if (exact) return exact;
  }

  const byNameCandidates = byName.get(cleaned) ??
    (!cleaned.endsWith(".md") ? byName.get(`${cleaned}`) : undefined);
  if (byNameCandidates && byNameCandidates.length > 0) {
    return byNameCandidates[0];
  }

  const noExt = cleaned.endsWith(".md") ? cleaned.slice(0, -3) : cleaned;
  const nameCandidates = byName.get(noExt);
  if (nameCandidates && nameCandidates.length > 0) {
    return nameCandidates[0];
  }
  return undefined;
}

export async function walkVault(vaultPath: string): Promise<VaultFile[]> {
  const results: VaultFile[] = [];
  const pending: string[] = [vaultPath];

  while (pending.length > 0) {
    const currentDir = pending.pop();
    if (!currentDir) continue;

    for await (const entry of Deno.readDir(currentDir)) {
      const entryPath = join(currentDir, entry.name);
      if (entry.isSymlink) {
        continue;
      }

      if (entry.isDirectory) {
        pending.push(entryPath);
        continue;
      }

      if (!entry.isFile) continue;

      const file = await parseVaultFile(entryPath, vaultPath);
      results.push(file);
    }
  }

  const byPath = new Map<string, VaultFile>();
  const byName = new Map<string, VaultFile[]>();
  for (const file of results) {
    byPath.set(file.relativePath, file);
    const entries = byName.get(file.name) ?? [];
    entries.push(file);
    byName.set(file.name, entries);
  }

  resolveLinks(results, byPath, byName);

  return results;
}

export function groupFilesByName(
  files: ReadonlyArray<VaultFile>,
): Map<string, VaultFile[]> {
  const map = new Map<string, VaultFile[]>();
  for (const file of files) {
    const list = map.get(file.name);
    if (list) {
      list.push(file);
    } else {
      map.set(file.name, [file]);
    }
  }
  return map;
}
