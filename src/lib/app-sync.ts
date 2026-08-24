import { mergeAppState, parseAppState, sameSnapshot, type StoredAppState } from "./app-state";

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

export type RemoteStateResult =
  | { kind: "ok"; state: StoredAppState }
  | { kind: "empty" }
  | { kind: "unauthenticated" }
  | { kind: "offline" }
  | { kind: "error"; message: string };

export function writeLocalState(state: StoredAppState): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export async function pullRemoteState(): Promise<RemoteStateResult> {
  try {
    const response = await fetch("/api/app-state", { credentials: "include" });
    if (response.status === 401) return { kind: "unauthenticated" };
    if (response.status === 404) return { kind: "empty" };
    if (!response.ok) {
      return { kind: "error", message: "Cloud state could not be loaded. Your local copy is unchanged." };
    }
    return { kind: "ok", state: parseAppState(await response.json()) };
  } catch {
    return { kind: "offline" };
  }
}

export async function pushRemoteState(state: StoredAppState): Promise<RemoteStateResult> {
  try {
    const response = await fetch("/api/app-state", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
    if (response.status === 401) return { kind: "unauthenticated" };
    if (!response.ok) {
      return { kind: "error", message: "Cloud save failed. Changes are still on this device." };
    }
    return { kind: "ok", state };
  } catch {
    return { kind: "offline" };
  }
}

export async function reconcileWithRemote(local: StoredAppState): Promise<{
  state: StoredAppState;
  status: SyncStatus;
}> {
  const remote = await pullRemoteState();
  switch (remote.kind) {
    case "unauthenticated":
      return { state: local, status: { kind: "local" } };
    case "offline":
      return { state: local, status: { kind: "offline" } };
    case "error":
      return { state: local, status: { kind: "error", message: remote.message } };
    case "empty": {
      if (local.updatedAt === 0 && local.tasks.length === 0) {
        return { state: local, status: { kind: "synced" } };
      }
      const pushed = await pushRemoteState(local);
      return statusFromPush(local, pushed);
    }
    case "ok": {
      const merged = mergeAppState(local, remote.state);
      if (sameSnapshot(merged, remote.state)) {
        return { state: merged, status: { kind: "synced" } };
      }
      const pushed = await pushRemoteState(merged);
      return statusFromPush(merged, pushed);
    }
    default: {
      const _exhaustive: never = remote;
      return _exhaustive;
    }
  }
}

function statusFromPush(
  state: StoredAppState,
  pushed: RemoteStateResult,
): { state: StoredAppState; status: SyncStatus } {
  switch (pushed.kind) {
    case "ok":
      return { state, status: { kind: "synced" } };
    case "offline":
      return { state, status: { kind: "offline" } };
    case "unauthenticated":
      return { state, status: { kind: "local" } };
    case "empty":
    case "error":
      return {
        state,
        status: { kind: "error", message: pushed.kind === "error" ? pushed.message : "Cloud save failed. Changes are still on this device." },
      };
    default: {
      const _exhaustive: never = pushed;
      return _exhaustive;
    }
  }
}
