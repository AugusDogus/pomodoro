import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const taskValidator = v.object({
  id: v.string(),
  title: v.string(),
  completed: v.boolean(),
  pomodoros: v.number(),
});

const stateValidator = v.object({
  tasks: v.array(taskValidator),
  selectedTaskId: v.union(v.string(), v.null()),
  completedSessions: v.number(),
  sessionDate: v.string(),
  sound: v.boolean(),
  notifications: v.boolean(),
  autoStartBreaks: v.boolean(),
  focusMinutes: v.number(),
  breakMinutes: v.number(),
  updatedAt: v.number(),
});

export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    return await ctx.db
      .query("appStates")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});

export const save = mutation({
  args: { state: stateValidator },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Sign in before saving.");
    }

    const existing = await ctx.db
      .query("appStates")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    const document = {
      userId,
      tasks: args.state.tasks,
      selectedTaskId: args.state.selectedTaskId,
      completedSessions: args.state.completedSessions,
      sessionDate: args.state.sessionDate,
      sound: args.state.sound,
      notifications: args.state.notifications,
      autoStartBreaks: args.state.autoStartBreaks,
      focusMinutes: args.state.focusMinutes,
      breakMinutes: args.state.breakMinutes,
      updatedAt: args.state.updatedAt,
    };

    if (existing === null) {
      await ctx.db.insert("appStates", document);
      return;
    }
    await ctx.db.replace(existing._id, document);
  },
});
