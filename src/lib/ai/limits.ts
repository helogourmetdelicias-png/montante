// A small per-instance guard; the provider project must also have a spending limit.
const windows = new Map<string, { start: number; count: number; busy: boolean }>();
export function reserveAiRequest(tenantId: string, now = Date.now()) {
  for (const [key, value] of windows) if (!value.busy && now - value.start >= 60000) windows.delete(key);
  let window = windows.get(tenantId);
  if (window?.busy) return null;
  if (!window || now - window.start >= 60000) { window = { start: now, count: 0, busy: false }; windows.set(tenantId, window); }
  if (window.count >= 10 || windows.size > 10000) return null;
  window.count++; window.busy = true;
  return () => { window!.busy = false; };
}
