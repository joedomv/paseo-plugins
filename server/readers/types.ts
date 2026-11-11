import type { PluginStatus } from "../../shared/status";

export interface ReaderContext {
  /** `$CLAUDE_CONFIG_DIR` or `~/.claude`. */
  claudeDir: string;
  /** Claude session id; null until the session opens. */
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

/** A mode-aware detector for one Claude Code plugin. */
export interface Reader {
  /** Claude Code plugin name. */
  id: string;
  read(context: ReaderContext): Promise<ModeReading>;
  /** Pill text for a mode, or null when the mode means off. */
  badge(mode: string): string | null;
}
