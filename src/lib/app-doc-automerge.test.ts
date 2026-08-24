import { describe, expect, test } from "bun:test";
import * as A from "@automerge/automerge/next";
import {
  completeFocusSession,
  ensureSessionLog,
  stateFromAppDoc,
  type AppDoc,
} from "./app-doc";

function docWithoutSessionLog(): A.Doc<AppDoc> {
  return A.from({
    tasks: [{ id: "t1", title: "Read", completed: false, pomodoros: 0 }],
    selectedTaskId: "t1",
    sound: true,
    notifications: false,
    autoStartBreaks: false,
    focusMinutes: 25,
    breakMinutes: 5,
  });
}

describe("automerge session log", () => {
  test("read and heal recover sessions after concurrent first writes on old docs", () => {
    const base = docWithoutSessionLog();
    const completedAt = Date.parse("2026-08-24T11:00:00");
    const left = A.change(A.clone(base), (doc) => {
      completeFocusSession(doc, { id: "left", completedAt });
    });
    const right = A.change(A.clone(base), (doc) => {
      completeFocusSession(doc, { id: "right", completedAt: completedAt + 1 });
    });
    const merged = A.merge(A.clone(left), right);

    expect(stateFromAppDoc(merged).sessionLog.map((entry) => entry.id).sort()).toEqual(["left", "right"]);

    const healed = A.change(merged, (doc) => {
      ensureSessionLog(doc);
    });

    expect(healed.sessionLog.map((entry) => entry.id).sort()).toEqual(["left", "right"]);
  });
});
