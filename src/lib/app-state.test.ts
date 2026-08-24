import { describe, expect, test } from "bun:test";
import {
  chooseSnapshot,
  defaultState,
  firstName,
  mergeAppState,
  parseAppState,
  parseStoredState,
  touchState,
} from "./app-state";

describe("app state", () => {
  test("parses a valid stored snapshot", () => {
    const state = parseStoredState(
      JSON.stringify({
        tasks: [{ id: "t1", title: "Read", completed: false, pomodoros: 2 }],
        selectedTaskId: "t1",
        completedSessions: 3,
        sessionDate: defaultState().sessionDate,
        preferences: {
          sound: false,
          notifications: true,
          autoStartBreaks: true,
          focusMinutes: 30,
          breakMinutes: 10,
        },
        updatedAt: 42,
      }),
    );

    expect(state.tasks).toEqual([{ id: "t1", title: "Read", completed: false, pomodoros: 2 }]);
    expect(state.preferences.focusMinutes).toBe(30);
    expect(state.updatedAt).toBe(42);
  });

  test("falls back when stored JSON is invalid", () => {
    expect(parseStoredState("not-json")).toEqual(defaultState());
    expect(parseAppState({ tasks: "nope" })).toEqual(defaultState());
  });

  test("prefers the newer snapshot", () => {
    const older = { ...defaultState(), updatedAt: 10 };
    const newer = { ...defaultState(), updatedAt: 20, completedSessions: 4 };

    expect(chooseSnapshot(older, newer)).toEqual({ kind: "remote", state: newer, shouldPush: false });
    expect(chooseSnapshot(newer, older)).toEqual({ kind: "local", state: newer, shouldPush: true });
    expect(chooseSnapshot(newer, { ...older, updatedAt: 20 })).toEqual({
      kind: "local",
      state: newer,
      shouldPush: false,
    });
  });

  test("touchState updates the snapshot clock", () => {
    const next = touchState(defaultState());
    expect(next.updatedAt).toBeGreaterThan(0);
  });

  test("firstName uses the leading word", () => {
    expect(firstName("Alex Ross")).toBe("Alex");
    expect(firstName("  ")).toBe("  ");
  });

  test("mergeAppState keeps guest tasks when linking to an existing account", () => {
    const guest = {
      ...defaultState(),
      updatedAt: 20,
      selectedTaskId: "guest-1",
      tasks: [{ id: "guest-1", title: "Old local todo", completed: false, pomodoros: 1 }],
    };
    const existing = {
      ...defaultState(),
      updatedAt: 10,
      selectedTaskId: "cloud-1",
      tasks: [{ id: "cloud-1", title: "Already synced", completed: true, pomodoros: 3 }],
    };

    const merged = mergeAppState(guest, existing);
    expect(merged.tasks).toEqual([
      { id: "cloud-1", title: "Already synced", completed: true, pomodoros: 3 },
      { id: "guest-1", title: "Old local todo", completed: false, pomodoros: 1 },
    ]);
    expect(merged.selectedTaskId).toBe("guest-1");
  });

  test("mergeAppState unions duplicate task ids without dropping work", () => {
    const guest = {
      ...defaultState(),
      updatedAt: 5,
      tasks: [{ id: "shared", title: "Read", completed: true, pomodoros: 2 }],
    };
    const existing = {
      ...defaultState(),
      updatedAt: 8,
      tasks: [{ id: "shared", title: "Read chapter 2", completed: false, pomodoros: 4 }],
    };

    expect(mergeAppState(guest, existing).tasks).toEqual([
      { id: "shared", title: "Read", completed: true, pomodoros: 4 },
    ]);
  });
});
