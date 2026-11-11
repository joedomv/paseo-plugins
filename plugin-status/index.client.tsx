import type { PluginClientContext } from "@getpaseo/plugin/client";

import { StatusPanel } from "./client/panel";
import { contributePills } from "./client/pill";

export default function contribute(client: PluginClientContext) {
  client.addAgentPanel({
    id: "plugin-status",
    title: "Plugins",
    icon: "Blocks",
    Component: StatusPanel,
  });
  client.addCommandCenterItem({
    id: "open-plugin-status",
    title: "Claude Code plugins",
    icon: "Blocks",
    keywords: ["plugins", "caveman", "ponytail", "plugin status"],
    context: "agent",
    onSelect: ({ openPanel }) => openPanel("plugin-status"),
  });
  client.addSlashCommand({
    name: "plugins",
    description: "Show which Claude Code plugins are active in this chat",
    argumentHint: "",
    context: "agent",
    onSubmit: ({ openPanel }) => openPanel("plugin-status"),
  });
  return contributePills(client, (target) => client.openPanel("plugin-status", target));
}
