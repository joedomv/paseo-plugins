import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { installedPlugins, parsePluginTables } from "./codex";

const TOML = `
[marketplaces.ponytail]
source = "x"

[plugins."ponytail@ponytail"]
enabled = true

[plugins."i-have-adhd@i-have-adhd"]
enabled = false

[plugins."sites@openai-bundled"]

[features]
enabled = false
`;

describe("codex plugins", () => {
  it("parses plugin tables and their enabled flag", () => {
    expect(parsePluginTables(TOML)).toEqual([
      { key: "ponytail@ponytail", enabled: true },
      { key: "i-have-adhd@i-have-adhd", enabled: false },
      { key: "sites@openai-bundled", enabled: true },
    ]);
  });

  it("resolves the newest cached version directory", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "codex-"));
    await writeFile(path.join(dir, "config.toml"), TOML);
    await mkdir(path.join(dir, "plugins", "cache", "ponytail", "ponytail", "5.3.2"), { recursive: true });
    await mkdir(path.join(dir, "plugins", "cache", "ponytail", "ponytail", "5.3.3"), { recursive: true });
    const [ponytail, adhd] = await installedPlugins(dir);
    expect(ponytail).toEqual({
      key: "ponytail@ponytail",
      name: "ponytail",
      version: "5.3.3",
      installPath: path.join(dir, "plugins", "cache", "ponytail", "ponytail", "5.3.3"),
      enabled: true,
    });
    expect(adhd).toMatchObject({ name: "i-have-adhd", version: null, installPath: null, enabled: false });
  });
});
