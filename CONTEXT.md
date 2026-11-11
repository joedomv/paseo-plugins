# Context: plugin-status

A Paseo plugin that shows which Claude Code plugins are active in each agent chat, and at what level.

## Glossary

| Term | Meaning |
|---|---|
| **Installed** | Present in Claude Code's plugin registry on the machine. |
| **Enabled** | Switched on in a settings scope: user, project, or local. A later scope overrides an earlier one. |
| **Loaded** | The running Claude session exposes the plugin's commands. Loaded implies installed and enabled at session start. |
| **Hook-active** | An enabled plugin whose manifest declares a `SessionStart` or `UserPromptSubmit` hook. It injects rules into the session but may have no level. |
| **Mode** | A plugin's current level for one agent, such as `lite`, `full`, `ultra`. `off` is a mode the user chose. Absent means never activated. |
| **Mode source** | Where the mode was read from: a per-session file, a per-repo file, a shared flag, a timeline hint, or an assumed default. |
| **Reader** | A mode-aware detector for one plugin. Knows that plugin's state file layout and rules. Plugins without a reader are hook-active only. |
| **Works across repos** | A plugin loads in every repo, and its mode is isolated per repo (or per session). |
| **Agent** | A Paseo agent. One Claude Code session, with its own session id and working directory. Subagents are separate agents. |
