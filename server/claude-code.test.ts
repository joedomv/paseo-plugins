import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { enabledScope, hookEvents, injectsIntoSession, installedPlugins } from "./claude-code";

let dir: string;
let cwd: string;

async function json(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value));
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "claude-"));
  cwd = await mkdtemp(path.join(os.tmpdir(), "repo-"));
});

describe("installedPlugins", () => {
  it("reads the keyed registry with install records", async () => {
    await json(path.join(dir, "plugins", "installed_plugins.json"), {
      version: 2,
      plugins: { "caveman@caveman": [{ version: "4.0.1", installPath: "/cache/caveman" }] },
    });
    expect(await installedPlugins(dir)).toEqual([
      { key: "caveman@caveman", name: "caveman", version: "4.0.1", installPath: "/cache/caveman" },
    ]);
  });

  it("reads the flat array form", async () => {
    await json(path.join(dir, "plugins", "installed_plugins.json"), { version: 2, plugins: ["ponytail@ponytail"] });
    expect(await installedPlugins(dir)).toEqual([
      { key: "ponytail@ponytail", name: "ponytail", version: null, installPath: null },
    ]);
  });

  it("returns nothing for a missing registry", async () => {
    expect(await installedPlugins(dir)).toEqual([]);
  });
});

describe("enabledScope", () => {
  const key = "caveman@caveman";
  it("is none when unlisted", async () => {
    expect(await enabledScope(key, dir, cwd)).toBe("none");
  });
  it("reports the user scope", async () => {
    await json(path.join(dir, "settings.json"), { enabledPlugins: { [key]: true } });
    expect(await enabledScope(key, dir, cwd)).toBe("user");
  });
  it("lets a later scope turn it off, and local turn it back on", async () => {
    await json(path.join(dir, "settings.json"), { enabledPlugins: { [key]: true } });
    await json(path.join(cwd, ".claude", "settings.json"), { enabledPlugins: { [key]: false } });
    expect(await enabledScope(key, dir, cwd)).toBe("none");
    await json(path.join(cwd, ".claude", "settings.local.json"), { enabledPlugins: { [key]: true } });
    expect(await enabledScope(key, dir, cwd)).toBe("local");
  });
});

describe("hookEvents", () => {
  it("reads an inline hooks object", async () => {
    const root = path.join(dir, "inline");
    await json(path.join(root, ".claude-plugin", "plugin.json"), {
      hooks: { SessionStart: [], SessionEnd: [] },
    });
    const events = await hookEvents(root);
    expect(events.sort()).toEqual(["SessionEnd", "SessionStart"]);
    expect(injectsIntoSession(events)).toBe(true);
  });

  it("reads a list of hook files", async () => {
    const root = path.join(dir, "list");
    await json(path.join(root, ".claude-plugin", "plugin.json"), { hooks: ["./hooks/a.json", "./hooks/b.json"] });
    await json(path.join(root, "hooks", "a.json"), { hooks: { UserPromptSubmit: [] } });
    await json(path.join(root, "hooks", "b.json"), { hooks: {}, modules: ["./band.tsx"] });
    expect(await hookEvents(root)).toEqual(["UserPromptSubmit"]);
  });

  it("reads a single hook file path", async () => {
    const root = path.join(dir, "single");
    await json(path.join(root, ".claude-plugin", "plugin.json"), { hooks: "hooks/x.json" });
    await json(path.join(root, "hooks", "x.json"), { hooks: { PreToolUse: [] } });
    const events = await hookEvents(root);
    expect(events).toEqual(["PreToolUse"]);
    expect(injectsIntoSession(events)).toBe(false);
  });

  it("falls back to hooks/hooks.json when the manifest has no hooks field", async () => {
    const root = path.join(dir, "conventional");
    await json(path.join(root, ".claude-plugin", "plugin.json"), { name: "i-have-adhd" });
    await json(path.join(root, "hooks", "hooks.json"), { hooks: { SessionStart: [] } });
    expect(await hookEvents(root)).toEqual(["SessionStart"]);
  });

  it("is empty for a modules-only hooks file or no hooks at all", async () => {
    const root = path.join(dir, "modules");
    await json(path.join(root, ".claude-plugin", "plugin.json"), { name: "x" });
    await json(path.join(root, "hooks", "hooks.json"), { modules: ["./x.ts"] });
    expect(await hookEvents(root)).toEqual([]);
    expect(await hookEvents(path.join(dir, "nowhere"))).toEqual([]);
  });
});
