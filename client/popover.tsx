import type { PluginButtonContentProps, PluginHostProps } from "@getpaseo/plugin/client";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import type { PluginStatus } from "../shared/status";
import { useStatusQuery } from "./status-query";

const SOURCE_LABEL: Record<PluginStatus["modeSource"], string> = {
  "session-file": "per-session file",
  "repo-file": "per-repo file",
  "shared-flag": "shared flag",
  none: "nothing recorded",
};

function yesNo(value: boolean | null): string {
  return value === null ? "?" : value ? "✓" : "✗";
}

type Target = { workspaceId: string; agentId: string };

/** Built once per client entry; `openTab` opens the Plugins tab for the pill's agent. */
export function createStatusPopover(openTab: (target: Target) => void) {
  return function StatusPopover(props: PluginButtonContentProps) {
    if (props.context !== "agent") return null;
    const target = { workspaceId: props.workspaceId, agentId: props.agentId };
    return (
      <Body
        theme={props.theme}
        agentId={props.agentId}
        openTab={() => {
          openTab(target);
          props.close();
        }}
      />
    );
  };
}

function Body({ theme, agentId, openTab }: { theme: PluginHostProps["theme"]; agentId: string; openTab: () => void }) {
  const query = useStatusQuery(agentId);
  const styles = useMemo(
    () => ({
      root: { gap: 10, minWidth: 260, maxWidth: 420 },
      muted: { color: theme.colors.foregroundMuted, fontSize: 12 },
      title: { color: theme.colors.foreground, fontSize: 14, fontWeight: "600" as const },
      on: { color: theme.colors.statusSuccess, fontSize: 14, fontWeight: "600" as const },
      body: { color: theme.colors.foreground, fontSize: 12 },
      warn: { color: theme.colors.statusWarning, fontSize: 12 },
      danger: { color: theme.colors.statusDanger, fontSize: 12 },
      link: { color: theme.colors.accent, fontSize: 12 },
    }),
    [theme],
  );

  if (query.error) return <Text style={styles.danger}>{String(query.error)}</Text>;
  if (!query.data) return <Text style={styles.muted}>Reading…</Text>;
  const { sessionId, plugins, provider } = query.data;

  return (
    <View style={styles.root}>
      <Pressable accessibilityRole="button" accessibilityLabel="Open the Plugins tab" hitSlop={8} onPress={openTab}>
        <Text style={styles.link}>Open tab</Text>
      </Pressable>
      {provider !== "claude" ? (
        <Text style={styles.warn}>Claude Code plugins apply only to Claude agents.</Text>
      ) : sessionId ? (
        <Text style={styles.muted}>session {sessionId}</Text>
      ) : (
        <Text style={styles.warn}>Session not open yet. Plugins load on the first turn.</Text>
      )}
      {plugins.length === 0 ? <Text style={styles.muted}>No hook-active Claude Code plugins.</Text> : null}
      {plugins.map((p) => (
        <View key={p.id} style={{ gap: 2 }}>
          <Text style={p.badge ? styles.on : styles.title}>
            {p.id}
            {p.version ? ` ${p.version}` : ""}
            {p.mode ? ` — ${p.badge ?? p.mode}` : ""}
            {p.mode && p.badge && p.badge.toLowerCase() !== p.mode ? ` (${p.mode})` : ""}
          </Text>
          <Text style={styles.body}>
            installed {yesNo(p.installed)} · enabled {p.enabledScope} · loaded {yesNo(p.loaded)} · hook-active{" "}
            {yesNo(p.hookActive)}
            {p.hookEvents.length ? ` (${p.hookEvents.join(", ")})` : ""}
          </Text>
          {p.installed && p.enabledScope === "none" ? (
            <Text style={styles.muted}>disabled in Claude Code settings</Text>
          ) : null}
          {p.mode ? (
            <Text style={styles.muted}>
              mode from {SOURCE_LABEL[p.modeSource]}
              {p.modePath ? `: ${p.modePath}` : ""}
            </Text>
          ) : p.hookActive && !p.reader ? (
            <Text style={styles.muted}>injects rules every session; no reader, so no level to show</Text>
          ) : p.hookActive && sessionId ? (
            <Text style={styles.muted}>no mode recorded for this agent</Text>
          ) : null}
          {p.note ? <Text style={styles.warn}>{p.note}</Text> : null}
        </View>
      ))}
    </View>
  );
}
