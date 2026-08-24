import type { APIRoute } from "astro";
import { loadUserState, saveUserState } from "../../db/user-state";
import { isRecord, parseAppState } from "../../lib/app-state";
import { auth } from "../../lib/auth";

export const GET: APIRoute = async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (session === null) {
    return json({ kind: "unauthenticated" }, 401);
  }

  const state = await loadUserState(session.user.id);
  if (state === null) {
    return json({ kind: "empty" }, 404);
  }
  return json(state);
};

export const PUT: APIRoute = async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (session === null) {
    return json({ kind: "unauthenticated" }, 401);
  }

  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) {
    return json({ kind: "invalid", message: "Send a JSON object with tasks and preferences." }, 400);
  }

  const state = parseAppState(body);
  await saveUserState(session.user.id, state);
  return json(state);
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
