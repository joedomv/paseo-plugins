import type { PluginHandlerContext } from "@getpaseo/plugin/server";

import type { PluginStatus, StatusReport } from "../shared/status";
import {
  claudeDir,
  enabledScope,
  hookEvents,
  injectsIntoSession,
  installedPlugins as claudePlugins,
  shipsCommands,
} from "./claude-code";
import { codexDir, installedPlugins as codexPlugins } from "./codex";
import { readers } from "./readers";
import type { ReaderContext } from "./readers";

/** Command names a session reports for plugins look like `plugin:command`. */
function loadedNamespaces(commands: Array<{ name: string }>): Set<string> {
  return new Set(commands.map((c) => c.name.split(":")[0]));
}

interface Candidate {
  name: string;
  version: string | null;
  installPath: string | null;
  scope: PluginStatus["enabledScope"];
  events: string[];
}

async function claudeCandidates(dir: string, cwd: string): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (const p of await claudePlugins(dir)) {
    out.push({
      name: p.name,
      version: p.version,
      installPath: p.installPath,
      scope: await enabledScope(p.key, dir, cwd),
      events: p.installPath ? await hookEvents(p.installPath) : [],
    });
  }
  return out;
}

// shortcut: Codex's project-level `.codex/config.toml` plugin tables are ignored; add when someone needs per-repo toggles
async function codexCandidates(dir: string): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (const p of await codexPlugins(dir)) {
    out.push({
      name: p.name,
      version: p.version,
      installPath: p.installPath,
      scope: p.enabled ? "user" : "none",
      events: p.installPath ? await hookEvents(p.installPath, ".codex-plugin/plugin.json") : [],
    });
  }
  return out;
}

export async function detect(agentId: string, { paseo }: PluginHandlerContext): Promise<StatusReport> {
  const handle = paseo.agents.ref(agentId);
  const refreshed = await handle.refresh();
  const agent = refreshed?.agent ?? handle.current();
  if (!agent) throw new Error(`Agent not found: ${agentId}`);
  const sessionId = handle.runtimeInfo?.sessionId ?? null;
  const cwd = agent.cwd;
  const provider = agent.provider;
  if (provider !== "claude" && provider !== "codex") return { provider, sessionId, cwd, plugins: [] };

  let loaded: Set<string> | null = null;
  if (sessionId) {
    try {
      loaded = loadedNamespaces((await handle.commands()).commands);
    } catch {
      loaded = null;
    }
  }

  const dirs = { claudeDir: claudeDir(), codexDir: codexDir() };
  const candidates = provider === "claude" ? await claudeCandidates(dirs.claudeDir, cwd) : await codexCandidates(dirs.codexDir);
  const plugins: PluginStatus[] = [];
  const seen = new Set<string>();

  for (const plugin of candidates) {
    seen.add(plugin.name);
    const reader = readers.find((r) => r.id === plugin.name);
    if (!reader && !injectsIntoSession(plugin.events)) continue;
    const enabled = plugin.scope !== "none";
    const hookActive = enabled && injectsIntoSession(plugin.events);
    const canLoad = plugin.installPath ? await shipsCommands(plugin.installPath) : true;
    const context: ReaderContext = { provider, ...dirs, sessionId, cwd };
    const reading =
      reader && enabled && sessionId
        ? await reader.read(context)
        : { mode: null, source: "none" as const, path: null, note: null };
    // Codex runs plugin hooks only after the user trusts them, so a reader with nothing to read is the usual first state.
    const note =
      reading.note ??
      (provider === "codex" && hookActive && reader && reading.mode === null && sessionId
        ? "no state recorded; Codex runs plugin hooks only after you trust them (/hooks in Codex, or Settings > Hooks)"
        : null);
    plugins.push({
      id: plugin.name,
      version: plugin.version,
      installed: true,
      enabledScope: plugin.scope,
      loaded: loaded === null || !canLoad ? null : loaded.has(plugin.name),
      hookActive,
      hookEvents: plugin.events,
      reader: Boolean(reader),
      mode: reading.mode,
      modeSource: reading.source,
      modePath: reading.path,
      badge: reader && reading.mode ? reader.badge(reading.mode) : null,
      note,
    });
  }

  // A reader's plugin is listed even when it is not installed, so its row says so.
  for (const reader of readers) {
    if (seen.has(reader.id)) continue;
    plugins.push({
      id: reader.id,
      version: null,
      installed: false,
      enabledScope: "none",
      loaded: loaded === null ? null : loaded.has(reader.id),
      hookActive: false,
      hookEvents: [],
      reader: true,
      mode: null,
      modeSource: "none",
      modePath: null,
      badge: null,
      note: null,
    });
  }

  plugins.sort((a, b) => Number(Boolean(b.badge)) - Number(Boolean(a.badge)) || a.id.localeCompare(b.id));
  return { provider, sessionId, cwd, plugins };
}
