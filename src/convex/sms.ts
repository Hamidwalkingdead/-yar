import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

/**
 * وضعیت سرویس پیامک و زیرساخت آزمایش.
 *
 * کد ورود فقط زمانی برگردانده می‌شود که سرویس پیامک متصل نباشد
 * (delivered=false). به محض اتصال سرویس واقعی، کد هرگز از این مسیر در دسترس نیست.
 */
export const store = internalMutation({
  args: {
    phone: v.string(),
    code: v.string(),
    delivered: v.boolean(),
    provider: v.string(),
    error: v.optional(v.string()),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    // نگه‌داشتن فقط چند ردیف اخیر برای هر شماره
    const recent = await ctx.db
      .query("smsOutbox")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .order("desc")
      .take(10);
    for (const row of recent.slice(5)) {
      await ctx.db.delete(row._id);
    }
    await ctx.db.insert("smsOutbox", {
      phone: args.phone,
      code: args.code,
      delivered: args.delivered,
      provider: args.provider,
      error: args.error,
      expiresAt: args.expiresAt,
      createdAt: now,
    });
  },
});

/**
 * وضعیت ارسال آخرین کد برای یک شماره.
 * وقتی سرویس پیامک متصل نباشد، کد آزمایشی همراه با هشدار برگردانده می‌شود.
 */
export const status = query({
  args: { phone: v.string() },
  handler: async (ctx, { phone }) => {
    const row = await ctx.db
      .query("smsOutbox")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .order("desc")
      .first();
    if (!row) {
      return {
        sent: false as const,
        delivered: false as const,
        code: null as string | null,
        expiresAt: 0,
        error: null as string | null,
      };
    }
    const expired = row.expiresAt < Date.now();
    return {
      sent: true as const,
      delivered: row.delivered,
      // فقط در حالت آزمایشی (سرویس متصل نیست) کد برگردانده می‌شود
      code: !row.delivered && !expired ? row.code : null,
      expiresAt: row.expiresAt,
      error: row.error ?? null,
    };
  },
});