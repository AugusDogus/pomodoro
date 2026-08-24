import { localDateKey, mergeAppState, parseAppState, type StoredAppState } from "./app-state";
import { todaysPomodoroCount } from "./session-log";

export const STORAGE_KEY = "pomodoro.study-state.v1";
export const SYNC_HINT_KEY = "pomodoro.sync-status.v1";

export type SyncStatus =
  | { kind: "pending" }
  | { kind: "local" }
  | { kind: "offline" }
  | { kind: "syncing" }
  | { kind: "synced" }
  | { kind: "error"; message: string };

export type SyncHint = "synced";

export type RemoteAppState = {
  tasks: StoredAppState["tasks"];
  selectedTaskId: string | null;
  completedSessions: number;
  sessionDate: string;
  sound: boolean;
  notifications: boolean;
  autoStartBreaks: boolean;
  focusMinutes: number;
  breakMinutes: number;
  updatedAt: number;
};

export function parseSyncHint(value: unknown): SyncHint | null {
  return value === "synced" ? value : null;
}

export function readSyncHint(): SyncHint | null {
  try {
    return parseSyncHint(JSON.parse(window.localStorage.getItem(SYNC_HINT_KEY) ?? "null"));
  } catch {
    return null;
  }
}

export function writeSyncHint(status: SyncStatus): void {
  switch (status.kind) {
    case "synced":
      window.localStorage.setItem(SYNC_HINT_KEY, JSON.stringify(status.kind));
      return;
    case "local":
    case "offline":
    case "pending":
    case "syncing":
    case "error":
      return;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function clearSyncHint(): void {
  window.localStorage.removeItem(SYNC_HINT_KEY);
}

export function initialSyncStatus(online: boolean, hint: SyncHint | null): SyncStatus {
  if (!online) return { kind: "offline" };
  if (hint === "synced") return { kind: "synced" };
  return { kind: "pending" };
}

export function writeLocalState(state: StoredAppState): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function storedStateFromRemote(remote: RemoteAppState): StoredAppState {
  return parseAppState({
    tasks: remote.tasks,
    selectedTaskId: remote.selectedTaskId,
    completedSessions: remote.completedSessions,
    sessionDate: remote.sessionDate,
    preferences: {
      sound: remote.sound,
      notifications: remote.notifications,
      autoStartBreaks: remote.autoStartBreaks,
      focusMinutes: remote.focusMinutes,
      breakMinutes: remote.breakMinutes,
    },
    updatedAt: remote.updatedAt,
  });
}

export function remoteStateFromStored(state: StoredAppState): RemoteAppState {
  return {
    tasks: state.tasks,
    selectedTaskId: state.selectedTaskId,
    completedSessions: todaysPomodoroCount(state.sessionLog, localDateKey()),
    sessionDate: state.sessionDate,
    sound: state.preferences.sound,
    notifications: state.preferences.notifications,
    autoStartBreaks: state.preferences.autoStartBreaks,
    focusMinutes: state.preferences.focusMinutes,
    breakMinutes: state.preferences.breakMinutes,
    updatedAt: state.updatedAt,
  };
}

export function mergeRemoteState(local: StoredAppState, remote: RemoteAppState): StoredAppState {
  return mergeAppState(local, storedStateFromRemote(remote));
}
