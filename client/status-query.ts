import { useAgent, useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";

import { readStatus } from "../shared/status";

/**
 * Both plugins record a mode change from the UserPromptSubmit hook, so the
 * files are current once a turn is under way. The agent's status flips on
 * every turn start and end; keying on it re-reads at both edges, and the
 * first idle after `initializing` is when the session id appears.
 */
export function useStatusQuery(agentId: string) {
  const status = useAgent(agentId, (agent) => agent.status);
  const read = useRpc(readStatus);
  return useQuery({
    queryKey: ["plugin-status", agentId, status],
    queryFn: () => read({ agentId }),
    retry: false,
  });
}
