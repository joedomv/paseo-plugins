import type { PluginAgentPanelProps, PluginHostProps } from "@getpaseo/plugin/client";
import { ScrollView } from "@getpaseo/plugin/client/ui";
import { useMemo } from "react";
import { Text, View } from "react-native";

import type { PluginStatus } from "../shared/status";
import { useStatusQuery } from "./status-query";

const SOURCE_LABEL: Record<PluginStatus["modeSource"], string> = {
  "session-file": "per-session file",
  "repo-file": "per-repo file",
  "shared-flag": "shared flag",
  none: "nothing recorded",
};

const COLUMNS: Array<[string, number]> = [
  ["Plugin", 150],
  ["Level", 130],
  ["Installed", 90],
  ["Enabled", 70],
  ["Loaded", 60],
  ["Hook-active", 90],
];

function yesNo(value: boolean | null): string {
  return value === null ? "?" : value ? "✓" : "✗";
}

/** What the row's second line says about where the level came from. */
function detail(p: PluginStatus, sessionOpen: boolean): { text: string; warn: boolean } | null {
  if (p.mode) {
    return { text: `mode from ${SOURCE_LABEL[p.modeSource]}${p.modePath ? `: ${p.modePath}` : ""}`, warn: false };
  }
  if (p.installed && p.enabledScope === "none") return { text: "disabled in Claude Code settings", warn: false };
  if (!p.installed) return { text: "not installed", warn: false };
  if (p.hookActive && !p.reader) {
    return { text: `injects rules every session (${p.hookEvents.join(", ")}); no reader, so no level to show`, warn: false };
  }
  if (p.hookActive && sessionOpen) return { text: "no mode recorded for this agent", warn: false };
  return null;
}

export function StatusPanel({ theme, layout, params }: PluginAgentPanelProps) {
  return <Body theme={theme} compact={layout.compact} agentId={params.agentId} />;
}

function Body({ theme, compact, agentId }: { theme: PluginHostProps["theme"]; compact: boolean; agentId: string }) {
  const query = useStatusQuery(agentId);
  const styles = useMemo(
    () => ({
      screen: { flex: 1, padding: compact ? 16 : 24, gap: 12, backgroundColor: theme.colors.surface0 },
      title: { color: theme.colors.foreground, fontSize: compact ? 18 : 20, fontWeight: "600" as const },
      muted: { color: theme.colors.foregroundMuted, fontSize: 12 },
      warn: { color: theme.colors.statusWarning, fontSize: 12 },
      danger: { color: theme.colors.statusDanger, fontSize: 13 },
      head: { flexDirection: "row" as const, borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingBottom: 6 },
      headCell: { color: theme.colors.foregroundMuted, fontSize: 11, textTransform: "uppercase" as const, letterSpacing: 0.5 },
      row: { paddingVertical: 8, gap: 3, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
      cells: { flexDirection: "row" as const, alignItems: "center" as const },
      cell: { color: theme.colors.foreground, fontSize: 13 },
      name: { color: theme.colors.foreground, fontSize: 13, fontWeight: "600" as const },
      on: { color: theme.colors.statusSuccess, fontSize: 13, fontWeight: "600" as const },
      off: { color: theme.colors.foregroundMuted, fontSize: 13, fontWeight: "600" as const },
      level: { color: theme.colors.foreground, fontSize: 13, fontFamily: "Menlo" },
    }),
    [theme, compact],
  );

  if (query.error) return <View style={styles.screen}><Text style={styles.danger}>{String(query.error)}</Text></View>;
  if (!query.data) return <View style={styles.screen}><Text style={styles.muted}>Reading…</Text></View>;
  const { sessionId, cwd, provider, plugins } = query.data;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.surface0 }} contentContainerStyle={styles.screen}>
      <Text style={styles.title}>Claude Code plugins</Text>
      {provider !== "claude" ? (
        <Text style={styles.warn}>Claude Code plugins apply only to Claude agents.</Text>
      ) : sessionId ? (
        <Text style={styles.muted}>session {sessionId} · {cwd}</Text>
      ) : (
        <Text style={styles.warn}>Session not open yet. Plugins load on the first turn.</Text>
      )}
      {!compact ? (
        <View style={styles.head}>
          {COLUMNS.map(([label, width]) => (
            <Text key={label} style={[styles.headCell, { width }]}>{label}</Text>
          ))}
        </View>
      ) : null}
      {plugins.length === 0 ? <Text style={styles.muted}>No hook-active Claude Code plugins.</Text> : null}
      {plugins.map((p) => {
        const nameStyle = p.badge ? styles.on : p.enabledScope === "none" ? styles.off : styles.name;
        const level = p.badge ?? p.mode ?? "—";
        const cells = [
          `${yesNo(p.installed)}${p.version ? ` ${p.version}` : ""}`,
          p.enabledScope,
          yesNo(p.loaded),
          yesNo(p.hookActive),
        ];
        const note = detail(p, sessionId !== null);
        return (
          <View key={p.id} style={styles.row}>
            {compact ? (
              <>
                <Text style={nameStyle}>{p.id} <Text style={[styles.level, p.badge ? styles.on : null]}>{level}</Text></Text>
                <Text style={styles.muted}>
                  installed {cells[0]} · enabled {cells[1]} · loaded {cells[2]} · hook-active {cells[3]}
                </Text>
              </>
            ) : (
              <View style={styles.cells}>
                <Text style={[nameStyle, { width: COLUMNS[0][1] }]}>{p.id}</Text>
                <Text style={[styles.level, p.badge ? styles.on : null, { width: COLUMNS[1][1] }]}>{level}</Text>
                {cells.map((cell, i) => (
                  <Text key={COLUMNS[i + 2][0]} style={[styles.cell, { width: COLUMNS[i + 2][1] }]}>{cell}</Text>
                ))}
              </View>
            )}
            {note ? <Text style={styles.muted}>{note.text}</Text> : null}
            {p.note ? <Text style={styles.warn}>{p.note}</Text> : null}
          </View>
        );
      })}
      <Text style={styles.muted}>Re-reads at the start and end of every turn.</Text>
    </ScrollView>
  );
}
