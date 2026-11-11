# Plugin status

Shows which Claude Code or Codex plugins are active in each Claude and Codex agent, and at what level.

A composer pill on every Claude and Codex agent reads like `CAVEMAN · PONYTAIL:ULTRA`. Its popover explains why: whether each plugin is installed, in which settings scope it is enabled, whether the running session loaded it, whether it injects rules through a `SessionStart` or `UserPromptSubmit` hook, and the current mode with the file it was read from.

## How it works

Every enabled plugin (Claude Code registry for Claude agents, `~/.codex/config.toml` for Codex agents) whose manifest declares a `SessionStart` or `UserPromptSubmit` hook is listed as hook-active. Plugins with a mode, today caveman and ponytail, also get a level in the pill, read from the same per-session or per-repo file their own statusline badge reads. Shared flags are used only as a labelled fallback. The pill re-reads at the start and end of every turn.

## Setup

Paseo 0.9 or later with a Claude or Codex provider. The plugin reads `~/.claude` (or `$CLAUDE_CONFIG_DIR`) and `~/.codex` (or `$CODEX_HOME`) on the daemon machine. It changes nothing.

## Known limits

Paseo launches Claude with `CLAUDE_CODE_ENTRYPOINT=sdk-cli`, and caveman 4 starts such sessions off unless `CAVEMAN_DEFAULT_MODE` is set in the `env` map of `~/.claude/settings.json`. The popover says so when that is the likely cause.

ponytail keeps one level per repository under Claude Code, so two agents in the same directory show the same level. Paseo worktrees are separate directories. Under Codex it keeps one level for all threads, and Codex runs plugin hooks only after you trust them, so a Codex agent shows no level until then.
