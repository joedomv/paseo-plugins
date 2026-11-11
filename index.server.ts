import type { PluginServerContext } from "@getpaseo/plugin/server";

import { detect } from "./server/detect";
import { readStatus } from "./shared/status";

export default function contribute(server: PluginServerContext) {
  server.handle(readStatus, ({ agentId }, context) => detect(agentId, context));
  return () => {};
}
