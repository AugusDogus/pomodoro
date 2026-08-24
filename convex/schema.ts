import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const task = v.object({
  id: v.string(),
  title: v.string(),
  completed: v.boolean(),
  pomodoros: v.number(),
});

export default defineSchema({
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    appDocumentId: v.optional(v.string()),
  })
    .index("email", ["email"])
    .index("appDocumentId", ["appDocumentId"]),
  appStates: defineTable({
    userId: v.id("users"),
    tasks: v.array(task),
    selectedTaskId: v.union(v.string(), v.null()),
    sound: v.boolean(),
    notifications: v.boolean(),
    autoStartBreaks: v.boolean(),
    focusMinutes: v.number(),
    breakMinutes: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),
  automerge: defineTable({
    documentId: v.string(),
    type: v.union(v.literal("incremental"), v.literal("snapshot")),
    hash: v.string(),
    data: v.bytes(),
  })
    .index("doc_type_hash", ["documentId", "type", "hash"])
    .index("documentId", ["documentId"]),
  automergeClaims: defineTable({
    documentId: v.string(),
    userId: v.id("users"),
  }).index("by_document", ["documentId"]),
});
