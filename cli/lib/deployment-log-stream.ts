import type { ManagedCliConfig } from "./api-config";

type StreamEvent = Record<string, unknown>;

const parseSseBlock = (block: string): StreamEvent | null => {
  const lines = block.split("\n").filter((l) => l.length > 0);
  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    const payload = line.slice(6).trim();
    if (!payload) continue;
    try {
      return JSON.parse(payload) as StreamEvent;
    } catch {
      return null;
    }
  }
  return null;
};

export const streamDeploymentBuildLog = async (
  config: ManagedCliConfig,
  deploymentId: string,
  onEvent: (ev: StreamEvent) => void
): Promise<void> => {
  const url = new URL(`/api/deployments/${deploymentId}/log/stream`, `${config.apiBaseUrl}/`);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${config.accessToken}`, Accept: "text/event-stream" }
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t.slice(0, 400) || `HTTP ${String(res.status)}`);
  }
  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const ev = parseSseBlock(part);
      if (ev) onEvent(ev);
    }
  }
  if (buffer.trim()) {
    const ev = parseSseBlock(buffer);
    if (ev) onEvent(ev);
  }
};
