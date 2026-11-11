# Build guide: `plugin-status` — a Paseo plugin that shows which Claude Code plugins are active in a chat

Goal: a composer pill on every Claude Code agent in Paseo that reads like
`🪨 CAVEMAN:ULTRA · ✂ PONYTAIL:LITE`, with a popover/panel that says *why* it
thinks so (installed → enabled → loaded in this session → current mode).
Nothing in the Paseo ecosystem does this yet; the closest is gpambrozio's
`skills` plugin, which lists what's *available*, not what's *on*.

---

## 1. Why this needs its own plugin

- Caveman and ponytail work through Claude Code **lifecycle hooks**
  (`SessionStart`, `UserPromptSubmit`). Hook output is injected as hidden
  context — it never appears as a timeline item, so you can't see it in the
  transcript.
- Both plugins expose their state through a **statusline badge**. Paseo's
  default Claude provider runs through the Agent SDK, so there is no
  statusline. That's the gap.
- The badge scripts read a **flag file**. That file is the bridge you'll
  read too — same source of truth as the badge, no guessing.

---

## 2. Where the state actually lives (verified against the repos)

### caveman (JuliusBrussee/caveman)

- Hooks (shipped in the plugin manifest): `SessionStart` →
  `hooks/caveman-activate.js`, `UserPromptSubmit` → `hooks/caveman-mode-tracker.js`.
- Per-session mode: `$CLAUDE_CONFIG_DIR/.caveman-sessions/<session_id>.mode`
  (falls back to `~/.claude/`). Keyed by the `session_id` Claude Code puts in
  every hook payload.
- Compat mirror: `$CLAUDE_CONFIG_DIR/.caveman-active` — last-write-wins across
  sessions, **never contains `off`**; deactivation deletes it. Treat it as a
  fallback only.
- Valid modes: `lite | full | ultra | wenyan-lite | wenyan-full | wenyan-ultra | off`.
  Empty/absent in the mirror historically meant `full`.
- Badge format the statusline renders: `[CAVEMAN]` for full, `[CAVEMAN:ULTRA]` etc.

### ponytail (DietrichGebert/ponytail)

- `hooks/hooks.json`: `SessionStart` (matcher `startup|resume|clear|compact`) →
  `hooks/ponytail-activate.js`; `UserPromptSubmit` → `hooks/ponytail-mode-tracker.js`.
  Both are `node` scripts, so node must be on the daemon's non-interactive PATH.
- Legacy flag: `.ponytail-active` in the same state dir (last-write-wins).
- Per-session: `<state dir>/.ponytail-sessions/<session_id>` — introduced by
  PR #893 to fix concurrent sessions clobbering each other. **Check whether the
  version you have installed includes it**; if not, only the legacy flag exists.
  With per-session files, `off` is recorded as the literal string `off` (unlike caveman).
- Modes: `lite | full | ultra | off`. Badge: `[PONYTAIL]`, `[PONYTAIL:ULTRA]`.

### "Installed / enabled" (Claude Code itself)

- `~/.claude/plugins/installed_plugins.json` — what's installed and from which marketplace.
- `enabledPlugins` map in `~/.claude/settings.json` (user), `<cwd>/.claude/settings.json`
  (project) and `<cwd>/.claude/settings.local.json` (local). Later scopes override earlier.

Before writing any code, `cat` these on your machine with a Paseo-launched
Claude agent running, and switch modes with `/caveman ultra` / `/ponytail lite`
to confirm the paths. Five minutes here saves an hour later.

---

## 3. What Paseo gives you

From the plugin reference and SDK docs:

- **Provider session id**: `agent.runtimeInfo?.sessionId` after
  `paseo.agents.ref(id).refresh()`. This is the Claude Code `session_id` — the
  key for the per-session files above. It's `null` until the session has opened.
- **Loaded commands**: `await agent.commands()` returns what the *running
  session* loaded. If `caveman` / `ponytail` commands are in that list, the
  plugin is loaded in this session regardless of what the files say.
- **Lifecycle hooks (server side)**: `server.on("agent.turn_started" | "agent.turn_ended", …)`.
  `turn_ended` hands you the full `timeline`, so you can spot `/caveman x` and
  `/ponytail x` user messages as a secondary signal and as a refresh trigger.
- **UI**: `client.addComposerPill({ id, workspaceId, agentId, button })` returns
  `{ update, remove }`; `client.addWorkspacePanel({ context: "agent", … })` for a
  detail view; `useAgent`, `useRpc`, `defineRpc` for the plumbing.
- **Agent snapshot fields** you'll use: `id`, `workspaceId`, `provider`, `cwd`,
  `status`, `parentAgentId`.

Signal ranking (highest confidence first):

1. Per-session file for this `sessionId` → authoritative mode.
2. `agent.commands()` contains the plugin's commands → loaded in session (mode = plugin default unless #1 says otherwise).
3. Installed + enabled in settings → will load on next session.
4. Slash command seen in timeline → used to trigger a re-read, and as a last-resort mode hint.
5. Legacy `.caveman-active` / `.ponytail-active` → only when no `sessionId` is available.

---

## 4. Build steps

### Step 0 — prerequisites

- Paseo ≥ 0.8.0 on daemon and client (the plugin API had a breaking change at 0.8).
- Settings → Plugins → **Enable plugins**.
- `node` on the daemon's PATH (both for ponytail's hooks and for `paseo plugin init`).

### Step 1 — scaffold

```bash
paseo plugin init /Users/joed/Github/paseo-plugin-status
cd /Users/joed/Github/paseo-plugin-status
```

`paseo-plugin.json`:

```json
{
  "id": "plugin-status",
  "description": "Shows which Claude Code plugins (caveman, ponytail, …) are active in each chat",
  "requirements": { "paseo": ">=0.8.0" }
}
```

Layout you'll end up with:

```
paseo-plugin.json
index.client.tsx        # pills, panel, slash command
index.server.ts         # RPC handler + lifecycle hooks
shared/status.ts        # zod contract (both bundles)
server/readers.ts       # file + settings readers (Node only)
server/detect.ts        # combine signals into a status
client/pill.tsx         # pill label + popover content
client/panel.tsx        # agent panel
```

Rule to remember: nothing at the plugin root except the two entries; `server/`
can't be imported by `client/` and vice versa; `shared/` imports only `zod`.

### Step 2 — the contract (`shared/status.ts`)

```ts
import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const pluginStatus = z.object({
  id: z.enum(["caveman", "ponytail"]),
  installed: z.boolean(),
  enabledScope: z.enum(["user", "project", "local", "none"]),
  loadedInSession: z.boolean(),          // from agent.commands()
  mode: z.string().nullable(),           // "ultra", "lite", "off", null = unknown
  modeSource: z.enum(["session-file", "legacy-flag", "timeline", "default", "none"]),
});

export const readStatus = defineRpc({
  name: "plugin-status.read",
  input: z.object({ agentId: z.string() }),
  output: z.object({
    sessionId: z.string().nullable(),
    cwd: z.string(),
    plugins: z.array(pluginStatus),
  }),
});

export type PluginStatus = z.output<typeof pluginStatus>;
export type StatusReport = z.output<typeof readStatus.output>;
```

### Step 3 — readers (`server/readers.ts`)

Keep every filesystem touch here. All reads are best-effort and swallow errors —
a missing file is a valid state ("not active"), not a failure.

```ts
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude");

async function readText(p: string): Promise<string | null> {
  try { return (await fs.readFile(p, "utf8")).trim(); } catch { return null; }
}
async function readJson<T>(p: string): Promise<T | null> {
  const t = await readText(p);
  if (t === null) return null;
  try { return JSON.parse(t) as T; } catch { return null; }
}

// --- installed / enabled -------------------------------------------------

export async function installedPluginIds(): Promise<Set<string>> {
  const doc = await readJson<{ plugins?: Record<string, unknown> }>(
    path.join(CLAUDE_DIR, "plugins", "installed_plugins.json"),
  );
  // keys look like "caveman@caveman", "ponytail@ponytail"
  return new Set(Object.keys(doc?.plugins ?? {}).map((k) => k.split("@")[0]));
}

type Scope = "user" | "project" | "local";
export async function enabledScope(pluginId: string, cwd: string): Promise<Scope | "none"> {
  const files: Array<[Scope, string]> = [
    ["user", path.join(CLAUDE_DIR, "settings.json")],
    ["project", path.join(cwd, ".claude", "settings.json")],
    ["local", path.join(cwd, ".claude", "settings.local.json")],
  ];
  let result: Scope | "none" = "none";
  for (const [scope, file] of files) {
    const doc = await readJson<{ enabledPlugins?: Record<string, boolean> }>(file);
    const entries = Object.entries(doc?.enabledPlugins ?? {});
    for (const [key, on] of entries) {
      if (key.split("@")[0] === pluginId) result = on ? scope : "none"; // later scope wins
    }
  }
  return result;
}

// --- per-session mode files ---------------------------------------------

const VALID_CAVEMAN = new Set(["lite", "full", "ultra", "wenyan-lite", "wenyan-full", "wenyan-ultra", "off"]);
const VALID_PONYTAIL = new Set(["lite", "full", "ultra", "off"]);

export async function cavemanMode(sessionId: string | null) {
  if (sessionId) {
    const m = await readText(path.join(CLAUDE_DIR, ".caveman-sessions", `${sessionId}.mode`));
    if (m !== null && VALID_CAVEMAN.has(m)) return { mode: m, source: "session-file" as const };
  }
  const legacy = await readText(path.join(CLAUDE_DIR, ".caveman-active"));
  if (legacy === null) return { mode: null, source: "none" as const };
  // mirror never holds "off"; empty historically meant "full"
  return { mode: legacy === "" ? "full" : legacy, source: "legacy-flag" as const };
}

export async function ponytailMode(sessionId: string | null) {
  if (sessionId) {
    const m = await readText(path.join(CLAUDE_DIR, ".ponytail-sessions", sessionId));
    if (m !== null && VALID_PONYTAIL.has(m)) return { mode: m, source: "session-file" as const };
  }
  const legacy = await readText(path.join(CLAUDE_DIR, ".ponytail-active"));
  if (legacy === null) return { mode: null, source: "none" as const };
  return { mode: legacy === "" ? "full" : legacy, source: "legacy-flag" as const };
}
```

Two things to verify on your machine before trusting this: (a) ponytail's state
dir — open `ponytail-mode-tracker.js` and look at `readMode`/`setMode`; (b) the
exact shape of `installed_plugins.json`, which has changed across Claude Code
versions. Adjust the key parsing if needed.

### Step 4 — combine signals (`server/detect.ts`)

```ts
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type { StatusReport, PluginStatus } from "../shared/status";
import * as r from "./readers";

// last slash command we saw per agent, from lifecycle hooks (Step 5)
export const timelineHints = new Map<string, { caveman?: string; ponytail?: string }>();

export async function detect(agentId: string, { paseo }: PluginHandlerContext): Promise<StatusReport> {
  const agent = paseo.agents.ref(agentId);
  await agent.refresh();
  const sessionId = agent.runtimeInfo?.sessionId ?? null;
  const cwd = agent.cwd ?? "";

  const { commands } = await agent.commands();
  const loaded = new Set(commands.map((c) => c.name.split(":")[0].toLowerCase()));

  const installed = await r.installedPluginIds();
  const hints = timelineHints.get(agentId) ?? {};

  async function one(id: "caveman" | "ponytail"): Promise<PluginStatus> {
    const fileMode = id === "caveman" ? await r.cavemanMode(sessionId) : await r.ponytailMode(sessionId);
    const loadedInSession = [...loaded].some((n) => n === id || n.startsWith(`${id}-`));
    let mode = fileMode.mode;
    let modeSource: PluginStatus["modeSource"] = fileMode.source;
    if (mode === null && hints[id]) { mode = hints[id]!; modeSource = "timeline"; }
    if (mode === null && loadedInSession) { mode = "full"; modeSource = "default"; } // both auto-activate at default
    return {
      id,
      installed: installed.has(id),
      enabledScope: await r.enabledScope(id, cwd),
      loadedInSession,
      mode,
      modeSource,
    };
  }

  return { sessionId, cwd, plugins: [await one("caveman"), await one("ponytail")] };
}
```

Why the `"default"` branch: caveman is on from message one and ponytail
auto-activates at its default level, so "loaded but no mode file yet" almost
always means "on at default". Label it honestly in the UI (`modeSource`) so you
can tell a real read from an assumption.

### Step 5 — server entry (`index.server.ts`)

```ts
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { readStatus } from "./shared/status";
import { detect, timelineHints } from "./server/detect";

const SLASH = /^\/(caveman|ponytail)(?:\s+([a-z-]+))?\s*$/i;

export default function contribute(server: PluginServerContext) {
  server.handle(readStatus, ({ agentId }, ctx) => detect(agentId, ctx));

  // Secondary signal + refresh trigger: catch "/caveman ultra" style user messages.
  server.on("agent.turn_ended", (event) => {
    if (!event.agent.provider.startsWith("claude")) return;
    // Find the latest user-authored text in the timeline. The exact item shape is in
    // @getpaseo/protocol/agent-types (AgentTimelineItem); adjust the predicate to it.
    const lastUser = [...event.timeline].reverse().find((i: any) => i.type === "user_message" || i.role === "user");
    const text: string = (lastUser as any)?.text ?? "";
    const m = SLASH.exec(text.trim());
    if (!m) return;
    const hint = timelineHints.get(event.agent.id) ?? {};
    hint[m[1].toLowerCase() as "caveman" | "ponytail"] = (m[2] ?? "full").toLowerCase();
    timelineHints.set(event.agent.id, hint);
  });

  server.on("agent.archived", (event) => timelineHints.delete(event.agent.id));
  return () => timelineHints.clear();
}
```

Hooks run on the daemon even with no app connected, and event delivery is
best-effort (no replay), so treat `timelineHints` as a cache, never the truth.
The pill re-reads files on every refresh anyway.

### Step 6 — the pill (`client/pill.tsx` + `index.client.tsx`)

Pills are registered per agent from the client entry, so you need to follow the
agent directory: subscribe to the list, register a pill for every Claude agent,
update its label when a turn ends, remove it when the agent goes away. This is
the same pattern as Paseo's `local-plugin` example.

```tsx
// client/pill.tsx
import type { PluginButtonContentProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { Text, View } from "react-native";
import { readStatus, type StatusReport } from "../shared/status";

export function labelFor(report: StatusReport | undefined): string {
  if (!report) return "plugins…";
  const parts = report.plugins
    .filter((p) => p.mode && p.mode !== "off")
    .map((p) => `${p.id.toUpperCase()}${p.mode === "full" ? "" : ":" + p.mode!.toUpperCase()}`);
  return parts.length ? parts.join(" · ") : "no plugins";
}

export function PillPopover({ theme, context }: PluginButtonContentProps) {
  const agentId = context.context === "agent" ? context.agentId : "";
  const read = useRpc(readStatus);
  const q = useQuery({ queryKey: ["plugin-status", agentId], queryFn: () => read({ agentId }), enabled: !!agentId });
  const fg = { color: theme.colors.foreground };
  const muted = { color: theme.colors.foregroundMuted };
  if (!q.data) return <Text style={muted}>Reading…</Text>;
  return (
    <View style={{ gap: 8 }}>
      <Text style={muted}>session {q.data.sessionId ?? "— (not open yet)"}</Text>
      {q.data.plugins.map((p) => (
        <View key={p.id}>
          <Text style={fg}>{p.id} — {p.mode ?? "not active"}</Text>
          <Text style={muted}>
            installed {p.installed ? "✓" : "✗"} · enabled {p.enabledScope} · loaded {p.loadedInSession ? "✓" : "✗"} · via {p.modeSource}
          </Text>
        </View>
      ))}
    </View>
  );
}
```

```tsx
// index.client.tsx
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { readStatus } from "./shared/status";
import { labelFor, PillPopover } from "./client/pill";
import { StatusPanel } from "./client/panel";

export default function contribute(client: PluginClientContext) {
  const pills = new Map<string, { update: (p: any) => void; remove: () => void }>();
  const ac = new AbortController();

  client.addWorkspacePanel({
    id: "status", title: "Plugins", icon: "Blocks", context: "agent", Component: StatusPanel,
  });

  client.addSlashCommand({
    name: "plugins", description: "Show active Claude Code plugins", argumentHint: "",
    context: "agent",
    async onSubmit({ openPanel }) { openPanel("status"); },
  });

  async function refresh(agentId: string) {
    const pill = pills.get(agentId);
    if (!pill) return;
    try {
      const report = await client.paseo.rpc?.(readStatus, { agentId }) ?? null; // see note below
      pill.update({ label: labelFor(report ?? undefined) });
    } catch { /* keep last label */ }
  }

  void (async () => {
    const paseo = client.paseo; // selected host
    const directory = await paseo.agents.list({ subscribe: {} });
    ac.signal.addEventListener("abort", () => void directory.subscription.release());

    const sync = () => {
      const seen = new Set<string>();
      for (const { agent } of directory.entries) {
        if (!agent.provider.startsWith("claude") || !agent.workspaceId || agent.archivedAt) continue;
        seen.add(agent.id);
        if (!pills.has(agent.id)) {
          const reg = client.addComposerPill({
            id: "plugins", workspaceId: agent.workspaceId, agentId: agent.id,
            button: {
              title: "Active Claude Code plugins", icon: "Blocks", label: "plugins…",
              behavior: { kind: "popover", Content: PillPopover },
            },
          });
          pills.set(agent.id, reg);
          void refresh(agent.id);
        } else if (agent.status === "idle") {
          void refresh(agent.id); // a turn just ended → mode may have changed
        }
      }
      for (const [id, reg] of pills) if (!seen.has(id)) { reg.remove(); pills.delete(id); }
    };
    sync();
    directory.subscribe?.(sync);
  })();

  return () => { ac.abort(); for (const reg of pills.values()) reg.remove(); pills.clear(); };
}
```

Note on `refresh`: the typed way to call your own RPC outside a component is the
`rpc(contract, input)` function that Command Center / slash-command callbacks
receive. From the entry you'll either (a) route refreshes through a tiny
invisible component that uses `useRpc`, or (b) keep a `useRpc`-backed query in
`PillPopover` and let the pill label be driven by the popover's cache. Pick (a)
if you want the label live without opening the popover — it's ~15 lines. Check
the `buttons` and `local-plugin` examples in `getpaseo/paseo/plugin-examples`
for the exact directory-subscription API; the docs say to subscribe to an owned
list and re-register on each snapshot.

### Step 7 — the panel (`client/panel.tsx`)

Same data as the popover, more room: a row per plugin with the four signals as
columns, the raw file paths that were read, and a "why" line
(`mode from .caveman-sessions/<id>.mode`). Use `PluginAgentPanelProps`, `useAgent`
for title/provider, `useRpc` + TanStack Query for the report, `theme.colors.*`
for every color, `layout.compact` for padding.

### Step 8 — install, iterate, debug

```bash
npm run typecheck
paseo plugin install /Users/joed/Github/paseo-plugin-status
paseo plugin ls
# after edits:
npm run typecheck && paseo plugin reload plugin-status
paseo plugin logs plugin-status
```

Test matrix (do these in one Paseo Claude agent):

1. Fresh agent, no messages yet → pill shows `plugins…` then resolves; `sessionId` may be null until the first turn.
2. Send "hi" → caveman should show `CAVEMAN` (default full), source `session-file` or `default`.
3. `/caveman ultra` → after the turn, `CAVEMAN:ULTRA`, source `session-file`.
4. `/ponytail lite` → `PONYTAIL:LITE`.
5. `/caveman off` → caveman disappears from the pill; popover shows `off` / `not active`.
6. Open a second Claude agent, set a different level → the first agent's pill must **not** change (this is exactly the concurrent-session bug both plugins fixed; if it changes, you're reading the legacy flag).
7. Disable the plugin in Claude Code, start a new agent → `enabled none`, `loaded ✗`.

---

## 5. Gotchas

- **`CLAUDE_CONFIG_DIR`**: the daemon's environment is not your fish shell's. If
  you set it in `config.fish`, the daemon may not see it. Read it from the
  daemon's env and fall back to `~/.claude`.
- **No session id yet**: `runtimeInfo.sessionId` is null before the provider
  session opens. Show "not open yet" rather than falling through to the legacy
  flag — the legacy flag can belong to a different session.
- **`off` semantics differ**: caveman deletes the mirror and writes `off` in the
  session file; ponytail (post-#893) writes the literal `off`. Your readers
  already handle both; the UI should treat `off` and `null` differently
  ("turned off" vs "never activated").
- **Subagents**: each has its own Claude session, so its own mode files. Pills
  are per agent, so this just works; don't inherit from `parentAgentId`.
- **Resume / compact**: both plugins re-inject at the session's recorded level
  on `resume|clear|compact`, so the file stays valid across compaction.
- **Timeline shape**: `AgentTimelineItem` lives in `@getpaseo/protocol/agent-types`;
  add that package at the same version as `@getpaseo/plugin` to your dev deps
  and type the predicate properly instead of the `any` in Step 5.
- **Event delivery is best-effort** and hook handlers time out at 30s. Keep the
  `turn_ended` handler synchronous and cheap; the RPC does the file I/O.

---

## 6. v2 ideas (once v1 is boring)

- **Generic detection**: instead of hard-coding two plugins, read every
  installed plugin's `hooks/hooks.json` from `~/.claude/plugins/...`, and mark
  any plugin with a `SessionStart`/`UserPromptSubmit` hook as "session-active"
  when it's enabled — mode-aware only for plugins you've written a reader for.
- **Timeline transformer**: `client.addTimelineTransformer` on user messages
  matching `/caveman …` or `/ponytail …` and render them as a mode-change chip
  instead of a plain message.
- **Control, not just display**: popover menu items that run
  `paseo.agents.ref(agentId).send("/caveman ultra")` — the same message the
  user would type, so the plugin's own hook does the state change.
- **Per-plugin defaults from config**: read ponytail's default-mode config /
  env so the `"default"` assumption in Step 4 is the real default, not `full`.

---

## Sources

- Paseo plugin reference — https://paseo.sh/docs/plugins/reference
- Paseo SDK agents (`runtimeInfo.sessionId`, `agent.commands()`) — https://paseo.sh/docs/sdk/agents
- Awesome Paseo plugins — https://github.com/omercnet/awesome-paseo-plugins
- caveman maintainer guide (session-file layout, invariants) — https://github.com/JuliusBrussee/caveman/blob/main/CLAUDE.md
- caveman hooks README (flag file, badge snippet) — https://github.com/JuliusBrussee/caveman/tree/main/hooks
- ponytail hooks.json — https://github.com/DietrichGebert/ponytail/blob/main/hooks/hooks.json
- ponytail per-session mode PR #893 — https://github.com/DietrichGebert/ponytail/pull/893
