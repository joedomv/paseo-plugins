import type { PluginStatus } from "../../shared/status";

export interface ReaderContext {
  provider: "claude" | "codex";
  /** `$CLAUDE_CONFIG_DIR` or `~/.claude`. */
  claudeDir: string;
  /** `$CODEX_HOME` or `~/.codex`. */
  codexDir: string;
  /** Provider session id; null until the session opens. */
  sessionId: string | null;
  /** The agent's project directory. */
  cwd: string;
}

export interface ModeReading {
  mode: string | null;
  source: PluginStatus["modeSource"];
  path: string | null;
  note: string | null;
}

/** A mode-aware detector for one plugin. */
export interface Reader {
  /** Plugin name, the same in Claude Code and Codex marketplaces. */
  id: string;
  read(context: ReaderContext): Promise<ModeReading>;
  /** Pill text for a mode, or null when the mode means off. */
  badge(mode: string): string | null;
}
