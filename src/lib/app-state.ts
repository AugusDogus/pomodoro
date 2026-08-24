import { TIMER_SECONDS, type TimerMode } from "./timer";

export type Task = {
  id: string;
  title: string;
  completed: boolean;
  pomodoros: number;
};

export type Preferences = {
  sound: boolean;
  notifications: boolean;
  autoStartBreaks: boolean;
  focusMinutes: number;
  breakMinutes: number;
};

export type StoredAppState = {
  tasks: Task[];
  selectedTaskId: string | null;
  completedSessions: number;
  sessionDate: string;
  preferences: Preferences;
  updatedAt: number;
};

export const MAX_FOCUS_MINUTES = 120;
export const MAX_BREAK_MINUTES = 60;

export function localDateKey(): string {
  const today = new Date();
  return [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
}

export function defaultState(): StoredAppState {
  return {
    tasks: [],
    selectedTaskId: null,
    completedSessions: 0,
    sessionDate: localDateKey(),
    preferences: {
      sound: true,
      notifications: false,
      autoStartBreaks: false,
      focusMinutes: TIMER_SECONDS.focus / 60,
      breakMinutes: TIMER_SECONDS.break / 60,
    },
    updatedAt: 0,
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isTask(value: unknown): value is Task {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.completed === "boolean" &&
    typeof value.pomodoros === "number"
  );
}

export function parseDuration(value: unknown, fallback: number, maximum: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= maximum
    ? value
    : fallback;
}

export function durationSeconds(preferences: Preferences, mode: TimerMode): number {
  return (mode === "focus" ? preferences.focusMinutes : preferences.breakMinutes) * 60;
}

export function parseStoredState(raw: string | null): StoredAppState {
  if (raw === null) return defaultState();

  try {
    return parseAppState(JSON.parse(raw));
  } catch {
    return defaultState();
  }
}

export function parseAppState(value: unknown): StoredAppState {
  if (!isRecord(value)) return defaultState();
  if (!Array.isArray(value.tasks) || !value.tasks.every(isTask)) return defaultState();
  if (value.selectedTaskId !== null && typeof value.selectedTaskId !== "string") return defaultState();
  if (typeof value.completedSessions !== "number") return defaultState();
  if (!isRecord(value.preferences)) return defaultState();
  if (typeof value.preferences.sound !== "boolean" || typeof value.preferences.notifications !== "boolean") {
    return defaultState();
  }

  const today = localDateKey();
  const storedDate = typeof value.sessionDate === "string" ? value.sessionDate : today;

  return {
    tasks: value.tasks,
    selectedTaskId: value.selectedTaskId,
    completedSessions: storedDate === today ? value.completedSessions : 0,
    sessionDate: today,
    preferences: {
      sound: value.preferences.sound,
      notifications: value.preferences.notifications,
      autoStartBreaks: typeof value.preferences.autoStartBreaks === "boolean" ? value.preferences.autoStartBreaks : false,
      focusMinutes: parseDuration(value.preferences.focusMinutes, TIMER_SECONDS.focus / 60, MAX_FOCUS_MINUTES),
      breakMinutes: parseDuration(value.preferences.breakMinutes, TIMER_SECONDS.break / 60, MAX_BREAK_MINUTES),
    },
    updatedAt: typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt) ? value.updatedAt : 0,
  };
}

export function touchState(state: StoredAppState): StoredAppState {
  return { ...state, updatedAt: Date.now() };
}

export function chooseSnapshot(
  local: StoredAppState,
  remote: StoredAppState,
): { kind: "local"; state: StoredAppState; shouldPush: boolean } | { kind: "remote"; state: StoredAppState; shouldPush: boolean } {
  if (remote.updatedAt > local.updatedAt) {
    return { kind: "remote", state: remote, shouldPush: false };
  }
  if (local.updatedAt > remote.updatedAt) {
    return { kind: "local", state: local, shouldPush: true };
  }
  return { kind: "local", state: local, shouldPush: false };
}

export function mergeTasks(left: Task[], right: Task[]): Task[] {
  const byId = new Map<string, Task>();
  for (const item of right) byId.set(item.id, item);
  for (const item of left) {
    const prior = byId.get(item.id);
    if (prior === undefined) {
      byId.set(item.id, item);
      continue;
    }
    byId.set(item.id, {
      id: item.id,
      title: item.title.length > 0 ? item.title : prior.title,
      completed: prior.completed || item.completed,
      pomodoros: Math.max(prior.pomodoros, item.pomodoros),
    });
  }
  return [...byId.values()];
}

export function sameSnapshot(left: StoredAppState, right: StoredAppState): boolean {
  return (
    left.selectedTaskId === right.selectedTaskId &&
    left.completedSessions === right.completedSessions &&
    left.sessionDate === right.sessionDate &&
    left.preferences.sound === right.preferences.sound &&
    left.preferences.notifications === right.preferences.notifications &&
    left.preferences.autoStartBreaks === right.preferences.autoStartBreaks &&
    left.preferences.focusMinutes === right.preferences.focusMinutes &&
    left.preferences.breakMinutes === right.preferences.breakMinutes &&
    sameTasks(left.tasks, right.tasks)
  );
}

function sameTasks(left: Task[], right: Task[]): boolean {
  if (left.length !== right.length) return false;
  const rightById = new Map(right.map((item) => [item.id, item]));
  return left.every((item) => {
    const other = rightById.get(item.id);
    return other !== undefined && other.title === item.title && other.completed === item.completed && other.pomodoros === item.pomodoros;
  });
}

export function mergeAppState(left: StoredAppState, right: StoredAppState): StoredAppState {
  const tasks = mergeTasks(left.tasks, right.tasks);
  const newer = left.updatedAt >= right.updatedAt ? left : right;
  const selectedTaskId = pickSelectedTaskId({
    tasks,
    preferred: newer.selectedTaskId,
    fallbacks: [left.selectedTaskId, right.selectedTaskId],
  });
  const merged: StoredAppState = {
    tasks,
    selectedTaskId,
    completedSessions: Math.max(left.completedSessions, right.completedSessions),
    sessionDate: localDateKey(),
    preferences: newer.preferences,
    updatedAt: Math.max(left.updatedAt, right.updatedAt),
  };
  if (sameSnapshot(merged, right)) return { ...merged, updatedAt: right.updatedAt };
  return { ...merged, updatedAt: Math.max(merged.updatedAt, Date.now()) };
}

function pickSelectedTaskId(input: {
  tasks: Task[];
  preferred: string | null;
  fallbacks: Array<string | null>;
}): string | null {
  const exists = (id: string | null): id is string => id !== null && input.tasks.some((task) => task.id === id);
  if (exists(input.preferred)) return input.preferred;
  for (const id of input.fallbacks) {
    if (exists(id)) return id;
  }
  return null;
}

export function firstName(name: string): string {
  const [first] = name.trim().split(/\s+/);
  return first === undefined || first.length === 0 ? name : first;
}
