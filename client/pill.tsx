import type {
  PluginButtonIconProps,
  PluginButtonRegistration,
  PluginClientContext,
} from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useEffect } from "react";

import { pillLabel } from "../shared/status";
import { followAgents, type AgentList, type AgentUpdate } from "./agents";
import { StatusPopover } from "./popover";
import { useStatusQuery } from "./status-query";

const TITLE = "Claude Code plugins";
const PENDING = "plugins…";

/**
 * Paseo draws the pill from a plain description, so the label cannot come from
 * a render. The icon is the one part that is a component: it runs the query
 * and pushes the label back into the registration. The host mounts it only
 * while that agent's composer is on screen, which keeps the reads bounded.
 */
function createPillIcon(agentId: string, pill: { current?: PluginButtonRegistration }) {
  return function StatusPillIcon({ size, color }: PluginButtonIconProps) {
    const query = useStatusQuery(agentId);
    let label = PENDING;
    if (query.data) {
      if (!query.data.sessionId) label = PENDING;
      else label = pillLabel(query.data) || "no plugins";
    }
    useEffect(() => {
      pill.current?.update({ label });
    }, [pill, label]);
    return <Icon name="Blocks" size={size} color={color} />;
  };
}

/** One pill per Claude agent on the host, for the client entry's lifetime. */
export function contributePills(client: PluginClientContext) {
  const pills = new Map<string, { workspaceId: string; registration: PluginButtonRegistration }>();
  let stopped = false;

  function addPill(agentId: string, workspaceId: string) {
    if (stopped) return;
    const current = pills.get(agentId);
    if (current?.workspaceId === workspaceId) return;
    if (current) removePill(agentId);
    const pill: { current?: PluginButtonRegistration } = {};
    pill.current = client.addComposerPill({
      id: "plugin-status",
      workspaceId,
      agentId,
      button: {
        title: TITLE,
        label: PENDING,
        icon: createPillIcon(agentId, pill),
        behavior: { kind: "popover", Content: StatusPopover },
      },
    });
    pills.set(agentId, { workspaceId, registration: pill.current });
  }

  function removePill(agentId: string) {
    pills.get(agentId)?.registration.remove();
    pills.delete(agentId);
  }

  function consider(agent: { id: string; workspaceId?: string | null; provider: string }) {
    if (agent.provider === "claude" && agent.workspaceId) addPill(agent.id, agent.workspaceId);
    else removePill(agent.id);
  }

  const unfollow = followAgents(client.paseo, {
    snapshot(list: AgentList) {
      if (stopped) return;
      const listed = new Set(list.entries.map(({ agent }) => agent.id));
      for (const id of [...pills.keys()]) if (!listed.has(id)) removePill(id);
      for (const { agent } of list.entries) consider(agent);
    },
    update(update: AgentUpdate) {
      if (update.kind === "remove") removePill(update.agentId);
      else consider(update.agent);
    },
  });

  return () => {
    stopped = true;
    unfollow();
    for (const { registration } of pills.values()) registration.remove();
    pills.clear();
  };
}
