import { createHash } from "node:crypto";
import path from "node:path";

import { readText } from "../fs";
import type { ModeReading, Reader, ReaderContext } from "./types";

const MODES = new Set(["off", "lite", "full", "ultra", "review"]);

/** ponytail keys the per-repo file by sha256 of the normalized CLAUDE_PROJECT_DIR. */
export function repoModePath(claudeDir: string, cwd: string): string {
  const key = createHash("sha256").update(path.normalize(cwd)).digest("hex");
  return path.join(claudeDir, "ponytail-modes", key);
}

function parse(raw: string): string | null {
  // An empty file historically meant full.
  const mode = raw === "" ? "full" : raw;
  return MODES.has(mode) ? mode : null;
}

export const ponytail: Reader = {
  id: "ponytail",
  async read({ claudeDir, cwd }: ReaderContext): Promise<ModeReading> {
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
