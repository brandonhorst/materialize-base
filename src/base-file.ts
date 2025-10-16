import { parse as parseYaml } from "@std/yaml";
import type { ObsidianBaseDefinition } from "./types.ts";

export async function parseBaseFile(
  path: string,
): Promise<ObsidianBaseDefinition> {
  let fileContents: string;
  try {
    fileContents = await Deno.readTextFile(path);
  } catch (error) {
    throw new Error(`Unable to read base file at ${path}`, { cause: error });
  }

  try {
    const parsed = parseYaml(fileContents);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Parsed base file is not a valid object.");
    }
    return parsed as ObsidianBaseDefinition;
  } catch (error) {
    if (error instanceof Error && error.cause) {
      throw error;
    }
    throw new Error("Failed to parse base file as YAML.", { cause: error });
  }
}
