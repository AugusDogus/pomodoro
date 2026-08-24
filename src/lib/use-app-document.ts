import {
  isValidDocumentId,
  parseAutomergeUrl,
  stringifyAutomergeUrl,
  type AutomergeUrl,
  type Repo,
} from "@automerge/automerge-repo";
import { useDocument, useRepo } from "@automerge/automerge-repo-react-hooks";
import { useMutation } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import {
  accumulateDirty,
  addMissingSessionsToAppDoc,
  addMissingTasksToAppDoc,
  applyDirtyToAppDoc,
  applyStateToAppDoc,
  appDocFromState,
  completeFocusSession,
  emptyDirty,
  healSessionLogConflicts,
  isDirty,
  stateFromAppDoc,
  type AppDoc,
  type AppDocDirty,
} from "./app-doc";
import { readCachedDocumentId, writeCachedDocumentId } from "./app-document-id";
import { mergeAppState, nextStateAfterFocusSession, sameSnapshot, type StoredAppState } from "./app-state";
import { storedStateFromRemote, type RemoteAppState, type SyncStatus } from "./app-sync";
import { startDocumentSync, type PushStatus } from "./automerge-sync";
import { convex } from "./convex";

export function useAppDocument(input: {
  isAuthenticated: boolean;
  isOnline: boolean;
  remoteDocumentId: string | null | undefined;
  snapshot: RemoteAppState | null | undefined;
  fallback: StoredAppState;
}): {
  state: StoredAppState;
  updateState: (updater: (current: StoredAppState) => StoredAppState) => void;
  completeFocusSession: () => void;
  syncStatus: SyncStatus;
} {
  const repo = useRepo();
  const claimDocument = useMutation(api.users.claimDocument);
  const [localUrl, setLocalUrl] = useState<AutomergeUrl | null>(() => urlFromId(readCachedDocumentId()));
  const [draft, setDraft] = useState<StoredAppState | null>(null);
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  const createdId = useRef<string | null>(null);
  const seededId = useRef<string | null>(null);
  const importedFor = useRef<string | null>(null);
  const dirtyRef = useRef<AppDocDirty>(emptyDirty());
  const cachedRef = useRef(input.fallback);
  const latestRef = useRef(input.fallback);

  useEffect(() => {
    if (!input.isAuthenticated) {
      createdId.current = null;
      seededId.current = null;
      importedFor.current = null;
      dirtyRef.current = emptyDirty();
      setDraft(null);
      return;
    }
    if (input.remoteDocumentId === undefined) return;
    if (typeof input.remoteDocumentId === "string" && isValidDocumentId(input.remoteDocumentId)) {
      writeCachedDocumentId(input.remoteDocumentId);
      setLocalUrl(stringifyAutomergeUrl(input.remoteDocumentId));
      return;
    }
    if (createdId.current !== null) return;

    const cachedId = readCachedDocumentId();
    if (cachedId !== null && isValidDocumentId(cachedId)) {
      createdId.current = cachedId;
      seededId.current = cachedId;
      setLocalUrl(stringifyAutomergeUrl(cachedId));
      void claimDocument({ documentId: cachedId }).then((result) => {
        adoptClaim(result, latestRef.current, repo, claimDocument, setLocalUrl, createdId, seededId);
      });
      return;
    }

    const seed =
      input.snapshot === null || input.snapshot === undefined
        ? latestRef.current
        : mergeAppState(latestRef.current, storedStateFromRemote(input.snapshot));
    const handle = repo.create<AppDoc>(appDocFromState(seed));
    createdId.current = handle.documentId;
    seededId.current = handle.documentId;
    dirtyRef.current = emptyDirty();
    setDraft(null);
    writeCachedDocumentId(handle.documentId);
    setLocalUrl(handle.url);
    void claimDocument({ documentId: handle.documentId }).then((result) => {
      adoptClaim(result, latestRef.current, repo, claimDocument, setLocalUrl, createdId, seededId);
    });
  }, [claimDocument, input.isAuthenticated, input.remoteDocumentId, input.snapshot, repo]);

  const url = resolveUrl(input.remoteDocumentId, localUrl);
  const [doc, changeDoc] = useDocument<AppDoc>(url ?? undefined);
  const live = doc === undefined ? null : stateFromAppDoc(doc);
  const next = draft ?? live ?? cachedRef.current;
  const state = sameSnapshot(cachedRef.current, next) ? cachedRef.current : next;
  cachedRef.current = state;
  latestRef.current = state;
  const documentId = url === null ? null : documentIdFromUrl(url);

  useEffect(() => {
    if (url === null || doc === undefined) return;
    const currentId = documentIdFromUrl(url);
    if (draft !== null || isDirty(dirtyRef.current)) {
      changeDoc((current) => {
        healSessionLogConflicts(current);
        applyDirtyToAppDoc(current, dirtyRef.current);
      });
      dirtyRef.current = emptyDirty();
      setDraft(null);
    }
    if (importedFor.current === currentId) return;
    importedFor.current = currentId;
    changeDoc((current) => {
      healSessionLogConflicts(current);
    });
    if (seededId.current === null || seededId.current === currentId) return;
    const incoming = latestRef.current;
    changeDoc((current) => {
      addMissingTasksToAppDoc(current, incoming);
      addMissingSessionsToAppDoc(current, incoming);
    });
  }, [changeDoc, doc, documentId, draft, url]);

  useEffect(() => {
    if (!input.isAuthenticated || !input.isOnline || documentId === null) return;
    return startDocumentSync({
      repo,
      convex,
      documentId,
      onStatus: setPushStatus,
    });
  }, [documentId, input.isAuthenticated, input.isOnline, repo]);

  const updateState = useCallback(
    (updater: (current: StoredAppState) => StoredAppState) => {
      if (url === null || doc === undefined) {
        setDraft((current) => {
          const prev = current ?? latestRef.current;
          const nextState = updater(prev);
          accumulateDirty(dirtyRef.current, prev, nextState);
          return nextState;
        });
        return;
      }
      changeDoc((current) => {
        applyStateToAppDoc(current, updater(stateFromAppDoc(current)));
      });
    },
    [changeDoc, doc, url],
  );

  const finishFocusSession = useCallback(() => {
    const input = { id: crypto.randomUUID(), completedAt: Date.now() };
    if (url === null || doc === undefined) {
      setDraft((current) => {
        const prev = current ?? latestRef.current;
        const nextState = nextStateAfterFocusSession(prev, input);
        accumulateDirty(dirtyRef.current, prev, nextState);
        return nextState;
      });
      return;
    }
    changeDoc((current) => {
      completeFocusSession(current, input);
    });
  }, [changeDoc, doc, url]);

  return {
    state,
    updateState,
    completeFocusSession: finishFocusSession,
    syncStatus: statusFor({ isOnline: input.isOnline, hasDoc: doc !== undefined && url !== null, pushStatus }),
  };
}

function statusFor(input: {
  isOnline: boolean;
  hasDoc: boolean;
  pushStatus: PushStatus | null;
}): SyncStatus {
  if (!input.isOnline) return { kind: "offline" };
  if (input.pushStatus?.kind === "error") return input.pushStatus;
  if (input.pushStatus?.kind === "synced") return { kind: "synced" };
  if (input.hasDoc) return { kind: "pending" };
  return { kind: "pending" };
}

function urlFromId(documentId: string | null): AutomergeUrl | null {
  if (documentId === null || !isValidDocumentId(documentId)) return null;
  return stringifyAutomergeUrl(documentId);
}

function resolveUrl(remoteDocumentId: string | null | undefined, local: AutomergeUrl | null): AutomergeUrl | null {
  if (typeof remoteDocumentId === "string" && isValidDocumentId(remoteDocumentId)) {
    return stringifyAutomergeUrl(remoteDocumentId);
  }
  return local;
}

function documentIdFromUrl(url: AutomergeUrl): string {
  return parseAutomergeUrl(url).documentId;
}

function adoptClaim(
  result: { kind: "ok"; documentId: string } | { kind: "taken" },
  seed: StoredAppState,
  repo: Repo,
  claimDocument: (args: { documentId: string }) => Promise<{ kind: "ok"; documentId: string } | { kind: "taken" }>,
  setLocalUrl: (url: AutomergeUrl) => void,
  createdId: { current: string | null },
  seededId: { current: string | null },
): void {
  switch (result.kind) {
    case "ok":
      if (!isValidDocumentId(result.documentId)) return;
      writeCachedDocumentId(result.documentId);
      createdId.current = result.documentId;
      setLocalUrl(stringifyAutomergeUrl(result.documentId));
      return;
    case "taken": {
      const handle = repo.create<AppDoc>(appDocFromState(seed));
      createdId.current = handle.documentId;
      seededId.current = handle.documentId;
      writeCachedDocumentId(handle.documentId);
      setLocalUrl(handle.url);
      void claimDocument({ documentId: handle.documentId }).then((next) => {
        if (next.kind === "ok" && isValidDocumentId(next.documentId)) {
          writeCachedDocumentId(next.documentId);
          createdId.current = next.documentId;
          setLocalUrl(stringifyAutomergeUrl(next.documentId));
        }
      });
      return;
    }
    default: {
      const _exhaustive: never = result;
      return _exhaustive;
    }
  }
}
