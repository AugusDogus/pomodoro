import { describe, expect, test } from "bun:test";
import {
  createSessionLogEntry,
  groupSessionLog,
  parseSessionLog,
  pomodoroCountLabel,
  sessionDayLabel,
  sessionsOnDate,
} from "./session-log";

describe("session log", () => {
  test("parseSessionLog keeps valid entries and ignores the rest", () => {
    const entry = createSessionLogEntry({
      id: "s1",
      completedAt: Date.parse("2026-08-24T09:15:00"),
      minutes: 25,
      task: { id: "t1", title: "Read" },
    });

    expect(parseSessionLog(undefined)).toEqual([]);
    expect(parseSessionLog("nope")).toEqual([]);
    expect(parseSessionLog([entry, { id: "bad" }])).toEqual([entry]);
  });

  test("groupSessionLog orders days and sessions newest first", () => {
    const older = createSessionLogEntry({
      id: "older",
      completedAt: Date.parse("2026-08-23T21:00:00"),
      minutes: 25,
      task: null,
    });
    const morning = createSessionLogEntry({
      id: "morning",
      completedAt: Date.parse("2026-08-24T09:00:00"),
      minutes: 25,
      task: { id: "t1", title: "Read" },
    });
    const afternoon = createSessionLogEntry({
      id: "afternoon",
      completedAt: Date.parse("2026-08-24T15:00:00"),
      minutes: 30,
      task: { id: "t1", title: "Read" },
    });

    expect(groupSessionLog([older, morning, afternoon])).toEqual([
      { dateKey: afternoon.dateKey, entries: [afternoon, morning] },
      { dateKey: older.dateKey, entries: [older] },
    ]);
  });

  test("sessionsOnDate counts only that local day", () => {
    const today = createSessionLogEntry({
      id: "today",
      completedAt: Date.parse("2026-08-24T10:00:00"),
      minutes: 25,
      task: null,
    });
    const yesterday = createSessionLogEntry({
      id: "yesterday",
      completedAt: Date.parse("2026-08-23T10:00:00"),
      minutes: 25,
      task: null,
    });

    expect(sessionsOnDate([today, yesterday], today.dateKey)).toEqual([today]);
  });

  test("sessionDayLabel names today and yesterday", () => {
    expect(sessionDayLabel("2026-08-24", "2026-08-24")).toBe("Today");
    expect(sessionDayLabel("2026-08-23", "2026-08-24")).toBe("Yesterday");
    expect(sessionDayLabel("2026-08-20", "2026-08-24")).not.toBe("Today");
    expect(sessionDayLabel("2026-08-20", "2026-08-24")).not.toBe("Yesterday");
  });

  test("pomodoroCountLabel is singular for one", () => {
    expect(pomodoroCountLabel(1)).toBe("1 pomodoro");
    expect(pomodoroCountLabel(0)).toBe("0 pomodoros");
    expect(pomodoroCountLabel(3)).toBe("3 pomodoros");
  });
});
