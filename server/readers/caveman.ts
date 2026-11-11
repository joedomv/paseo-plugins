import path from "node:path";

import { readJson, readText } from "../fs";
import type { ModeReading, Reader, ReaderContext } from "./types";

// caveman 4.x modes plus the legacy level names older files may still hold.
const BADGES: Record<string, string> = {
  caveman: "CAVEMAN",
  lite: "CAVEMAN",
  full: "CAVEMAN",
  ultracave: "ULTRACAVE",
  ultra: "ULTRACAVE",
  megacave: "MEGACAVE",
  wenyan: "MEGACAVE",
  "wenyan-lite": "MEGACAVE",
  "wenyan-full": "MEGACAVE",
  "wenyan-ultra": "MEGACAVE",
  commit: "CAVEMAN:COMMIT",
  review: "CAVEMAN:REVIEW",
  compress: "CAVEMAN:COMPRESS",
};

const SDK_NOTE = "off (SDK session; set CAVEMAN_DEFAULT_MODE in the env map of ~/.claude/settings.json)";

async function defaultModeConfigured(claudeDir: string): Promise<boolean> {
  if (process.env.CAVEMAN_DEFAULT_MODE) return true;
  const settings = (await readJson(path.join(claudeDir, "settings.json"))) as {
    env?: Record<string, string>;
  } | null;
  return Boolean(settings?.env?.CAVEMAN_DEFAULT_MODE);
}

export const caveman: Reader = {
  id: "caveman",
  async read({ claudeDir, sessionId }: ReaderContext): Promise<ModeReading> {
    if (sessionId) {
      const file = path.join(claudeDir, ".caveman-sessions", `${sessionId}.mode`);
      const mode = await readText(file);
      if (mode !== null && (mode === "off" || mode in BADGES)) {
        // Paseo launches Claude with CLAUDE_CODE_ENTRYPOINT=sdk-cli, and caveman
        // starts such sessions off unless CAVEMAN_DEFAULT_MODE is set.
        const note = mode === "off" && !(await defaultModeConfigured(claudeDir)) ? SDK_NOTE : null;
        return { mode, source: "session-file", path: file, note };
      }
    }
    // The mirror is written by whichever session changed mode last and never holds `off`.
    const file = path.join(claudeDir, ".caveman-active");
    const mode = await readText(file);
    if (mode !== null && mode in BADGES) {
      return { mode, source: "shared-flag", path: file, note: "shared flag; may belong to another session" };
    }
    return { mode: null, source: "none", path: null, note: null };
  },
  badge: (mode) => BADGES[mode] ?? null,
};
