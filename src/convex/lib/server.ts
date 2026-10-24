import { getAuthUserId } from "@convex-dev/auth/server";
import type { GenericQueryCtx, GenericMutationCtx } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";

/** سرویسی که فقط می‌خواند (query یا mutation) */
export type AnyCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>;
/** سرویسی که روی پایگاه داده می‌نویسد (mutation) */
export type WriteCtx = GenericMutationCtx<DataModel>;

export const APP_SETTINGS_KEY = "app";

export interface SettingsLike {
  key: string;
  baseRatePerKm: number;
  surchargeNight: number;
  surchargeRain: number;
  surchargeSnow: number;
  surchargeMountain: number;
  nightStartHour: number;
  nightEndHour: number;
  mountainGainM: number;
  commissionPercent: number;
  commissionFixed: number;
  commissionBasis: "fare_total" | "driver_share";
  commissionPayer: "driver" | "platform";
  commissionMethod: "wallet" | "gateway" | "periodic" | "debt";
  blockAcceptanceWhenInDebt: boolean;
  requireSettlementBeforeWithdraw: boolean;
  tripExpiryMinutes: number;
  mapProvider: string;
  smsProvider: string;
  paymentProvider: string;
  timezone: string;
  updatedAt: number;
  updatedBy?: Id<"users">;
}

export const DEFAULT_SETTINGS: SettingsLike = {
  key: APP_SETTINGS_KEY,
  baseRatePerKm: 11500,
  surchargeNight: 1000,
  surchargeRain: 1000,
  surchargeSnow: 2000,
  surchargeMountain: 1000,
  nightStartHour: 20,
  nightEndHour: 6,
  mountainGainM: 600,
  commissionPercent: 10,
  commissionFixed: 0,
  commissionBasis: "fare_total",
  commissionPayer: "driver",
  commissionMethod: "wallet",
  blockAcceptanceWhenInDebt: true,
  requireSettlementBeforeWithdraw: true,
  tripExpiryMinutes: 0,
  mapProvider: "osrm-public",
  smsProvider: "not_connected",
  paymentProvider: "not_connected",
  timezone: "Asia/Tehran",
  updatedAt: 0,
};

/** خواندن تنظیمات؛ اگر هنوز ساخته نشده باشد مقادیر پیش‌فرض برمی‌گردد. */
export async function loadSettings(ctx: AnyCtx): Promise<SettingsLike> {
  const row = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", APP_SETTINGS_KEY))
    .first();
  if (!row) return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...row };
}

/** ایجاد سند تنظیمات در صورت نبود (فقط از mutationها قابل فراخوانی) */
export async function ensureSettings(ctx: WriteCtx): Promise<SettingsLike> {
  const row = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", APP_SETTINGS_KEY))
    .first();
  if (row) return { ...DEFAULT_SETTINGS, ...row };
  const now = Date.now();
  await ctx.db.insert("settings", { ...DEFAULT_SETTINGS, updatedAt: now });
  return { ...DEFAULT_SETTINGS, updatedAt: now };
}

/** کاربر واردشده؛ در صورت نبود خطا می‌دهد (کنترل دسترسی سمت سرور) */
export async function requireUser(ctx: AnyCtx): Promise<Doc<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("ابتدا وارد حساب خود شوید.");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("حساب کاربری یافت نشد.");
  if (user.active === false) throw new Error("حساب شما توسط مدیر غیرفعال شده است.");
  return user;
}

export async function requireAdmin(ctx: AnyCtx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") {
    throw new Error("دسترسی به پنل مدیریت مجاز نیست.");
  }
  return user;
}

export async function isApprovedDriver(
  ctx: AnyCtx,
  userId: Id<"users">,
): Promise<Doc<"users"> | null> {
  const user = await ctx.db.get(userId);
  if (!user) return null;
  if (user.accountType !== "driver" || user.driverStatus !== "approved") return null;
  if (user.active === false) return null;
  return user;
}

/** کیف پول راننده را می‌سازد اگر وجود نداشته باشد */
export async function ensureWallet(
  ctx: WriteCtx,
  driverId: Id<"users">,
): Promise<Doc<"wallets">> {
  const existing = await ctx.db
    .query("wallets")
    .withIndex("by_driver", (q) => q.eq("driverId", driverId))
    .first();
  if (existing) return existing;
  const now = Date.now();
  const id = await ctx.db.insert("wallets", {
    driverId,
    balance: 0,
    grossEarnings: 0,
    netEarnings: 0,
    commissionUnpaid: 0,
    commissionPaid: 0,
    totalWithdrawn: 0,
    totalDeposited: 0,
    debt: 0,
    status: "active",
    updatedAt: now,
  });
  const created = await ctx.db.get(id);
  if (!created) throw new Error("ساخت کیف پول ناموفق بود.");
  return created;
}

/** اعلان درون برنامه‌ای */
export async function notify(
  ctx: WriteCtx,
  input: {
    userId: Id<"users">;
    kind: string;
    title: string;
    body: string;
    link?: string;
  },
): Promise<void> {
  await ctx.db.insert("notifications", {
    userId: input.userId,
    kind: input.kind,
    title: input.title,
    body: input.body,
    link: input.link,
    createdAt: Date.now(),
  });
}

/** ثبت رویداد در سوابق تغییرات */
export async function audit(
  ctx: WriteCtx,
  input: {
    actorId?: Id<"users">;
    action: string;
    entity: string;
    entityId?: string;
    summary: string;
  },
): Promise<void> {
  await ctx.db.insert("auditLog", {
    actorId: input.actorId,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId,
    summary: input.summary,
    createdAt: Date.now(),
  });
}

/**
 * وضعیت مؤثر سفر: سفرهایی که از زمان حرکت گذشته‌اند از فهرست فعال حذف می‌شوند.
 */
export function effectiveTripStatus(
  trip: Pick<Doc<"trips">, "status" | "departureAt">,
  now: number,
  expiryMinutes = 0,
): Doc<"trips">["status"] {
  if (trip.status === "open" || trip.status === "accepted") {
    if (trip.departureAt + expiryMinutes * 60_000 < now) return "expired";
  }
  return trip.status;
}

export const ACTIVE_TRIP_STATUSES: Doc<"trips">["status"][] = [
  "open",
  "accepted",
  "arrived",
  "in_progress",
];