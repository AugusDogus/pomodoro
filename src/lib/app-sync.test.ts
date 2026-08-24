import { describe, expect, test } from "bun:test";
import { defaultState } from "./app-state";
import { initialSyncStatus, parseSyncHint, remoteStateFromStored, storedStateFromRemote } from "./app-sync";

describe("sync status first paint", () => {
  test("parseSyncHint only accepts a confirmed synced snapshot", () => {
    expect(parseSyncHint("synced")).toBe("synced");
    expect(parseSyncHint("local")).toBeNull();
    expect(parseSyncHint("offline")).toBeNull();
    expect(parseSyncHint("pending")).toBeNull();
    expect(parseSyncHint({ kind: "synced" })).toBeNull();
    expect(parseSyncHint(null)).toBeNull();
  });

  test("offline is verified immediately", () => {
    expect(initialSyncStatus(false, null)).toEqual({ kind: "offline" });
    expect(initialSyncStatus(false, "synced")).toEqual({ kind: "offline" });
  });

  test("online without a hint stays pending so the first word is not a guess", () => {
    expect(initialSyncStatus(true, null)).toEqual({ kind: "pending" });
  });

  test("online with a last-known synced hint paints Synced before the probe", () => {
    expect(initialSyncStatus(true, "synced")).toEqual({ kind: "synced" });
  });

  test("remote snapshots round-trip through the stored shape", () => {
    const stored = {
      ...defaultState(),
      updatedAt: 42,
      selectedTaskId: "t1",
      tasks: [{ id: "t1", title: "Read", completed: false, pomodoros: 2 }],
      preferences: {
        sound: false,
        notifications: true,
        autoStartBreaks: true,
        focusMinutes: 30,
        breakMinutes: 10,
      },
    };

    expect(storedStateFromRemote(remoteStateFromStored(stored))).toEqual(stored);
  });
});
