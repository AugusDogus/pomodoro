export type SessionTask = {
  id: string;
  title: string;
};

export type SessionLogEntry = {
  id: string;
  completedAt: number;
  dateKey: string;
  minutes: number;
  task: SessionTask | null;
};

export type SessionLogDay = {
  dateKey: string;
  entries: SessionLogEntry[];
};

export function dateKeyFromMs(ms: number): string {
  const date = new Date(ms);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

export function createSessionLogEntry(input: {
  id: string;
  completedAt: number;
  minutes: number;
  task: SessionTask | null;
}): SessionLogEntry {
  return {
    id: input.id,
    completedAt: input.completedAt,
    dateKey: dateKeyFromMs(input.completedAt),
    minutes: input.minutes,
    task: input.task === null ? null : { id: input.task.id, title: input.task.title },
  };
}

export function isSessionTask(value: unknown): value is SessionTask {
  return isPlainRecord(value) && typeof value.id === "string" && typeof value.title === "string";
}

export function isSessionLogEntry(value: unknown): value is SessionLogEntry {
  if (!isPlainRecord(value)) return false;
  if (typeof value.id !== "string" || value.id.length === 0) return false;
  if (typeof value.completedAt !== "number" || !Number.isFinite(value.completedAt)) return false;
  if (typeof value.dateKey !== "string" || !isDateKey(value.dateKey)) return false;
  if (typeof value.minutes !== "number" || !Number.isInteger(value.minutes) || value.minutes < 1) return false;
  return value.task === null || isSessionTask(value.task);
}

export function parseSessionLog(value: unknown): SessionLogEntry[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return [];
  return value.filter(isSessionLogEntry);
}

export function mergeSessionLog(left: SessionLogEntry[], right: SessionLogEntry[]): SessionLogEntry[] {
  const byId = new Map<string, SessionLogEntry>();
  for (const entry of right) byId.set(entry.id, entry);
  for (const entry of left) byId.set(entry.id, entry);
  return [...byId.values()].sort((a, b) => a.completedAt - b.completedAt);
}

export function sameSessionLog(left: SessionLogEntry[], right: SessionLogEntry[]): boolean {
  if (left.length !== right.length) return false;
  const rightById = new Map(right.map((entry) => [entry.id, entry]));
  return left.every((entry) => {
    const other = rightById.get(entry.id);
    return other !== undefined && sameSessionLogEntry(entry, other);
  });
}

export function groupSessionLog(entries: SessionLogEntry[]): SessionLogDay[] {
  const groups: SessionLogDay[] = [];
  const indexByDate = new Map<string, number>();
  const newestFirst = [...entries].sort((left, right) => right.completedAt - left.completedAt);

  for (const entry of newestFirst) {
    const existing = indexByDate.get(entry.dateKey);
    if (existing === undefined) {
      indexByDate.set(entry.dateKey, groups.length);
      groups.push({ dateKey: entry.dateKey, entries: [entry] });
      continue;
    }
    const group = groups[existing];
    if (group === undefined) continue;
    group.entries.push(entry);
  }

  return groups;
}

export function sessionsOnDate(entries: SessionLogEntry[], dateKey: string): SessionLogEntry[] {
  return entries.filter((entry) => entry.dateKey === dateKey);
}

export function sessionDayLabel(dateKey: string, today: string): string {
  if (dateKey === today) return "Today";
  const todayDate = parseDateKey(today);
  const date = parseDateKey(dateKey);
  if (todayDate === null || date === null) return dateKey;

  const yesterday = new Date(todayDate);
  yesterday.setDate(todayDate.getDate() - 1);
  if (dateKeyFromMs(yesterday.getTime()) === dateKey) return "Yesterday";

  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function sessionTimeLabel(completedAt: number): string {
  return new Date(completedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function pomodoroCountLabel(count: number): string {
  return count === 1 ? "1 pomodoro" : `${count} pomodoros`;
}

function sameSessionLogEntry(left: SessionLogEntry, right: SessionLogEntry): boolean {
  return (
    left.completedAt === right.completedAt &&
    left.dateKey === right.dateKey &&
    left.minutes === right.minutes &&
    sameSessionTask(left.task, right.task)
  );
}

function sameSessionTask(left: SessionTask | null, right: SessionTask | null): boolean {
  if (left === null || right === null) return left === right;
  return left.id === right.id && left.title === right.title;
}

function isDateKey(value: string): boolean {
  return parseDateKey(value) !== null;
}

function parseDateKey(dateKey: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
