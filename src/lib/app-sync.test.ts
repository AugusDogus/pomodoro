import { describe, expect, test } from "bun:test";
import { initialSyncStatus, parseSyncHint } from "./app-sync";

describe("sync status first paint", () => {
  test("parseSyncHint only accepts a confirmed synced snapshot", () => {
    expect(parseSyncHint("synced")).toBe("synced");
    expect(parseSyncHint("local")).toBeNull();
    expect(parseSyncHint("offline")).toBeNull();
    expect(parseSyncHint("pending")).toBeNull();
    expect(parseSyncHint({ kind: "synced" })).toBeNull();
    expect(parseSyncHint(null)).toBeNull();
  });

  test("offline is verified immediately", () => {
    expect(initialSyncStatus(false, null)).toEqual({ kind: "offline" });
    expect(initialSyncStatus(false, "synced")).toEqual({ kind: "offline" });
  });

  test("online without a hint stays pending so the first word is not a guess", () => {
    expect(initialSyncStatus(true, null)).toEqual({ kind: "pending" });
  });

  test("online with a last-known synced hint paints Synced before the probe", () => {
    expect(initialSyncStatus(true, "synced")).toEqual({ kind: "synced" });
  });
});
