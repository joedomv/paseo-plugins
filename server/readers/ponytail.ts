import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import path from "node:path";

import { readText } from "../fs";
import type { ModeReading, Reader, ReaderContext } from "./types";

const MODES = new Set(["off", "lite", "full", "ultra", "review"]);

/** ponytail keys the per-repo file by sha256 of the normalized CLAUDE_PROJECT_DIR. */
export function repoModePath(claudeDir: string, cwd: string): string {
  const key = createHash("sha256").update(path.normalize(cwd)).digest("hex");
  return path.join(claudeDir, "ponytail-modes", key);
}

/**
 * Under Codex ponytail writes only the shared flag, into the plugin's
 * `$PLUGIN_DATA` directory below `plugins/data`. The exact subdirectory is
 * Codex's choice, so the flag is located rather than assumed.
 */
export async function codexFlagPath(codexDir: string): Promise<string | null> {
  const root = path.join(codexDir, "plugins", "data");
  const queue = [root];
  for (let depth = 0; depth < 4 && queue.length; depth++) {
    const next: string[] = [];
    for (const dir of queue) {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        if (e.isFile() && e.name === ".ponytail-active") return path.join(dir, e.name);
        if (e.isDirectory()) next.push(path.join(dir, e.name));
      }
    }
    queue.splice(0, queue.length, ...next);
  }
  return null;
}

function parse(raw: string): string | null {
  // An empty file historically meant full.
  const mode = raw === "" ? "full" : raw;
  return MODES.has(mode) ? mode : null;
}

export const ponytail: Reader = {
  id: "ponytail",
  async read({ provider, claudeDir, codexDir, cwd }: ReaderContext): Promise<ModeReading> {
    if (provider === "codex") {
      const flag = await codexFlagPath(codexDir);
      const raw = flag ? await readText(flag) : null;
      const mode = raw === null ? null : parse(raw);
      if (mode === null) return { mode: null, source: "none", path: null, note: null };
      return { mode, source: "shared-flag", path: flag, note: "Codex: one level shared by every thread; last write wins" };
    }
    const repoFile = repoModePath(claudeDir, cwd);
    const repoRaw = await readText(repoFile);
    const repoMode = repoRaw === null ? null : parse(repoRaw);
    if (repoMode !== null) {
      return {
        mode: repoMode,
        source: "repo-file",
        path: repoFile,
        note: "per repo: every session in this directory shares this level",
      };
    }
    const sharedFile = path.join(claudeDir, ".ponytail-active");
    const sharedRaw = await readText(sharedFile);
    const sharedMode = sharedRaw === null ? null : parse(sharedRaw);
    if (sharedMode !== null) {
      return { mode: sharedMode, source: "shared-flag", path: sharedFile, note: "shared flag; last session to write wins" };
    }
    return { mode: null, source: "none", path: null, note: null };
  },
  badge: (mode) => (mode === "off" ? null : mode === "full" ? "PONYTAIL" : `PONYTAIL:${mode.toUpperCase()}`),
};
