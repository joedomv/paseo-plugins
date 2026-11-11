import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { readJson } from "./fs";

export function claudeDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
}

export interface InstalledPlugin {
  /** `name@marketplace`, the key Claude Code uses in settings. */
  key: string;
  name: string;
  version: string | null;
  installPath: string | null;
}

/**
 * `~/.claude/plugins/installed_plugins.json`. Claude Code 2.1.3xx writes
 * `{ plugins: { "name@market": [{ version, installPath, … }] } }`; some builds
 * write `{ plugins: ["name@market", …] }`. Both are accepted.
 */
export async function installedPlugins(dir: string): Promise<InstalledPlugin[]> {
  const doc = (await readJson(path.join(dir, "plugins", "installed_plugins.json"))) as {
    plugins?: string[] | Record<string, Array<{ version?: string; installPath?: string }> | unknown>;
  } | null;
  const plugins = doc?.plugins;
  if (Array.isArray(plugins)) {
    return plugins.filter((k): k is string => typeof k === "string").map((key) => ({
      key,
      name: key.split("@")[0],
      version: null,
      installPath: null,
    }));
  }
  if (!plugins || typeof plugins !== "object") return [];
  return Object.entries(plugins).map(([key, records]) => {
    const record = Array.isArray(records) ? records[0] : null;
    return {
      key,
      name: key.split("@")[0],
      version: record?.version ?? null,
      installPath: record?.installPath ?? null,
    };
  });
}

export type EnabledScope = "user" | "project" | "local" | "none";

/** Later scopes override earlier ones; `false` or unlisted means off. */
export async function enabledScope(key: string, dir: string, cwd: string): Promise<EnabledScope> {
  const files: Array<[EnabledScope, string]> = [
    ["user", path.join(dir, "settings.json")],
    ["project", path.join(cwd, ".claude", "settings.json")],
    ["local", path.join(cwd, ".claude", "settings.local.json")],
  ];
  let result: EnabledScope = "none";
  for (const [scope, file] of files) {
    const doc = (await readJson(file)) as { enabledPlugins?: Record<string, boolean> } | null;
    const value = doc?.enabledPlugins?.[key];
    if (value === true) result = scope;
    else if (value === false) result = "none";
  }
  return result;
}

const SESSION_HOOKS = ["SessionStart", "UserPromptSubmit"];

function eventsOf(hooks: unknown): string[] {
  if (!hooks || typeof hooks !== "object" || Array.isArray(hooks)) return [];
  return Object.keys(hooks);
}

async function eventsFromFile(file: string): Promise<string[]> {
  const doc = (await readJson(file)) as { hooks?: unknown } | null;
  return eventsOf(doc?.hooks);
}

/**
 * Hook events a plugin declares. The manifest's `hooks` field is an inline
 * object, a path, or a list of paths to `{ "hooks": { … } }` files; with no
 * field Claude Code loads `hooks/hooks.json` when present.
 */
export async function hookEvents(installPath: string, manifestFile = ".claude-plugin/plugin.json"): Promise<string[]> {
  const manifest = (await readJson(path.join(installPath, manifestFile))) as {
    hooks?: unknown;
  } | null;
  const hooks = manifest?.hooks;
  const events = new Set<string>();
  if (typeof hooks === "string") {
    for (const e of await eventsFromFile(path.join(installPath, hooks))) events.add(e);
  } else if (Array.isArray(hooks)) {
    for (const file of hooks) {
      if (typeof file !== "string") continue;
      for (const e of await eventsFromFile(path.join(installPath, file))) events.add(e);
    }
  } else if (hooks && typeof hooks === "object") {
    for (const e of eventsOf(hooks)) events.add(e);
  } else {
    for (const e of await eventsFromFile(path.join(installPath, "hooks", "hooks.json"))) events.add(e);
  }
  return [...events];
}

export function injectsIntoSession(events: string[]): boolean {
  return events.some((e) => SESSION_HOOKS.includes(e));
}

/** Whether the plugin ships commands or skills, so `agent.commands()` can show it loaded. */
export async function shipsCommands(installPath: string): Promise<boolean> {
  for (const sub of ["commands", "skills"]) {
    try {
      await access(path.join(installPath, sub));
      return true;
    } catch {
      /* absent */
    }
  }
  return false;
}
