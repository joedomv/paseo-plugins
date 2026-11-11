# paseo-plugin-status

A [Paseo](https://paseo.sh) plugin that shows which Claude Code or Codex plugins are active in each agent chat, and at what level.

Every Claude and Codex agent gets a composer pill like `CAVEMAN · PONYTAIL:ULTRA`. Open it and the popover says why: installed, enabled scope, loaded in this session, hook-active, mode, and the file the mode was read from.

## Install

```bash
paseo plugin install npm:paseo-plugin-status
```

Or from a checkout:

```bash
git clone https://github.com/joed/paseo-plugin-status
paseo plugin install /absolute/path/to/paseo-plugin-status
```

Requires Paseo 0.9 or later with plugins enabled (Settings → Plugins) and a Claude or Codex provider.

## What it detects

Two layers, both read on the daemon machine. Claude agents use `~/.claude` (or `$CLAUDE_CONFIG_DIR`); Codex agents use `~/.codex` (or `$CODEX_HOME`).

1. **Generic detection.** For a Claude agent, every installed Claude Code plugin is read from `plugins/installed_plugins.json` and its enabled scope from `enabledPlugins` in the user, project and local settings files, later scopes winning. For a Codex agent, plugins come from the `[plugins."name@marketplace"]` tables in `config.toml` (`enabled = false` means off) and the newest directory under `plugins/cache/<marketplace>/<name>/`. Either way the manifest's `hooks` (inline, a path, a list of paths, or the conventional `hooks/hooks.json`; `.claude-plugin/plugin.json` or `.codex-plugin/plugin.json`) decides whether it is *hook-active*: enabled and declaring a `SessionStart` or `UserPromptSubmit` hook, so it injects rules into the session. Hook-active plugins appear in the popover whether or not they have a level.
2. **Readers.** One entry per mode-aware plugin in `server/readers/`. A reader knows where that plugin records its level for one agent and how to turn the level into pill text. Only plugins with a reader and a mode other than `off` appear in the pill label.

Launch readers:

| Plugin | Claude Code source of truth | Claude Code fallback | Codex |
|---|---|---|---|
| caveman 4.x | `.caveman-sessions/<session_id>.mode`, per session | `.caveman-active`, shared, labelled | not supported upstream |
| ponytail 5.x | `ponytail-modes/<sha256 of the project dir>`, per repo | `.ponytail-active`, shared, labelled | `.ponytail-active` under `plugins/data`, one level for all threads |

Loaded means the running session reports a command or skill namespaced to the plugin. Plugins that ship no commands show `?` there.

The pill re-reads at the start and end of every turn. It says `plugins…` until the Claude session has opened.

## The caveman and SDK caveat

Paseo launches Claude Code with `CLAUDE_CODE_ENTRYPOINT=sdk-cli`. caveman 4 treats any `sdk-*` entrypoint as a manual session and records `off`, unless `CAVEMAN_DEFAULT_MODE` is set in the environment. Add it to the `env` map in `~/.claude/settings.json`:

```json
{ "env": { "CAVEMAN_DEFAULT_MODE": "full" } }
```

Without it the popover shows caveman as `off (SDK session; set CAVEMAN_DEFAULT_MODE …)`. `/caveman` in the chat still turns it on for that session.

ponytail keeps one level per repository under Claude Code, so two agents in the same directory share a level and the popover says so. Paseo worktrees are separate directories.

## Codex

Codex runs a plugin's hooks only after you review and trust them (`/hooks` in the Codex CLI, or Settings → Hooks in the app). Until then a Codex agent shows ponytail as installed, enabled, loaded and hook-active with no level, and the popover says why. Under Codex ponytail keeps one level for every thread, so the source is always the shared flag.

## Adding a reader

1. Create `server/readers/<plugin>.ts` exporting a `Reader` (see `server/readers/types.ts`): `id` is the plugin name, `read()` gets the provider, both config dirs, the session id and the cwd, and returns the mode and where it came from; `badge()` turns a mode into pill text or `null` for off. A plugin without Codex support returns a note for `provider === "codex"`.
2. Add it to the `readers` array in `server/readers/index.ts`.
3. Add a vitest file next to it that writes the plugin's real state file layout into a temp dir. `server/readers/ponytail.test.ts` is the template.
4. Add a row to the table above.

Readers must read the plugin's real per-session or per-repo file first. A shared flag is a fallback only, with `source: "shared-flag"` and a note, because it can belong to another agent.

## Development

```bash
npm install
npm run typecheck
npm test
paseo plugin install /absolute/path/to/paseo-plugin-status
paseo plugin reload plugin-status   # after edits
paseo plugin logs plugin-status
```

## License

MIT
