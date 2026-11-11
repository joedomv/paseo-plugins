import type { PluginClientContext } from "@getpaseo/plugin/client";

type Paseo = PluginClientContext["paseo"];
export type AgentList = Awaited<ReturnType<Paseo["agents"]["list"]>>;
export type AgentUpdate = Parameters<Parameters<Paseo["agents"]["subscribe"]>[0]>[0];

const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 60_000;

/**
 * Keeps an agent observation open for the caller's lifetime: `snapshot`
 * replaces the caller's view (first delivery and after every reconnect),
 * `update` applies one change. Paseo releases an observation that fails, so
 * it is reopened with backoff. Returns the cleanup.
 */
export function followAgents(
  paseo: Paseo,
  handlers: { snapshot(list: AgentList): void; update(update: AgentUpdate): void },
): () => void {
  const lifetime = new AbortController();
  let release: (() => Promise<void>) | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let retryDelay = RETRY_MIN_MS;

  function reopen(error: unknown): void {
    release = null;
    if (lifetime.signal.aborted || retry !== null) return;
    console.warn("plugin-status: agent observation failed; reopening", error);
    retry = setTimeout(() => {
      retry = null;
      open();
    }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
  }

  function open(): void {
    paseo.agents
      .list({ subscribe: {}, signal: lifetime.signal })
      .then(({ subscription }) => {
        if (lifetime.signal.aborted) return;
        release = () => subscription.release();
        subscription.subscribe({
          snapshot(list) {
            retryDelay = RETRY_MIN_MS;
            handlers.snapshot(list);
          },
          update(message) {
            if (message.type === "agent_update") handlers.update(message.payload as AgentUpdate);
          },
          error: reopen,
        });
      })
      .catch(reopen);
  }

  open();
  return () => {
    lifetime.abort();
    if (retry !== null) clearTimeout(retry);
    retry = null;
    void release?.().catch(() => undefined);
    release = null;
  };
}
