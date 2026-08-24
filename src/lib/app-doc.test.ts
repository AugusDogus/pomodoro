import { describe, expect, test } from "bun:test";
import {
  accumulateDirty,
  addMissingTasksToAppDoc,
  applyDirtyToAppDoc,
  applyStateToAppDoc,
  appDocFromState,
  completeFocusSession,
  emptyDirty,
  stateFromAppDoc,
} from "./app-doc";
import { defaultState } from "./app-state";
import { createSessionLogEntry } from "./session-log";

describe("app doc", () => {
  test("round-trips a stored snapshot without a clock", () => {
    const stored = {
      ...defaultState(),
      updatedAt: 99,
      selectedTaskId: "t1",
      tasks: [{ id: "t1", title: "Read", completed: false, pomodoros: 1 }],
    };

    expect(stateFromAppDoc(appDocFromState(stored))).toEqual({ ...stored, updatedAt: 0 });
  });

  test("applyStateToAppDoc mutates an existing task in place", () => {
    const doc = appDocFromState({
      ...defaultState(),
      tasks: [{ id: "t1", title: "Read", completed: true, pomodoros: 1 }],
    });
    const original = doc.tasks[0];

    applyStateToAppDoc(doc, {
      ...defaultState(),
      tasks: [{ id: "t1", title: "Read", completed: false, pomodoros: 1 }],
    });

    expect(doc.tasks[0]).toBe(original);
    expect(doc.tasks[0]?.completed).toBe(false);
  });

  test("addMissingTasksToAppDoc does not overwrite shared fields", () => {
    const doc = appDocFromState({
      ...defaultState(),
      tasks: [
        { id: "remote", title: "Cloud", completed: false, pomodoros: 2 },
        { id: "shared", title: "Shared", completed: true, pomodoros: 1 },
      ],
    });

    addMissingTasksToAppDoc(doc, {
      ...defaultState(),
      tasks: [
        { id: "local", title: "Phone", completed: false, pomodoros: 0 },
        { id: "shared", title: "Shared", completed: false, pomodoros: 1 },
      ],
    });

    expect(doc.tasks.map((task) => [task.id, task.completed])).toEqual([
      ["remote", false],
      ["shared", true],
      ["local", false],
    ]);
  });

  test("applyDirtyToAppDoc writes only touched fields and increments", () => {
    const doc = appDocFromState({
      ...defaultState(),
      selectedTaskId: "shared",
      completedSessions: 4,
      tasks: [
        { id: "remote", title: "Cloud", completed: true, pomodoros: 2 },
        { id: "shared", title: "Shared", completed: true, pomodoros: 1 },
      ],
    });
    const prev = {
      ...stateFromAppDoc(doc),
      tasks: [{ id: "shared", title: "Shared", completed: true, pomodoros: 1 }],
    };
    const next = {
      ...prev,
      completedSessions: 5,
      tasks: [
        { id: "shared", title: "Shared", completed: false, pomodoros: 2 },
        { id: "local", title: "Phone", completed: false, pomodoros: 0 },
      ],
    };
    const dirty = emptyDirty();
    accumulateDirty(dirty, prev, next);
    applyDirtyToAppDoc(doc, dirty);

    expect(doc.completedSessions).toBe(5);
    expect(doc.tasks.map((task) => [task.id, task.completed, task.pomodoros])).toEqual([
      ["remote", true, 2],
      ["shared", false, 2],
      ["local", false, 0],
    ]);
  });

  test("completeFocusSession increments the selected task and appends a log entry", () => {
    const entry = createSessionLogEntry({
      id: "s1",
      completedAt: Date.parse("2026-08-24T11:00:00"),
      minutes: 25,
      task: { id: "t1", title: "Read" },
    });
    const doc = appDocFromState({
      ...defaultState(),
      selectedTaskId: "t1",
      sessionDate: "2026-08-24",
      completedSessions: 2,
      tasks: [{ id: "t1", title: "Read", completed: false, pomodoros: 1 }],
    });

    completeFocusSession(doc, entry);

    expect(doc.completedSessions).toBe(3);
    expect(doc.tasks[0]?.pomodoros).toBe(2);
    expect(doc.sessionLog).toEqual([entry]);
  });

  test("applyDirtyToAppDoc appends new session log entries", () => {
    const existing = createSessionLogEntry({
      id: "old",
      completedAt: Date.parse("2026-08-24T09:00:00"),
      minutes: 25,
      task: null,
    });
    const added = createSessionLogEntry({
      id: "new",
      completedAt: Date.parse("2026-08-24T11:00:00"),
      minutes: 25,
      task: { id: "t1", title: "Read" },
    });
    const doc = appDocFromState({
      ...defaultState(),
      sessionLog: [existing],
    });
    const prev = stateFromAppDoc(doc);
    const next = { ...prev, sessionLog: [...prev.sessionLog, added] };
    const dirty = emptyDirty();
    accumulateDirty(dirty, prev, next);
    applyDirtyToAppDoc(doc, dirty);

    expect(doc.sessionLog).toEqual([existing, added]);
  });
});
