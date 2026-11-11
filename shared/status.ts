import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const ModeSourceSchema = z.enum(["session-file", "repo-file", "shared-flag", "none"]);

export const PluginStatusSchema = z.object({
  /** Claude Code plugin name, e.g. `caveman`. */
  id: z.string(),
  version: z.string().nullable(),
  installed: z.boolean(),
  /** Settings scope that last decided the plugin is on; `none` when off or unlisted. */
  enabledScope: z.enum(["user", "project", "local", "none"]),
  /** Null when the plugin ships no commands or skills, so the session cannot tell. */
  loaded: z.boolean().nullable(),
  /** Enabled, and the manifest declares a SessionStart or UserPromptSubmit hook. */
  hookActive: z.boolean(),
  hookEvents: z.array(z.string()),
  /** This plugin has a mode reader in `server/readers/`. */
  reader: z.boolean(),
  /** Null when no reader exists or nothing has been recorded for this agent. */
  mode: z.string().nullable(),
  modeSource: ModeSourceSchema,
  /** File the mode was read from, when one was. */
  modePath: z.string().nullable(),
  /** Pill text for the current mode, null when off or absent. */
  badge: z.string().nullable(),
  note: z.string().nullable(),
});

export const readStatus = defineRpc({
  name: "plugin-status.read",
  input: z.object({ agentId: z.string() }),
  output: z.object({
    provider: z.string(),
    sessionId: z.string().nullable(),
    cwd: z.string(),
    plugins: z.array(PluginStatusSchema),
  }),
});

export type PluginStatus = z.output<typeof PluginStatusSchema>;
export type StatusReport = z.output<typeof readStatus.output>;

/** `CAVEMAN · PONYTAIL:ULTRA`; empty when nothing with a reader is on. */
export function pillLabel(report: StatusReport): string {
  return report.plugins
    .map((p) => p.badge)
    .filter((b): b is string => b !== null)
    .join(" · ");
}
