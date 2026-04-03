export const getEffectivePendingHeartbeatMs = (
  reclaimIdleMs: number,
  pendingHeartbeatMs: number
): number => {
  const reclaim = Math.max(1000, Math.floor(reclaimIdleMs));
  const requested = Math.max(1000, Math.floor(pendingHeartbeatMs));
  const safeUpperBound = Math.max(1000, Math.floor(reclaim / 2));
  return Math.min(requested, safeUpperBound);
};

export const hasFreshWorkerHeartbeat = (
  lastHeartbeatAt: Date | string | null | undefined,
  reclaimIdleMs: number,
  now = Date.now()
): boolean => {
  if (!lastHeartbeatAt) return false;
  const parsed =
    lastHeartbeatAt instanceof Date
      ? lastHeartbeatAt.getTime()
      : Date.parse(lastHeartbeatAt);
  if (!Number.isFinite(parsed)) return false;
  return now - parsed < Math.max(1000, Math.floor(reclaimIdleMs));
};
