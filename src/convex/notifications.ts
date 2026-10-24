import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/server";

/** اعلان‌های درون برنامه‌ای کاربر (بخش ۱۳) */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(30);
    const unread = notifications.filter((n) => n.readAt === undefined).length;
    return { notifications, unread };
  },
});

/** علامت‌خوردن یک اعلان */
export const markRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }) => {
    const user = await requireUser(ctx);
    const notification = await ctx.db.get(notificationId);
    if (!notification) throw new Error("اعلان یافت نشد.");
    if (notification.userId !== user._id) throw new Error("این اعلان متعلق به شما نیست.");
    if (notification.readAt === undefined) {
      await ctx.db.patch(notificationId, { readAt: Date.now() });
    }
    return { ok: true as const };
  },
});

/** علامت‌خوردن همه اعلان‌ها */
export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user_unread", (q) => q.eq("userId", user._id).eq("readAt", undefined))
      .take(200);
    const now = Date.now();
    for (const notification of notifications) {
      await ctx.db.patch(notification._id, { readAt: now });
    }
    return { ok: true as const, count: notifications.length };
  },
});