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
  }).index("email", ["email"]),
  appStates: defineTable({
    userId: v.id("users"),
    tasks: v.array(task),
    selectedTaskId: v.union(v.string(), v.null()),
    completedSessions: v.number(),
    sessionDate: v.string(),
    sound: v.boolean(),
    notifications: v.boolean(),
    autoStartBreaks: v.boolean(),
    focusMinutes: v.number(),
    breakMinutes: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),
});
