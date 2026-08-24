import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { isDocumentIdString } from "./documentId";
import { mutation, query } from "./_generated/server";

export const current = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    if (user === null) return null;
    const appDocumentId = user.appDocumentId ?? null;
    if (appDocumentId !== null) {
      return {
        id: user._id,
        name: user.name ?? "Guest",
        image: user.image ?? null,
        isAnonymous: user.isAnonymous === true,
        appDocumentId,
        snapshot: null,
      };
    }
    const snapshot = await ctx.db
      .query("appStates")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    return {
      id: user._id,
      name: user.name ?? "Guest",
      image: user.image ?? null,
      isAnonymous: user.isAnonymous === true,
      appDocumentId: null,
      snapshot:
        snapshot === null
          ? null
          : {
              tasks: snapshot.tasks,
              selectedTaskId: snapshot.selectedTaskId,
              sound: snapshot.sound,
              notifications: snapshot.notifications,
              autoStartBreaks: snapshot.autoStartBreaks,
              focusMinutes: snapshot.focusMinutes,
              breakMinutes: snapshot.breakMinutes,
              updatedAt: snapshot.updatedAt,
            },
    };
  },
});

export const claimDocument = mutation({
  args: { documentId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Sign in before syncing.");
    }
    const user = await ctx.db.get(userId);
    if (user === null) {
      throw new Error("Your account was not found. Sign in again.");
    }
    const ownedId = user.appDocumentId;
    if (typeof ownedId === "string" && isDocumentIdString(ownedId)) {
      const existingClaim = await ctx.db
        .query("automergeClaims")
        .withIndex("by_document", (q) => q.eq("documentId", ownedId))
        .unique();
      if (existingClaim === null) {
        await ctx.db.insert("automergeClaims", { documentId: ownedId, userId });
      }
      return { kind: "ok" as const, documentId: ownedId };
    }
    if (!isDocumentIdString(args.documentId)) {
      throw new Error("That document id is not valid.");
    }
    const owner = await ctx.db
      .query("users")
      .withIndex("appDocumentId", (q) => q.eq("appDocumentId", args.documentId))
      .first();
    if (owner !== null && owner._id !== userId) {
      return { kind: "taken" as const };
    }
    const existingClaim = await ctx.db
      .query("automergeClaims")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .unique();
    if (existingClaim !== null && existingClaim.userId !== userId) {
      return { kind: "taken" as const };
    }
    if (existingClaim === null) {
      await ctx.db.insert("automergeClaims", { documentId: args.documentId, userId });
    }
    await ctx.db.patch(userId, { appDocumentId: args.documentId });
    return { kind: "ok" as const, documentId: args.documentId };
  },
});
