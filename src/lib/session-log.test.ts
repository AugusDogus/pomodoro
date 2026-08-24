import { describe, expect, test } from "bun:test";
import {
  createSessionLogEntry,
  entryDateKey,
  groupSessionLog,
  msUntilNextLocalMidnight,
  parseSessionLog,
  pomodoroCountLabel,
  sessionDayLabel,
  sessionsOnDate,
  todayPomodoroLabel,
  todaysPomodoroCount,
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

  test("parseSessionLog derives the day from completedAt and ignores a stored dateKey", () => {
    const completedAt = Date.parse("2026-08-24T22:00:00");
    expect(
      parseSessionLog([
        {
          id: "old",
          completedAt,
          dateKey: "1999-01-01",
          minutes: 25,
          task: null,
        },
      ]),
    ).toEqual([createSessionLogEntry({ id: "old", completedAt, minutes: 25, task: null })]);
    expect(entryDateKey(createSessionLogEntry({ id: "old", completedAt, minutes: 25, task: null }))).toBe("2026-08-24");
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
      { dateKey: entryDateKey(afternoon), entries: [afternoon, morning] },
      { dateKey: entryDateKey(older), entries: [older] },
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

    expect(sessionsOnDate([today, yesterday], entryDateKey(today))).toEqual([today]);
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

  test("todayPomodoroLabel uses one phrase for empty and counted days", () => {
    expect(todayPomodoroLabel(0)).toBe("No pomodoros yet today");
    expect(todayPomodoroLabel(1)).toBe("1 pomodoro today");
    expect(todayPomodoroLabel(3)).toBe("3 pomodoros today");
  });

  test("todaysPomodoroCount reads only the log", () => {
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

    expect(todaysPomodoroCount([today, yesterday], entryDateKey(today))).toBe(1);
    expect(todaysPomodoroCount([], "2026-08-24")).toBe(0);
  });

  test("msUntilNextLocalMidnight is the remaining time before the next local day", () => {
    const morning = Date.parse("2026-08-24T00:00:00");
    expect(msUntilNextLocalMidnight(morning)).toBe(24 * 60 * 60 * 1000);
    expect(msUntilNextLocalMidnight(morning + 1000)).toBe(24 * 60 * 60 * 1000 - 1000);
    expect(msUntilNextLocalMidnight(morning)).toBeGreaterThan(0);
  });
});
