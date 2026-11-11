import { readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { InstalledPlugin } from "./claude-code";
import { readText } from "./fs";

export function codexDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

export interface CodexPlugin extends InstalledPlugin {
  enabled: boolean;
}

/**
 * Codex records plugins in `~/.codex/config.toml` as
 * `[plugins."name@marketplace"]` tables with `enabled = true|false`, and
 * caches them under `plugins/cache/<marketplace>/<name>/<version>/`.
 */
export function parsePluginTables(toml: string): Array<{ key: string; enabled: boolean }> {
  const plugins: Array<{ key: string; enabled: boolean }> = [];
  let current: { key: string; enabled: boolean } | null = null;
  for (const raw of toml.split("\n")) {
    const line = raw.trim();
    const table = /^\[plugins\."([^"]+)"\]$/.exec(line);
    if (table) {
      current = { key: table[1], enabled: true };
      plugins.push(current);
      continue;
    }
    if (line.startsWith("[")) current = null;
    else if (current && /^enabled\s*=\s*false\b/.test(line)) current.enabled = false;
  }
  return plugins;
}

async function newestVersionDir(dir: string): Promise<string | null> {
  try {
    const versions = (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
    // shortcut: lexical sort, not semver; fine until a plugin keeps 9.x and 10.x cached side by side
    return versions.sort().at(-1) ?? null;
  } catch {
    return null;
  }
}

export async function installedPlugins(dir: string): Promise<CodexPlugin[]> {
  const toml = await readText(path.join(dir, "config.toml"));
  if (toml === null) return [];
  const plugins: CodexPlugin[] = [];
  for (const { key, enabled } of parsePluginTables(toml)) {
    const [name, marketplace] = key.split("@");
    const cacheDir = path.join(dir, "plugins", "cache", marketplace ?? "", name);
    const version = await newestVersionDir(cacheDir);
    plugins.push({
      key,
      name,
      version,
      installPath: version ? path.join(cacheDir, version) : null,
      enabled,
    });
  }
  return plugins;
}
