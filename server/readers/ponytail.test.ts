import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { ponytail, repoModePath } from "./ponytail";

let claudeDir: string;
const cwd = "/Users/joed/workspace/personal";
const ctx = () => ({ claudeDir, sessionId: "s", cwd });

beforeEach(async () => {
  claudeDir = await mkdtemp(path.join(os.tmpdir(), "ponytail-"));
  await mkdir(path.join(claudeDir, "ponytail-modes"));
});

describe("ponytail reader", () => {
  it("hashes the normalized project dir the way ponytail does", () => {
    // Verified on 2026-11-04 against ponytail 5.3.3's ponytail-runtime.js.
    expect(path.basename(repoModePath(claudeDir, cwd))).toBe(
      "e32c904850f6a33250001ea4686725d973cee384a248e40849077af9d6a333bd",
    );
  });

  it("reads the per-repo file first", async () => {
    await writeFile(repoModePath(claudeDir, cwd), "lite");
    await writeFile(path.join(claudeDir, ".ponytail-active"), "ultra");
    const r = await ponytail.read(ctx());
    expect(r).toMatchObject({ mode: "lite", source: "repo-file" });
    expect(r.note).toMatch(/per repo/);
    expect(ponytail.badge("lite")).toBe("PONYTAIL:LITE");
  });

  it("treats an empty file as full and returns the literal off", async () => {
    await writeFile(repoModePath(claudeDir, cwd), "");
    expect((await ponytail.read(ctx())).mode).toBe("full");
    expect(ponytail.badge("full")).toBe("PONYTAIL");
    await writeFile(repoModePath(claudeDir, cwd), "off\n");
    expect((await ponytail.read(ctx())).mode).toBe("off");
    expect(ponytail.badge("off")).toBeNull();
  });

  it("falls back to the shared flag, labelled", async () => {
    await writeFile(path.join(claudeDir, ".ponytail-active"), "ultra");
    const r = await ponytail.read(ctx());
    expect(r).toMatchObject({ mode: "ultra", source: "shared-flag" });
  });

  it("isolates repos", async () => {
    await writeFile(repoModePath(claudeDir, "/other"), "ultra");
    expect(await ponytail.read(ctx())).toMatchObject({ mode: null, source: "none" });
  });
});
