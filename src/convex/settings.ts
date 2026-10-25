import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  APP_SETTINGS_KEY,
  DEFAULT_SETTINGS,
  audit,
  ensureSettings,
  loadSettings,
  requireAdmin,
  requireUser,
} from "./lib/server";

const commissionBasisValidator = v.union(
  v.literal("fare_total"),
  v.literal("driver_share"),
);
const commissionPayerValidator = v.union(v.literal("driver"), v.literal("platform"));
const commissionMethodValidator = v.union(
  v.literal("wallet"),
  v.literal("gateway"),
  v.literal("periodic"),
  v.literal("debt"),
);

/** تنظیمات عمومی برای رابط کاربری */
export const get = query({
  args: {},
  handler: async (ctx) => loadSettings(ctx),
});

/** آیا پیش‌تر مدیری تعیین شده است؟ (راه‌اندازی اولیه) */
export const adminExists = query({
  args: {},
  handler: async (ctx) => {
    const admins = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "admin"))
      .take(1);
    return admins.length > 0;
  },
});

/**
 * راه‌اندازی اولیه: فقط تا زمانی که هیچ مدیری وجود ندارد.
 * بعد از آن تغییر نقش از این مسیر مسدود است.
 */
export const claimAdmin = mutation({
  args: { displayName: v.optional(v.string()) },
  handler: async (ctx, { displayName }) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "admin"))
      .take(1);
    if (existing.length > 0 && user.role !== "admin") {
      throw new Error(
        "یک مدیر در سامانه ثبت شده است؛ این مسیر فقط برای راه‌اندازی اولیه در دسترس است.",
      );
    }
    await ensureSettings(ctx);
    if (user.role !== "admin") {
      await ctx.db.patch(user._id, {
        role: "admin",
        name: displayName?.trim() || user.name || "مدیر سفریار",
      });
    }
    await audit(ctx, {
      actorId: user._id,
      action: "claim_admin",
      entity: "users",
      entityId: user._id,
      summary: "راه‌اندازی اولیه و تعیین نخستین مدیر",
    });
    return { ok: true as const };
  },
});

/** به‌روزرسانی تنظیمات نرخ، کمیسیون و سرویس‌ها (فقط مدیر) */
export const update = mutation({
  args: {
    baseRatePerKm: v.number(),
    surchargeNight: v.number(),
    surchargeRain: v.number(),
    surchargeSnow: v.number(),
    surchargeMountain: v.number(),
    nightStartHour: v.number(),
    nightEndHour: v.number(),
    mountainGainM: v.number(),
    commissionPercent: v.number(),
    commissionFixed: v.number(),
    commissionBasis: commissionBasisValidator,
    commissionPayer: commissionPayerValidator,
    commissionMethod: commissionMethodValidator,
    autoCommissionEnabled: v.optional(v.boolean()),
    walletTopupRequired: v.optional(v.boolean()),
    minAcceptanceBalance: v.optional(v.number()),
    debtHandling: v.optional(v.union(v.literal("block"), v.literal("allow"))),
    blockAcceptanceWhenInDebt: v.boolean(),
    requireSettlementBeforeWithdraw: v.boolean(),
    tripExpiryMinutes: v.number(),
    mapProvider: v.string(),
    smsProvider: v.string(),
    paymentProvider: v.string(),
    timezone: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    await ensureSettings(ctx);
    for (const [key, value] of Object.entries(args)) {
      if (typeof value === "number" && !Number.isFinite(value)) {
        throw new Error(`مقدار «${key}» نامعتبر است.`);
      }
    }
    if (args.baseRatePerKm < 0) throw new Error("نرخ پایه نمی‌تواند منفی باشد.");
    if (args.commissionPercent < 0 || args.commissionPercent > 100) {
      throw new Error("درصد کمیسیون باید بین ۰ تا ۱۰۰ باشد.");
    }
    if (args.minAcceptanceBalance !== undefined && args.minAcceptanceBalance < 0) {
      throw new Error("حداقل موجودی نمی‌تواند منفی باشد.");
    }
    if (args.nightStartHour < 0 || args.nightStartHour > 23) {
      throw new Error("ساعت شروع شب نامعتبر است.");
    }
    if (args.nightEndHour < 0 || args.nightEndHour > 23) {
      throw new Error("ساعت پایان شب نامعتبر است.");
    }

    const row = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", APP_SETTINGS_KEY))
      .first();
    // «نحوه برخورد با بدهی» مرجع است؛ فیلد قدیمی همراه آن هم‌سان می‌شود
    const debtHandling =
      args.debtHandling ?? (args.blockAcceptanceWhenInDebt ? "block" : "allow");
    const patch = {
      ...args,
      autoCommissionEnabled: args.autoCommissionEnabled ?? true,
      walletTopupRequired: args.walletTopupRequired ?? false,
      minAcceptanceBalance: args.minAcceptanceBalance ?? 0,
      debtHandling,
      blockAcceptanceWhenInDebt: debtHandling === "block",
      updatedAt: Date.now(),
      updatedBy: admin._id,
    };
    if (row) {
      await ctx.db.patch(row._id, patch);
    } else {
      await ctx.db.insert("settings", { ...DEFAULT_SETTINGS, ...patch });
    }
    await audit(ctx, {
      actorId: admin._id,
      action: "update_settings",
      entity: "settings",
      entityId: APP_SETTINGS_KEY,
      summary: `به‌روزرسانی تنظیمات: نرخ پایه ${args.baseRatePerKm} تومان، کمیسیون ${args.commissionPercent}٪`,
    });
    return { ok: true as const };
  },
});