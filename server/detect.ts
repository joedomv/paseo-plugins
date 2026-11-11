import type { PluginHandlerContext } from "@getpaseo/plugin/server";

import type { PluginStatus, StatusReport } from "../shared/status";
import {
  claudeDir,
  enabledScope,
  hookEvents,
  injectsIntoSession,
  installedPlugins,
  shipsCommands,
} from "./claude-code";
import { readers } from "./readers";

/** Command names a Claude session reports for plugins look like `plugin:command`. */
function loadedNamespaces(commands: Array<{ name: string }>): Set<string> {
  return new Set(commands.map((c) => c.name.split(":")[0]));
}

export async function detect(agentId: string, { paseo }: PluginHandlerContext): Promise<StatusReport> {
  const handle = paseo.agents.ref(agentId);
  const refreshed = await handle.refresh();
  const agent = refreshed?.agent ?? handle.current();
  if (!agent) throw new Error(`Agent not found: ${agentId}`);
  const sessionId = handle.runtimeInfo?.sessionId ?? null;
  const cwd = agent.cwd;
  const dir = claudeDir();

  let loaded: Set<string> | null = null;
  if (sessionId) {
    try {
      loaded = loadedNamespaces((await handle.commands()).commands);
    } catch {
      loaded = null;
    }
  }

  const installed = await installedPlugins(dir);
  const plugins: PluginStatus[] = [];
  const seen = new Set<string>();

  for (const plugin of installed) {
    seen.add(plugin.name);
    const reader = readers.find((r) => r.id === plugin.name);
    const events = plugin.installPath ? await hookEvents(plugin.installPath) : [];
    if (!reader && !injectsIntoSession(events)) continue;
    const scope = await enabledScope(plugin.key, dir, cwd);
    const enabled = scope !== "none";
    const hookActive = enabled && injectsIntoSession(events);
    const canLoad = plugin.installPath ? await shipsCommands(plugin.installPath) : true;
    const reading =
      reader && enabled && sessionId
        ? await reader.read({ claudeDir: dir, sessionId, cwd })
        : { mode: null, source: "none" as const, path: null, note: null };
    plugins.push({
      id: plugin.name,
      version: plugin.version,
      installed: true,
      enabledScope: scope,
      loaded: loaded === null || !canLoad ? null : loaded.has(plugin.name),
      hookActive,
      hookEvents: events,
      reader: Boolean(reader),
      mode: reading.mode,
      modeSource: reading.source,
      modePath: reading.path,
      badge: reader && reading.mode ? reader.badge(reading.mode) : null,
      note: reading.note,
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
  return { provider: agent.provider, sessionId, cwd, plugins };
}
