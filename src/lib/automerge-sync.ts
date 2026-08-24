import { isValidDocumentId, stringifyAutomergeUrl, type DocHandle, type DocumentId, type Repo } from "@automerge/automerge-repo";
import * as A from "@automerge/automerge/next";
import { type ConvexReactClient } from "convex/react";
import { api } from "../../convex/_generated/api";

export type PushStatus = { kind: "synced" } | { kind: "error"; message: string };

const PUSH_FAILED = "Cloud save failed. Changes are still on this device.";

export function startDocumentSync(input: {
  repo: Repo;
  convex: ConvexReactClient;
  documentId: string;
  onStatus: (status: PushStatus) => void;
}): () => void {
  if (!isValidDocumentId(input.documentId)) {
    return () => undefined;
  }
  const handle = input.repo.find(stringifyAutomergeUrl(input.documentId));
  const syncer = new ConvexDocSync(input.convex, input.repo, handle, input.onStatus);
  return () => syncer.dispose();
}

function mergeArrays(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function headsEqual(left: A.Heads, right: A.Heads): boolean {
  return left.length === right.length && left.every((head, index) => head === right[index]);
}

function lastSeenKey(documentId: DocumentId): string {
  return `pomodoro.automerge.lastSeen.${documentId}`;
}

function readLastSeen(documentId: DocumentId): number | null {
  const raw = window.localStorage.getItem(lastSeenKey(documentId));
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

class ConvexDocSync {
  private lastSeen: number | null;
  private readonly applied = new Set<string>();
  private lastSyncHeads: A.Heads | undefined;
  private sawRemoteSnapshot = false;
  private handling = false;
  private rerun = false;
  private disposed = false;
  private readonly unsubscribes: Array<() => void> = [];

  constructor(
    private readonly convex: ConvexReactClient,
    private readonly repo: Repo,
    private readonly handle: DocHandle<unknown>,
    private readonly onStatus: (status: PushStatus) => void,
  ) {
    this.lastSeen = readLastSeen(handle.documentId);
    handle.on("change", this.onLocalChange);
    void this.start();
  }

  dispose(): void {
    this.disposed = true;
    this.handle.off("change", this.onLocalChange);
    for (const unsubscribe of this.unsubscribes) unsubscribe();
    this.unsubscribes.length = 0;
  }

  private readonly onLocalChange = (): void => {
    void this.handleChange();
  };

  private async start(): Promise<void> {
    let local = this.handle.docSync();
    if (local === undefined) {
      this.lastSeen = null;
      try {
        await this.load();
      } catch {
        if (!this.disposed) this.onStatus({ kind: "error", message: PUSH_FAILED });
      }
      local = this.handle.docSync();
    } else if (this.lastSeen === null) {
      try {
        await this.load();
      } catch {
        if (!this.disposed) this.onStatus({ kind: "error", message: PUSH_FAILED });
      }
      local = this.handle.docSync();
    } else {
      this.lastSyncHeads = A.getHeads(local);
    }
    if (this.disposed) return;
    this.lastSeen = this.lastSeen ?? 0;
    this.watch(this.lastSeen);
    if (local === undefined && !this.sawRemoteSnapshot) this.lastSyncHeads = undefined;
    await this.handleChange();
  }

  private async load(): Promise<void> {
    let cursor: string | undefined;
    for (;;) {
      const result = await this.convex.query(api.sync.pullChanges, {
        documentId: this.handle.documentId,
        since: 0,
        numItems: 1000,
        cursor,
      });
      if (this.disposed) return;
      const changes: Uint8Array[] = [];
      for (const change of result.page) {
        if (this.applied.has(change._id)) continue;
        if (change.type === "snapshot") this.sawRemoteSnapshot = true;
        changes.push(new Uint8Array(change.data));
        this.applied.add(change._id);
        if (this.lastSeen === null || change._creationTime > this.lastSeen) {
          this.lastSeen = change._creationTime;
        }
      }
      if (changes.length > 0) {
        this.handle.update((doc) => A.loadIncremental(doc, mergeArrays(changes)));
        if (this.lastSeen !== null) this.saveLastSeen(this.lastSeen);
      }
      const loaded = this.handle.docSync();
      if (loaded !== undefined) this.lastSyncHeads = A.getHeads(loaded);
      if (result.isDone) return;
      cursor = result.continueCursor;
    }
  }

  private watch(since: number, cursor?: string): void {
    const watch = this.convex.watchQuery(api.sync.pullChanges, {
      documentId: this.handle.documentId,
      since,
      cursor,
    });
    let startedNextPage = false;
    this.unsubscribes.push(
      watch.onUpdate(() => {
        if (this.disposed) return;
        const results = watch.localQueryResult();
        if (results === undefined) return;
        if (!results.isDone && !startedNextPage) {
          startedNextPage = true;
          this.watch(since, results.continueCursor);
        }
        const current = this.handle.docSync();
        if (current === undefined) return;
        const headsBefore = A.getHeads(current);
        const incremental: Uint8Array[] = [];
        let latest = this.lastSeen ?? 0;
        for (const row of results.page) {
          if (this.applied.has(row._id)) continue;
          switch (row.type) {
            case "incremental":
              incremental.push(new Uint8Array(row.data));
              break;
            case "snapshot":
              this.sawRemoteSnapshot = true;
              this.handle.update((doc) => A.loadIncremental(doc, new Uint8Array(row.data)));
              break;
            default: {
              const _exhaustive: never = row.type;
              return _exhaustive;
            }
          }
          this.applied.add(row._id);
          if (row._creationTime > latest) latest = row._creationTime;
        }
        if (incremental.length > 0) {
          this.handle.update((doc) => A.loadIncremental(doc, mergeArrays(incremental)));
        }
        if (latest > 0 && (this.lastSeen === null || latest > this.lastSeen)) {
          this.lastSeen = latest;
          const after = this.handle.docSync();
          if (after !== undefined && !headsEqual(headsBefore, A.getHeads(after))) {
            this.saveLastSeen(latest);
          }
        }
      }),
    );
  }

  private saveLastSeen(lastSeen: number): void {
    void this.repo.flush([this.handle.documentId]).then(() => {
      if (this.disposed) return;
      window.localStorage.setItem(lastSeenKey(this.handle.documentId), String(lastSeen));
    });
  }

  private async handleChange(): Promise<void> {
    if (this.disposed) return;
    if (this.handling) {
      this.rerun = true;
      return;
    }
    this.handling = true;
    try {
      do {
        this.rerun = false;
        await this.pushOnce();
      } while (this.rerun && !this.disposed);
    } finally {
      this.handling = false;
    }
  }

  private async pushOnce(): Promise<void> {
    if (this.handle.state !== "ready") return;
    const doc = this.handle.docSync();
    if (doc === undefined) return;
    const heads = A.getHeads(doc);
    try {
      if (this.lastSyncHeads === undefined) {
        const id = await this.convex.mutation(api.sync.submit, {
          documentId: this.handle.documentId,
          data: toArrayBuffer(A.save(doc)),
          type: "snapshot",
        });
        this.applied.add(id);
        this.lastSyncHeads = heads;
        this.onStatus({ kind: "synced" });
        return;
      }
      if (headsEqual(heads, this.lastSyncHeads)) {
        this.onStatus({ kind: "synced" });
        return;
      }
      const before = A.view(doc, this.lastSyncHeads);
      const changes = A.getChanges(before, doc);
      if (changes.length === 0) {
        this.lastSyncHeads = heads;
        this.onStatus({ kind: "synced" });
        return;
      }
      const id = await this.convex.mutation(api.sync.submit, {
        documentId: this.handle.documentId,
        data: toArrayBuffer(mergeArrays(changes)),
        type: "incremental",
      });
      this.applied.add(id);
      this.lastSyncHeads = heads;
      this.onStatus({ kind: "synced" });
    } catch {
      this.onStatus({ kind: "error", message: PUSH_FAILED });
    }
  }
}
