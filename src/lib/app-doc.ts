import {
  defaultState,
  isTask,
  parseDuration,
  type StoredAppState,
  type Task,
  MAX_BREAK_MINUTES,
  MAX_FOCUS_MINUTES,
} from "./app-state";
import { TIMER_SECONDS } from "./timer";

export type AppDoc = {
  tasks: Task[];
  selectedTaskId: string | null;
  completedSessions: number;
  sessionDate: string;
  sound: boolean;
  notifications: boolean;
  autoStartBreaks: boolean;
  focusMinutes: number;
  breakMinutes: number;
};

export type AppDocDirty = {
  added: Task[];
  removed: string[];
  tasks: Map<string, { title?: string; completed?: boolean }>;
  pomodoroDeltas: Map<string, number>;
  sessionDelta: number;
  sessionDate: string | undefined;
  selectedTaskId: string | null | undefined;
  sound: boolean | undefined;
  notifications: boolean | undefined;
  autoStartBreaks: boolean | undefined;
  focusMinutes: number | undefined;
  breakMinutes: number | undefined;
};

export function emptyDirty(): AppDocDirty {
  return {
    added: [],
    removed: [],
    tasks: new Map(),
    pomodoroDeltas: new Map(),
    sessionDelta: 0,
    sessionDate: undefined,
    selectedTaskId: undefined,
    sound: undefined,
    notifications: undefined,
    autoStartBreaks: undefined,
    focusMinutes: undefined,
    breakMinutes: undefined,
  };
}

export function isDirty(dirty: AppDocDirty): boolean {
  return (
    dirty.added.length > 0 ||
    dirty.removed.length > 0 ||
    dirty.tasks.size > 0 ||
    dirty.pomodoroDeltas.size > 0 ||
    dirty.sessionDelta !== 0 ||
    dirty.sessionDate !== undefined ||
    dirty.selectedTaskId !== undefined ||
    dirty.sound !== undefined ||
    dirty.notifications !== undefined ||
    dirty.autoStartBreaks !== undefined ||
    dirty.focusMinutes !== undefined ||
    dirty.breakMinutes !== undefined
  );
}

export function appDocFromState(state: StoredAppState): AppDoc {
  return {
    tasks: state.tasks.map((task) => ({ ...task })),
    selectedTaskId: state.selectedTaskId,
    completedSessions: state.completedSessions,
    sessionDate: state.sessionDate,
    sound: state.preferences.sound,
    notifications: state.preferences.notifications,
    autoStartBreaks: state.preferences.autoStartBreaks,
    focusMinutes: state.preferences.focusMinutes,
    breakMinutes: state.preferences.breakMinutes,
  };
}

export function stateFromAppDoc(doc: AppDoc): StoredAppState {
  const tasks = doc.tasks.filter(isTask);
  return {
    tasks,
    selectedTaskId: tasks.some((task) => task.id === doc.selectedTaskId) ? doc.selectedTaskId : null,
    completedSessions: typeof doc.completedSessions === "number" ? doc.completedSessions : 0,
    sessionDate: typeof doc.sessionDate === "string" ? doc.sessionDate : defaultState().sessionDate,
    preferences: {
      sound: doc.sound === true,
      notifications: doc.notifications === true,
      autoStartBreaks: doc.autoStartBreaks === true,
      focusMinutes: parseDuration(doc.focusMinutes, TIMER_SECONDS.focus / 60, MAX_FOCUS_MINUTES),
      breakMinutes: parseDuration(doc.breakMinutes, TIMER_SECONDS.break / 60, MAX_BREAK_MINUTES),
    },
    updatedAt: 0,
  };
}

export function applyStateToAppDoc(doc: AppDoc, next: StoredAppState): void {
  const nextById = new Map(next.tasks.map((task) => [task.id, task]));
  for (let index = doc.tasks.length - 1; index >= 0; index -= 1) {
    const current = doc.tasks[index];
    if (current === undefined || nextById.has(current.id)) continue;
    doc.tasks.splice(index, 1);
  }

  for (const task of next.tasks) {
    const current = doc.tasks.find((item) => item.id === task.id);
    if (current === undefined) {
      doc.tasks.push({
        id: task.id,
        title: task.title,
        completed: task.completed,
        pomodoros: task.pomodoros,
      });
      continue;
    }
    if (current.title !== task.title) current.title = task.title;
    if (current.completed !== task.completed) current.completed = task.completed;
    if (current.pomodoros !== task.pomodoros) current.pomodoros = task.pomodoros;
  }

  if (doc.selectedTaskId !== next.selectedTaskId) doc.selectedTaskId = next.selectedTaskId;
  if (doc.completedSessions !== next.completedSessions) doc.completedSessions = next.completedSessions;
  if (doc.sessionDate !== next.sessionDate) doc.sessionDate = next.sessionDate;
  if (doc.sound !== next.preferences.sound) doc.sound = next.preferences.sound;
  if (doc.notifications !== next.preferences.notifications) doc.notifications = next.preferences.notifications;
  if (doc.autoStartBreaks !== next.preferences.autoStartBreaks) {
    doc.autoStartBreaks = next.preferences.autoStartBreaks;
  }
  if (doc.focusMinutes !== next.preferences.focusMinutes) doc.focusMinutes = next.preferences.focusMinutes;
  if (doc.breakMinutes !== next.preferences.breakMinutes) doc.breakMinutes = next.preferences.breakMinutes;
}

export function addMissingTasksToAppDoc(doc: AppDoc, incoming: StoredAppState): void {
  for (const task of incoming.tasks) {
    if (doc.tasks.some((item) => item.id === task.id)) continue;
    doc.tasks.push({
      id: task.id,
      title: task.title,
      completed: task.completed,
      pomodoros: task.pomodoros,
    });
  }
}

export function accumulateDirty(dirty: AppDocDirty, prev: StoredAppState, next: StoredAppState): void {
  const prevById = new Map(prev.tasks.map((task) => [task.id, task]));
  const nextIds = new Set(next.tasks.map((task) => task.id));

  for (const task of next.tasks) {
    const before = prevById.get(task.id);
    if (before === undefined) {
      if (!dirty.added.some((item) => item.id === task.id)) dirty.added.push({ ...task });
      continue;
    }
    const patch = dirty.tasks.get(task.id) ?? {};
    if (before.title !== task.title) patch.title = task.title;
    if (before.completed !== task.completed) patch.completed = task.completed;
    if (patch.title !== undefined || patch.completed !== undefined) dirty.tasks.set(task.id, patch);
    if (before.pomodoros !== task.pomodoros) {
      dirty.pomodoroDeltas.set(task.id, (dirty.pomodoroDeltas.get(task.id) ?? 0) + (task.pomodoros - before.pomodoros));
    }
  }

  for (const task of prev.tasks) {
    if (nextIds.has(task.id) || dirty.removed.includes(task.id)) continue;
    dirty.removed.push(task.id);
  }

  if (prev.selectedTaskId !== next.selectedTaskId) dirty.selectedTaskId = next.selectedTaskId;
  if (prev.completedSessions !== next.completedSessions) {
    dirty.sessionDelta += next.completedSessions - prev.completedSessions;
  }
  if (prev.sessionDate !== next.sessionDate) dirty.sessionDate = next.sessionDate;
  if (prev.preferences.sound !== next.preferences.sound) dirty.sound = next.preferences.sound;
  if (prev.preferences.notifications !== next.preferences.notifications) {
    dirty.notifications = next.preferences.notifications;
  }
  if (prev.preferences.autoStartBreaks !== next.preferences.autoStartBreaks) {
    dirty.autoStartBreaks = next.preferences.autoStartBreaks;
  }
  if (prev.preferences.focusMinutes !== next.preferences.focusMinutes) {
    dirty.focusMinutes = next.preferences.focusMinutes;
  }
  if (prev.preferences.breakMinutes !== next.preferences.breakMinutes) {
    dirty.breakMinutes = next.preferences.breakMinutes;
  }
}

export function applyDirtyToAppDoc(doc: AppDoc, dirty: AppDocDirty): void {
  for (const id of dirty.removed) {
    const index = doc.tasks.findIndex((task) => task.id === id);
    if (index >= 0) doc.tasks.splice(index, 1);
  }
  for (const task of dirty.added) {
    if (doc.tasks.some((item) => item.id === task.id)) continue;
    doc.tasks.push({
      id: task.id,
      title: task.title,
      completed: task.completed,
      pomodoros: task.pomodoros,
    });
  }
  for (const [id, patch] of dirty.tasks) {
    const current = doc.tasks.find((task) => task.id === id);
    if (current === undefined) continue;
    if (patch.title !== undefined) current.title = patch.title;
    if (patch.completed !== undefined) current.completed = patch.completed;
  }
  for (const [id, delta] of dirty.pomodoroDeltas) {
    const current = doc.tasks.find((task) => task.id === id);
    if (current !== undefined && delta !== 0) current.pomodoros += delta;
  }
  if (dirty.sessionDelta !== 0) doc.completedSessions += dirty.sessionDelta;
  if (dirty.sessionDate !== undefined) doc.sessionDate = dirty.sessionDate;
  if (dirty.selectedTaskId !== undefined) doc.selectedTaskId = dirty.selectedTaskId;
  if (dirty.sound !== undefined) doc.sound = dirty.sound;
  if (dirty.notifications !== undefined) doc.notifications = dirty.notifications;
  if (dirty.autoStartBreaks !== undefined) doc.autoStartBreaks = dirty.autoStartBreaks;
  if (dirty.focusMinutes !== undefined) doc.focusMinutes = dirty.focusMinutes;
  if (dirty.breakMinutes !== undefined) doc.breakMinutes = dirty.breakMinutes;
}

export function completeFocusSession(doc: AppDoc, today: string): void {
  if (doc.sessionDate === today) doc.completedSessions += 1;
  else {
    doc.sessionDate = today;
    doc.completedSessions = 1;
  }
  if (doc.selectedTaskId === null) return;
  const task = doc.tasks.find((item) => item.id === doc.selectedTaskId);
  if (task !== undefined) task.pomodoros += 1;
}
