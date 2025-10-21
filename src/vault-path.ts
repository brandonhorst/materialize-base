import { dirname, join, resolve } from "@std/path";

async function directoryExists(path: string): Promise<boolean> {
  try {
    const stat = await Deno.stat(path);
    return stat.isDirectory;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return false;
    }
    throw error;
  }
}

export async function getAncestorVaultPath(
  basePath: string,
): Promise<string | undefined> {
  const absoluteBasePath = resolve(basePath);

  let currentDir = absoluteBasePath;
  try {
    const stat = await Deno.stat(currentDir);
    if (!stat.isDirectory) {
      currentDir = dirname(currentDir);
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      currentDir = dirname(currentDir);
    } else {
      throw error;
    }
  }

  while (true) {
    const obsidianDir = join(currentDir, ".obsidian");
    if (await directoryExists(obsidianDir)) {
      return currentDir;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  return undefined;
}
