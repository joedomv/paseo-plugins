# Changelog

## 0.1.0

- Composer pill on every Claude agent: `CAVEMAN · PONYTAIL:ULTRA`.
- Popover with installed, enabled scope, loaded, hook-active, mode and mode source per plugin.
- Readers for caveman (per-session file) and ponytail (per-repo file).
- Generic detection of every enabled Claude Code plugin with a `SessionStart` or `UserPromptSubmit` hook.
- Codex agents: plugins from `~/.codex/config.toml`, hook-active from `.codex-plugin/plugin.json`, ponytail level from the plugin data flag.
- Plugins agent panel, `/plugins` slash command and Command Center item.
