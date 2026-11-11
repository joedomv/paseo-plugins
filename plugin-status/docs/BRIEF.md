# Build brief: plugin-status

Read `CONTEXT.md` first. `docs/original-build-guide.md` is the starting design; the facts below override it where they differ.

## Goal

A public Paseo plugin (npm `paseo-plugin-status`, plugin id `plugin-status`, MIT) that puts a composer pill on every Claude Code agent reading like `CAVEMAN · PONYTAIL:ULTRA`, with a popover that explains why: installed, enabled scope, loaded, mode, mode source. Anyone can install it and see their own hook-active plugins on day one.

## Decisions already made

1. Two layers. **Generic detection**: every enabled Claude Code plugin whose manifest declares `SessionStart` or `UserPromptSubmit` hooks is hook-active and listed in the popover. **Readers**: a code table in `server/readers/` with one entry per mode-aware plugin. Launch readers: caveman, ponytail. New readers arrive by PR; the README explains how.
2. The pill label shows only plugins with a reader and a mode other than `off`. The popover shows everything hook-active.
3. Per-agent and honest. Each reader's primary source is the real per-session or per-repo file. Shared flags are fallback only, labelled as such.
4. Refresh when a turn ends. Timeline hints (`/caveman ultra` seen in a user message) are a cache, never the truth.
5. Paseo >= 0.9.0 (installed daemon is 0.9.2). Layout and packaging follow `@gpambrozio/paseo-skills`: `paseo-plugin.json`, `index.client.tsx`, `index.server.ts`, `client/`, `server/`, `shared/`, `npm run typecheck`, vitest.
6. Keep it small. No registry, no config file, no abstraction with one implementation.

## Verified facts (2026-11-04, this machine)

### caveman 4.0.1 (plugin from marketplace `JuliusBrussee/caveman`)
- Hooks in `.claude-plugin/plugin.json`: `SessionStart`, `SubagentStart`, `UserPromptSubmit`, `SessionEnd`. Scripts under `src/hooks/`.
- Per-session mode: `$CLAUDE_CONFIG_DIR/.caveman-sessions/<session_id>.mode` (default `~/.claude`). Written on every session start, including `off`. File permissions 0600.
- Shared mirror `.caveman-active` is never written with `off`; deactivation deletes it. Fallback only.
- Modes: `off | caveman | ultracave | megacave | lite | full | ultra | wenyan-lite | wenyan-full | wenyan-ultra | commit | review | compress` plus `manual`. Badge mapping in `src/hooks/caveman-statusline.sh`: `caveman|lite|full` -> `CAVEMAN`, `ultracave|ultra` -> `ULTRACAVE`, `megacave|wenyan*` -> `MEGACAVE`.
- Any `CLAUDE_CODE_ENTRYPOINT` matching `^sdk-` starts in `manual` and records `off` unless `CAVEMAN_DEFAULT_MODE` is set in the environment. Paseo agents report `sdk-cli`. This machine sets `CAVEMAN_DEFAULT_MODE=full` via the `env` map in `~/.claude/settings.json`. Other users may not; the popover should say "off (SDK session; set CAVEMAN_DEFAULT_MODE)" when the entrypoint rule is the likely cause.

### ponytail 5.3.3 (plugin from marketplace `DietrichGebert/ponytail`)
- Hooks in `hooks/claude-codex-hooks.json`: `SessionStart`, `SubagentStart`, `UserPromptSubmit`. Also `hooks/claude-band.json` (a terminal band; irrelevant in Paseo).
- Per-repo mode: `$CLAUDE_CONFIG_DIR/ponytail-modes/<sha256 hex of path.normalize(CLAUDE_PROJECT_DIR)>`. Verified: cwd `/Users/joed/workspace/personal` -> `e32c9048…333bd`. Key with the agent's `cwd`.
- Shared flag `.ponytail-active` is still written (last write wins). Fallback only.
- Modes: `off | lite | full | ultra`. `off` is written literally. Empty file historically meant `full`.
- Sessions in the same repo share one mode. Paseo worktrees under `~/.paseo/worktrees/` are distinct project dirs.

### Claude Code 2.1.312
- Installed registry: `~/.claude/plugins/installed_plugins.json` is `{ "version": 2, "plugins": ["caveman@caveman", "ponytail@ponytail", …] }`. A flat array of `name@marketplace`, not a map. The guide's parser is wrong.
- Enabled: `enabledPlugins` map keyed by `name@marketplace` in `~/.claude/settings.json`, `<cwd>/.claude/settings.json`, `<cwd>/.claude/settings.local.json`.
- Plugin cache: `~/.claude/plugins/cache/<marketplace>/<name>/<version>/`. Manifest at `.claude-plugin/plugin.json`; its `hooks` field is either an inline object, a path string, or an array of paths to JSON files shaped `{ "hooks": { "SessionStart": […] } }`. Generic detection reads these.
- `node` resolves inside Paseo-launched hooks on this machine (ponytail's node hook ran under Paseo).

### Paseo 0.9.2
- `agent.runtimeInfo?.sessionId` after `refresh()` is the Claude `session_id`; null until the session opens. `agent.cwd` is the project dir.
- Existing plugin for reference: `~/.paseo/plugins/skills/*/node_modules/@gpambrozio/paseo-skills` (pill, panel, RPC, directory subscription, packaging).
- Docs: https://paseo.sh/docs/plugins/reference and https://paseo.sh/docs/sdk/agents. The `paseo-plugin` skill is available in Claude Code for the plugin API.

## Test matrix

1. Fresh agent, no messages: pill `plugins…`, popover says session not open yet.
2. First turn: `CAVEMAN · PONYTAIL`, sources `session-file` and `repo-file`.
3. `/caveman ultra` -> `ULTRACAVE · PONYTAIL`. `/ponytail lite` -> `… PONYTAIL:LITE`.
4. `stop caveman` -> caveman leaves the label; popover shows `off`, source `session-file`.
5. Second agent in a different repo at a different ponytail level: first agent's pill unchanged.
6. Second agent in the same repo: both show the same ponytail level (upstream behaviour; say so in the popover).
7. Disable a plugin in Claude Code, start a new agent: enabled `none`, loaded ✗, not hook-active.
8. A hook plugin with no reader (ss-no-slop, i-have-adhd) appears in the popover as hook-active with no mode.

## Deliverables

- Working plugin installed locally via `paseo plugin install <dir>`, passing the matrix above.
- README for strangers: install, what it detects, the SDK/caveman caveat, how to add a reader.
- `CHANGELOG.md`, MIT `LICENSE`, `package.json` with the `files` list.
- Do not publish to npm or push to GitHub; the owner does both.
