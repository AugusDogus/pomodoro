import { eq, inArray } from "drizzle-orm";
import { defaultState, mergeAppState, parseAppState, type StoredAppState } from "../lib/app-state";
import { db, syncWithTurso } from "./index";
import { preference, task } from "./schema";

export async function loadUserState(userId: string): Promise<StoredAppState | null> {
  const [prefs] = await db.select().from(preference).where(eq(preference.userId, userId));
  const tasks = await db.select().from(task).where(eq(task.userId, userId));
  if (prefs === undefined && tasks.length === 0) return null;
  if (prefs === undefined) {
    return parseAppState({
      ...defaultState(),
      tasks: tasks.map(toTask),
    });
  }
  return parseAppState(toStoredState(prefs, tasks));
}

export async function saveUserState(userId: string, state: StoredAppState): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(task).where(eq(task.userId, userId));
    if (state.tasks.length > 0) {
      await tx.insert(task).values(
        state.tasks.map((item) => ({
          id: item.id,
          userId,
          title: item.title,
          completed: item.completed,
          pomodoros: item.pomodoros,
          updatedAt: new Date(state.updatedAt),
        })),
      );
    }
    await tx
      .insert(preference)
      .values(toPreferenceRow(userId, state))
      .onConflictDoUpdate({
        target: preference.userId,
        set: toPreferenceRow(userId, state),
      });
  });
  await syncWithTurso();
}

export async function transferGuestState(fromUserId: string, toUserId: string): Promise<void> {
  if (fromUserId === toUserId) return;
  const guest = await loadUserState(fromUserId);
  const existing = await loadUserState(toUserId);
  const merged =
    guest === null ? existing ?? defaultState() : existing === null ? guest : mergeAppState(guest, existing);

  await db.transaction(async (tx) => {
    await tx.delete(task).where(inArray(task.userId, [fromUserId, toUserId]));
    await tx.delete(preference).where(inArray(preference.userId, [fromUserId, toUserId]));
  });
  await saveUserState(toUserId, merged);
}

function toTask(item: typeof task.$inferSelect) {
  return {
    id: item.id,
    title: item.title,
    completed: item.completed,
    pomodoros: item.pomodoros,
  };
}

function toPreferenceRow(userId: string, state: StoredAppState) {
  return {
    userId,
    sound: state.preferences.sound,
    notifications: state.preferences.notifications,
    autoStartBreaks: state.preferences.autoStartBreaks,
    focusMinutes: state.preferences.focusMinutes,
    breakMinutes: state.preferences.breakMinutes,
    selectedTaskId: state.selectedTaskId,
    completedSessions: state.completedSessions,
    sessionDate: state.sessionDate,
    updatedAt: new Date(state.updatedAt),
  };
}

function toStoredState(
  prefs: typeof preference.$inferSelect,
  tasks: Array<typeof task.$inferSelect>,
): StoredAppState {
  const fallback = defaultState();
  return {
    tasks: tasks.map(toTask),
    selectedTaskId: prefs.selectedTaskId,
    completedSessions: prefs.completedSessions,
    sessionDate: prefs.sessionDate,
    preferences: {
      sound: prefs.sound,
      notifications: prefs.notifications,
      autoStartBreaks: prefs.autoStartBreaks,
      focusMinutes: prefs.focusMinutes,
      breakMinutes: prefs.breakMinutes,
    },
    updatedAt: timestampMs(prefs.updatedAt, fallback.updatedAt),
  };
}

function timestampMs(value: Date | number, fallback: number): number {
  if (value instanceof Date) return value.getTime();
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
