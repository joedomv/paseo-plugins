import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { caveman } from "./caveman";

let claudeDir: string;
const sessionId = "11111111-2222-3333-4444-555555555555";
const ctx = () => ({ provider: "claude" as const, claudeDir, codexDir: "/nonexistent", sessionId, cwd: "/repo" });

beforeEach(async () => {
  claudeDir = await mkdtemp(path.join(os.tmpdir(), "caveman-"));
  await mkdir(path.join(claudeDir, ".caveman-sessions"));
  await writeFile(path.join(claudeDir, "settings.json"), JSON.stringify({ env: { CAVEMAN_DEFAULT_MODE: "full" } }));
});
afterEach(() => {
  delete process.env.CAVEMAN_DEFAULT_MODE;
});

async function session(mode: string) {
  await writeFile(path.join(claudeDir, ".caveman-sessions", `${sessionId}.mode`), mode);
}

describe("caveman reader", () => {
  it("reads the per-session file first", async () => {
    await session("ultracave\n");
    await writeFile(path.join(claudeDir, ".caveman-active"), "caveman");
    const r = await caveman.read(ctx());
    expect(r).toMatchObject({ mode: "ultracave", source: "session-file" });
    expect(caveman.badge("ultracave")).toBe("ULTRACAVE");
  });

  it("returns off from the session file and no badge", async () => {
    await session("off");
    const r = await caveman.read(ctx());
    expect(r).toMatchObject({ mode: "off", source: "session-file", note: null });
    expect(caveman.badge("off")).toBeNull();
  });

  it("explains off on SDK sessions when CAVEMAN_DEFAULT_MODE is unset", async () => {
    await writeFile(path.join(claudeDir, "settings.json"), "{}");
    await session("off");
    const r = await caveman.read(ctx());
    expect(r.note).toMatch(/CAVEMAN_DEFAULT_MODE/);
  });

  it("falls back to the shared flag, labelled", async () => {
    await writeFile(path.join(claudeDir, ".caveman-active"), "megacave");
    const r = await caveman.read(ctx());
    expect(r).toMatchObject({ mode: "megacave", source: "shared-flag" });
    expect(r.note).toMatch(/shared/);
  });

  it("ignores the shared flag's garbage and reports nothing", async () => {
    await writeFile(path.join(claudeDir, ".caveman-active"), "bogus");
    expect(await caveman.read(ctx())).toMatchObject({ mode: null, source: "none" });
  });

  it("maps legacy levels to today's badges", () => {
    expect(caveman.badge("full")).toBe("CAVEMAN");
    expect(caveman.badge("wenyan-ultra")).toBe("MEGACAVE");
    expect(caveman.badge("commit")).toBe("CAVEMAN:COMMIT");
  });
});
