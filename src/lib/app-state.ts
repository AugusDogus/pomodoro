import {
  createSessionLogEntry,
  dateKeyFromMs,
  mergeSessionLog,
  parseSessionLog,
  sameSessionLog,
  type SessionLogEntry,
} from "./session-log";
import { TIMER_SECONDS, type TimerMode } from "./timer";

export type { SessionLogEntry, SessionTask } from "./session-log";

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
  sessionLog: SessionLogEntry[];
  preferences: Preferences;
  updatedAt: number;
};

export const MAX_FOCUS_MINUTES = 120;
export const MAX_BREAK_MINUTES = 60;

export function localDateKey(now = Date.now()): string {
  return dateKeyFromMs(now);
}

export function defaultState(): StoredAppState {
  return {
    tasks: [],
    selectedTaskId: null,
    sessionLog: [],
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
  if (!isRecord(value.preferences)) return defaultState();
  if (typeof value.preferences.sound !== "boolean" || typeof value.preferences.notifications !== "boolean") {
    return defaultState();
  }

  const focusMinutes = parseDuration(value.preferences.focusMinutes, TIMER_SECONDS.focus / 60, MAX_FOCUS_MINUTES);

  return {
    tasks: value.tasks,
    selectedTaskId: value.selectedTaskId,
    sessionLog: parseSessionLog(value.sessionLog),
    preferences: {
      sound: value.preferences.sound,
      notifications: value.preferences.notifications,
      autoStartBreaks: typeof value.preferences.autoStartBreaks === "boolean" ? value.preferences.autoStartBreaks : false,
      focusMinutes,
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

export function mergeTasks(left: Task[], right: Task[], prefer: "left" | "right"): Task[] {
  const byId = new Map<string, Task>();
  for (const item of right) byId.set(item.id, item);
  for (const item of left) {
    const prior = byId.get(item.id);
    if (prior === undefined) {
      byId.set(item.id, item);
      continue;
    }
    const { newer, older } = preferredTask(prefer, item, prior);
    byId.set(item.id, {
      id: item.id,
      title: newer.title.length > 0 ? newer.title : older.title,
      completed: newer.completed,
      pomodoros: Math.max(prior.pomodoros, item.pomodoros),
    });
  }
  return [...byId.values()];
}

function preferredTask(prefer: "left" | "right", left: Task, right: Task): { newer: Task; older: Task } {
  switch (prefer) {
    case "left":
      return { newer: left, older: right };
    case "right":
      return { newer: right, older: left };
    default: {
      const _exhaustive: never = prefer;
      return _exhaustive;
    }
  }
}

export function sameSnapshot(left: StoredAppState, right: StoredAppState): boolean {
  return (
    left.selectedTaskId === right.selectedTaskId &&
    sameSessionLog(left.sessionLog, right.sessionLog) &&
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
  const prefer: "left" | "right" = left.updatedAt >= right.updatedAt ? "left" : "right";
  const tasks = mergeTasks(left.tasks, right.tasks, prefer);
  const newer = prefer === "left" ? left : right;
  const selectedTaskId = pickSelectedTaskId({
    tasks,
    preferred: newer.selectedTaskId,
    fallbacks: [left.selectedTaskId, right.selectedTaskId],
  });
  const sessionLog = mergeSessionLog(left.sessionLog, right.sessionLog);
  const merged: StoredAppState = {
    tasks,
    selectedTaskId,
    sessionLog,
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

export function sessionEntryFromFocus(
  source: {
    selectedTaskId: string | null;
    tasks: ReadonlyArray<{ id: string; title: string }>;
    focusMinutes: number;
  },
  input: { id: string; completedAt: number },
): SessionLogEntry {
  const selected = source.tasks.find((task) => task.id === source.selectedTaskId) ?? null;
  return createSessionLogEntry({
    id: input.id,
    completedAt: input.completedAt,
    minutes: source.focusMinutes,
    task: selected === null ? null : { id: selected.id, title: selected.title },
  });
}

export function nextStateAfterFocusSession(
  prev: StoredAppState,
  input: { id: string; completedAt: number },
): StoredAppState {
  if (prev.sessionLog.some((entry) => entry.id === input.id)) return prev;

  const entry = sessionEntryFromFocus(
    {
      selectedTaskId: prev.selectedTaskId,
      tasks: prev.tasks,
      focusMinutes: prev.preferences.focusMinutes,
    },
    input,
  );
  return {
    ...prev,
    sessionLog: [...prev.sessionLog, entry],
    tasks: prev.tasks.map((task) =>
      entry.task !== null && task.id === entry.task.id ? { ...task, pomodoros: task.pomodoros + 1 } : task,
    ),
  };
}

export function firstName(name: string): string {
  const [first] = name.trim().split(/\s+/);
  return first === undefined || first.length === 0 ? name : first;
}
