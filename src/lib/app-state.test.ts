import { describe, expect, test } from "bun:test";
import {
  chooseSnapshot,
  defaultState,
  firstName,
  localDateKey,
  mergeAppState,
  nextStateAfterFocusSession,
  parseAppState,
  parseStoredState,
  touchState,
} from "./app-state";
import { createLegacySessions, createSessionLogEntry, todaysPomodoroCount } from "./session-log";

describe("app state", () => {
  test("parses a valid stored snapshot", () => {
    const state = parseStoredState(
      JSON.stringify({
        tasks: [{ id: "t1", title: "Read", completed: false, pomodoros: 2 }],
        selectedTaskId: "t1",
        completedSessions: 3,
        sessionDate: localDateKey(),
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
    expect(state.sessionLog).toEqual(
      createLegacySessions({ dateKey: localDateKey(), count: 3, minutes: 30 }),
    );
    expect(state.preferences.focusMinutes).toBe(30);
    expect(state.updatedAt).toBe(42);
  });

  test("keeps a valid session log and drops broken entries", () => {
    const entry = createSessionLogEntry({
      id: "s1",
      completedAt: Date.parse("2026-08-24T15:04:00"),
      minutes: 25,
      task: { id: "t1", title: "Read" },
    });
    const state = parseAppState({
      ...defaultState(),
      sessionLog: [entry, { id: "bad" }, "nope"],
    });

    expect(state.sessionLog).toEqual([entry]);
  });

  test("parse ignores a leftover counter once that day already has log rows", () => {
    const entry = createSessionLogEntry({
      id: "s1",
      completedAt: Date.now(),
      minutes: 25,
      task: null,
    });
    const state = parseAppState({
      ...defaultState(),
      completedSessions: 9,
      sessionDate: localDateKey(),
      sessionLog: [entry],
    });

    expect(state.sessionLog).toEqual([entry]);
  });

  test("completing after parse keeps today's leftover count", () => {
    const today = localDateKey();
    const completedAt = Date.parse(`${today}T10:30:00`);
    const prev = parseAppState({
      ...defaultState(),
      selectedTaskId: "t1",
      sessionDate: today,
      completedSessions: 4,
      tasks: [{ id: "t1", title: "Read", completed: false, pomodoros: 2 }],
    });

    const next = nextStateAfterFocusSession(prev, { id: "s1", completedAt });

    expect(todaysPomodoroCount(next.sessionLog, today)).toBe(5);
    expect(next.sessionLog).toEqual([
      ...createLegacySessions({ dateKey: today, count: 4, minutes: 25 }),
      createSessionLogEntry({
        id: "s1",
        completedAt,
        minutes: 25,
        task: { id: "t1", title: "Read" },
      }),
    ]);
  });

  test("falls back when stored JSON is invalid", () => {
    expect(parseStoredState("not-json")).toEqual(defaultState());
    expect(parseAppState({ tasks: "nope" })).toEqual(defaultState());
  });

  test("prefers the newer snapshot", () => {
    const older = { ...defaultState(), updatedAt: 10 };
    const newer = { ...defaultState(), updatedAt: 20, selectedTaskId: "later" };

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
      { id: "shared", title: "Read chapter 2", completed: false, pomodoros: 4 },
    ]);
  });

  test("mergeAppState lets a newer uncheck overwrite an older check", () => {
    const local = {
      ...defaultState(),
      updatedAt: 20,
      tasks: [{ id: "t1", title: "Read", completed: false, pomodoros: 1 }],
    };
    const remote = {
      ...defaultState(),
      updatedAt: 10,
      tasks: [{ id: "t1", title: "Read", completed: true, pomodoros: 1 }],
    };

    expect(mergeAppState(local, remote).tasks).toEqual([
      { id: "t1", title: "Read", completed: false, pomodoros: 1 },
    ]);
  });

  test("mergeAppState lets a newer check overwrite an older uncheck", () => {
    const local = {
      ...defaultState(),
      updatedAt: 10,
      tasks: [{ id: "t1", title: "Read", completed: false, pomodoros: 1 }],
    };
    const remote = {
      ...defaultState(),
      updatedAt: 20,
      tasks: [{ id: "t1", title: "Read", completed: true, pomodoros: 1 }],
    };

    expect(mergeAppState(local, remote).tasks).toEqual([
      { id: "t1", title: "Read", completed: true, pomodoros: 1 },
    ]);
  });

  test("mergeAppState unions session logs by id", () => {
    const morning = createSessionLogEntry({
      id: "morning",
      completedAt: Date.parse("2026-08-24T09:00:00"),
      minutes: 25,
      task: { id: "t1", title: "Read" },
    });
    const afternoon = createSessionLogEntry({
      id: "afternoon",
      completedAt: Date.parse("2026-08-24T14:00:00"),
      minutes: 25,
      task: null,
    });
    const local = { ...defaultState(), updatedAt: 20, sessionLog: [morning] };
    const remote = { ...defaultState(), updatedAt: 10, sessionLog: [afternoon] };

    expect(mergeAppState(local, remote).sessionLog).toEqual([morning, afternoon]);
  });

  test("nextStateAfterFocusSession appends a log entry and increments the selected task", () => {
    const completedAt = Date.parse("2026-08-24T10:30:00");
    const prev = {
      ...defaultState(),
      selectedTaskId: "t1",
      tasks: [{ id: "t1", title: "Read", completed: false, pomodoros: 2 }],
    };

    const next = nextStateAfterFocusSession(prev, { id: "s1", completedAt });

    expect(next.tasks[0]?.pomodoros).toBe(3);
    expect(next.sessionLog).toEqual([
      createSessionLogEntry({
        id: "s1",
        completedAt,
        minutes: 25,
        task: { id: "t1", title: "Read" },
      }),
    ]);
    expect(todaysPomodoroCount(next.sessionLog, "2026-08-24")).toBe(1);
  });

  test("nextStateAfterFocusSession is a no-op when the entry id already exists", () => {
    const completedAt = Date.parse("2026-08-24T10:30:00");
    const entry = createSessionLogEntry({
      id: "s1",
      completedAt,
      minutes: 25,
      task: null,
    });
    const prev = { ...defaultState(), sessionLog: [entry] };

    expect(nextStateAfterFocusSession(prev, { id: "s1", completedAt })).toBe(prev);
  });
});
