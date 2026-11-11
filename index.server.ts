import type { PluginServerContext } from "@getpaseo/plugin/server";

import { detect } from "./server/detect";
import { pillLabel, readStatus } from "./shared/status";

export default function contribute(server: PluginServerContext) {
  server.handle(readStatus, ({ agentId }, context) => detect(agentId, context));
  // TEMP matrix check: log what the pill would show after every turn.
  server.on("agent.turn_ended", async ({ agent }, context) => {
    if (agent.provider !== "claude") return;
    const report = await detect(agent.id, context);
    console.log(
      `[matrix] agent=${agent.id} cwd=${agent.cwd} session=${report.sessionId} label=${JSON.stringify(pillLabel(report))} ` +
        report.plugins
          .map((p) => `${p.id}:${p.enabledScope}/${p.loaded}/${p.hookActive}/${p.mode}@${p.modeSource}${p.note ? "!" : ""}`)
          .join(" "),
    );
  });
  return () => {};
}
