export type SessionUser =
  | { kind: "guest"; id: string }
  | { kind: "signed-in"; id: string; name: string; image: string | null };

const SESSION_CACHE_KEY = "pomodoro.session.v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function toSessionUser(user: {
  id: string;
  name: string;
  image?: string | null;
  isAnonymous?: boolean | null;
}): SessionUser {
  if (user.isAnonymous === true) {
    return { kind: "guest", id: user.id };
  }
  return { kind: "signed-in", id: user.id, name: user.name, image: user.image ?? null };
}

export function parseSessionUser(value: unknown): SessionUser | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string") return null;
  if (value.kind === "guest") return { kind: "guest", id: value.id };
  if (value.kind !== "signed-in" && value.kind !== undefined) return null;
  if (typeof value.name !== "string") return null;
  if (value.image !== undefined && value.image !== null && typeof value.image !== "string") return null;
  return {
    kind: "signed-in",
    id: value.id,
    name: value.name,
    image: typeof value.image === "string" ? value.image : null,
  };
}

export function readCachedUser(): SessionUser | null {
  try {
    return parseSessionUser(JSON.parse(window.localStorage.getItem(SESSION_CACHE_KEY) ?? "null"));
  } catch {
    return null;
  }
}

export function writeCachedUser(user: SessionUser): void {
  window.localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(user));
}

export function clearCachedUser(): void {
  window.localStorage.removeItem(SESSION_CACHE_KEY);
}

export function signedInUser(user: SessionUser | null): Extract<SessionUser, { kind: "signed-in" }> | null {
  return user?.kind === "signed-in" ? user : null;
}
