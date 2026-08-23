export type TimerMode = "focus" | "break";

export const TIMER_SECONDS: Record<TimerMode, number> = {
  focus: 25 * 60,
  break: 5 * 60,
};

export function formatTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function remainingFromEnd(endTime: number, now: number): number {
  return Math.max(0, Math.ceil((endTime - now) / 1000));
}

export function progressFor(remaining: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, (total - remaining) / total));
}

