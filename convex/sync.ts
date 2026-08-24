import { getAuthUserId } from "@convex-dev/auth/server";
import { hash as sha256 } from "fast-sha256";
import { v } from "convex/values";
import { isDocumentIdString } from "./documentId";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";

// Re-read a short window before `since` so a client whose lastSeen landed
// between Convex _creationTime ticks still sees the rows it might have missed.
const RETENTION_BUFFER_MS = 5 * 60 * 1000;

async function authorizeDocument(ctx: QueryCtx | MutationCtx, documentId: string): Promise<void> {
  if (!isDocumentIdString(documentId)) {
    throw new Error("That document id is not valid.");
  }
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("Sign in before syncing.");
  }
  const user = await ctx.db.get(userId);
  if (user === null) {
    throw new Error("Your account was not found. Sign in again.");
  }
  if (user.appDocumentId !== documentId) {
    throw new Error("This list belongs to a different document.");
  }
}

function keyHash(binary: Uint8Array): string {
  return Array.from(sha256(binary), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const submit = mutation({
  args: {
    documentId: v.string(),
    data: v.bytes(),
    type: v.union(v.literal("incremental"), v.literal("snapshot")),
  },
  handler: async (ctx, args) => {
    await authorizeDocument(ctx, args.documentId);
    const hash = keyHash(new Uint8Array(args.data));
    const existing = await ctx.db
      .query("automerge")
      .withIndex("doc_type_hash", (q) =>
        q.eq("documentId", args.documentId).eq("type", args.type).eq("hash", hash),
      )
      .first();
    if (existing !== null) return existing._id;
    return await ctx.db.insert("automerge", {
      documentId: args.documentId,
      data: args.data,
      hash,
      type: args.type,
    });
  },
});

export const pullChanges = query({
  args: {
    documentId: v.string(),
    since: v.number(),
    numItems: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await authorizeDocument(ctx, args.documentId);
    const result = await ctx.db
      .query("automerge")
      .withIndex("documentId", (q) => q.eq("documentId", args.documentId).gt("_creationTime", args.since))
      .paginate({
        numItems: args.numItems ?? 50,
        cursor: args.cursor ?? null,
      });

    if (args.cursor === undefined) {
      const retentionBuffer = await ctx.db
        .query("automerge")
        .withIndex("documentId", (q) =>
          q
            .eq("documentId", args.documentId)
            .gt("_creationTime", args.since - RETENTION_BUFFER_MS)
            .lte("_creationTime", args.since),
        )
        .collect();
      return { ...result, page: retentionBuffer.concat(result.page) };
    }

    return result;
  },
});
