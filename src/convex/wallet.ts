import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  audit,
  ensureSettings,
  ensureWallet,
  loadSettings,
  notify,
  requireUser,
  type AnyCtx,
} from "./lib/server";

async function adminIds(ctx: AnyCtx): Promise<Id<"users">[]> {
  const admins = await ctx.db
    .query("users")
    .filter((q) => q.eq(q.field("role"), "admin"))
    .take(50);
  return admins.map((a) => a._id);
}

function requireAmount(amount: number, label: string): number {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`مقدار ${label} باید عددی بزرگ‌تر از صفر باشد.`);
  }
  if (Math.round(amount) !== amount) {
    throw new Error(`مقدار ${label} باید به تومان کامل باشد.`);
  }
  return amount;
}

/** جمع‌بندی کیف پول راننده (بخش ۰۹) */
export const summary = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const settings = await loadSettings(ctx);
    const wallet = await ctx.db
      .query("wallets")
      .withIndex("by_driver", (q) => q.eq("driverId", user._id))
      .first();

    const transactions = wallet
      ? await ctx.db
          .query("transactions")
          .withIndex("by_wallet", (q) => q.eq("walletId", wallet._id))
          .order("desc")
          .take(60)
      : [];

    const settlements = await ctx.db
      .query("settlements")
      .withIndex("by_driver", (q) => q.eq("driverId", user._id))
      .order("desc")
      .take(20);

    const payments = await ctx.db
      .query("payments")
      .withIndex("by_payer", (q) => q.eq("payerId", user._id))
      .order("desc")
      .take(20);

    const tripCount = (
      await ctx.db
        .query("trips")
        .withIndex("by_driver", (q) => q.eq("driverId", user._id))
        .collect()
    ).filter((t) => t.status === "completed").length;

    return {
      isDriver: user.accountType === "driver",
      driverStatus: user.driverStatus ?? null,
      wallet,
      transactions,
      settlements,
      payments,
      tripCount,
      settings,
    };
  },
});

/** برداشت از کیف پول — تا تأیید مدیر پرداخت نشده تلقی می‌شود */
export const requestWithdrawal = mutation({
  args: { amount: v.number() },
  handler: async (ctx, { amount }) => {
    const user = await requireUser(ctx);
    if (user.accountType !== "driver") {
      throw new Error("کیف پول فقط برای رانندگان فعال است.");
    }
    requireAmount(amount, "برداشت");
    const settings = await ensureSettings(ctx);
    const wallet = await ensureWallet(ctx, user._id);
    if (wallet.balance < amount) {
      throw new Error(
        `موجودی کیف پول (${wallet.balance.toLocaleString("fa-IR")} تومان) کمتر از مبلغ درخواستی است.`,
      );
    }
    if (settings.requireSettlementBeforeWithdraw && wallet.commissionUnpaid > 0) {
      throw new Error(
        `ابتدا باید کمیسیون پرداخت‌نشده (${wallet.commissionUnpaid.toLocaleString("fa-IR")} تومان) تسویه شود.`,
      );
    }

    const now = Date.now();
    await ctx.db.patch(wallet._id, {
      balance: wallet.balance - amount,
      totalWithdrawn: wallet.totalWithdrawn + amount,
      updatedAt: now,
    });
    const txnId = await ctx.db.insert("transactions", {
      walletId: wallet._id,
      driverId: user._id,
      type: "withdrawal",
      amount: -amount,
      affectsBalance: true,
      status: "pending",
      description: "درخواست برداشت — در انتظار تأیید و واریز دستی",
      createdAt: now,
    });

    for (const adminId of await adminIds(ctx)) {
      await notify(ctx, {
        userId: adminId,
        kind: "withdrawal_requested",
        title: "درخواست برداشت جدید",
        body: `${user.name ?? user.phone ?? "راننده"} مبلغ ${amount.toLocaleString("fa-IR")} تومان درخواست برداشت کرده است.`,
        link: "/app/admin/wallets",
      });
    }
    await audit(ctx, {
      actorId: user._id,
      action: "withdrawal_requested",
      entity: "transactions",
      entityId: txnId,
      summary: `درخواست برداشت ${amount.toLocaleString("fa-IR")} تومان`,
    });

    return { ok: true as const, txnId };
  },
});

/** پرداخت کمیسیون از موجودی کیف پول */
export const payCommissionFromWallet = mutation({
  args: { amount: v.optional(v.number()) },
  handler: async (ctx, { amount }) => {
    const user = await requireUser(ctx);
    if (user.accountType !== "driver") {
      throw new Error("کیف پول فقط برای رانندگان فعال است.");
    }
    const wallet = await ensureWallet(ctx, user._id);
    if (wallet.commissionUnpaid <= 0) {
      throw new Error("بدهی کمیسیونی برای پرداخت وجود ندارد.");
    }
    const target = amount === undefined ? wallet.commissionUnpaid : requireAmount(amount, "پرداخت");
    if (target > wallet.commissionUnpaid) {
      throw new Error("مبلغ پرداختی از بدهی فعلی بیشتر است.");
    }
    if (wallet.balance < target) {
      throw new Error(
        `موجودی کیف پول (${wallet.balance.toLocaleString("fa-IR")} تومان) برای پرداخت کمیسیون کافی نیست.`,
      );
    }

    const now = Date.now();
    await ctx.db.patch(wallet._id, {
      balance: wallet.balance - target,
      commissionUnpaid: wallet.commissionUnpaid - target,
      commissionPaid: wallet.commissionPaid + target,
      debt: Math.max(0, wallet.debt - target),
      status: wallet.debt - target > 0 ? "debt" : "active",
      updatedAt: now,
    });
    await ctx.db.insert("transactions", {
      walletId: wallet._id,
      driverId: user._id,
      type: "commission_payment",
      amount: -target,
      affectsBalance: true,
      status: "confirmed",
      description: "پرداخت کمیسیون سفریار از موجودی کیف پول",
      createdAt: now,
    });
    await ctx.db.insert("payments", {
      payerId: user._id,
      kind: "commission",
      amount: target,
      provider: "wallet",
      status: "confirmed",
      idempotencyKey: `commission:manual:${wallet._id}:${now}`,
      createdAt: now,
      confirmedAt: now,
    });
    await audit(ctx, {
      actorId: user._id,
      action: "commission_paid",
      entity: "wallets",
      entityId: wallet._id,
      summary: `پرداخت کمیسیون ${target.toLocaleString("fa-IR")} تومان از کیف پول`,
    });

    return { ok: true as const, amount: target };
  },
});

/**
 * پرداخت کمیسیون از طریق درگاه.
 * درگاه پرداخت متصل نیست؛ هیچ پرداختی بدون تأیید سرویس پرداخت، موفق نمی‌شود.
 */
export const payCommissionViaGateway = mutation({
  args: { amount: v.number() },
  handler: async (ctx, { amount }) => {
    const user = await requireUser(ctx);
    requireAmount(amount, "پرداخت");
    const settings = await ensureSettings(ctx);
    const wallet = await ensureWallet(ctx, user._id);
    if (amount > wallet.commissionUnpaid) {
      throw new Error("مبلغ پرداختی از بدهی فعلی بیشتر است.");
    }
    const now = Date.now();
    await ctx.db.insert("payments", {
      payerId: user._id,
      kind: "commission",
      amount,
      provider: "gateway",
      status: "not_connected",
      idempotencyKey: `commission:gateway:${wallet._id}:${now}`,
      failureReason: `سرویس درگاه پرداخت متصل نیست (ارائه‌دهنده: ${settings.paymentProvider})`,
      createdAt: now,
    });
    await audit(ctx, {
      actorId: user._id,
      action: "commission_gateway_attempt",
      entity: "payments",
      entityId: wallet._id,
      summary: `تلاش پرداخت اینترنتی ${amount.toLocaleString("fa-IR")} تومان — سرویس متصل نیست`,
    });
    return {
      ok: false as const,
      status: "not_connected" as const,
      message:
        "سرویس درگاه پرداخت متصل نیست؛ این پرداخت ثبت شده اما تأیید نشده است. روش وصول کمیسیون را از پنل مدیریت تغییر دهید.",
    };
  },
});

/** درخواست تسویه دوره‌ای کمیسیون */
export const requestSettlement = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (user.accountType !== "driver") {
      throw new Error("تسویه‌حساب برای رانندگان است.");
    }
    const settings = await ensureSettings(ctx);
    const wallet = await ensureWallet(ctx, user._id);
    if (wallet.commissionUnpaid <= 0) {
      throw new Error("بدهی کمیسیونی برای تسویه وجود ندارد.");
    }
    const existing = await ctx.db
      .query("settlements")
      .withIndex("by_driver", (q) => q.eq("driverId", user._id))
      .order("desc")
      .first();
    if (existing && (existing.status === "requested" || existing.status === "approved")) {
      throw new Error("یک درخواست تسویه باز دارید؛ تا تکمیل آن درخواست جدید ثبت نمی‌شود.");
    }

    const now = Date.now();
    const settlements = await ctx.db
      .query("settlements")
      .withIndex("by_driver", (q) => q.eq("driverId", user._id))
      .collect();
    const periodFrom = settlements.length
      ? Math.max(...settlements.map((s) => s.periodTo))
      : now - 30 * 24 * 60 * 60 * 1000;

    const settlementId = await ctx.db.insert("settlements", {
      driverId: user._id,
      walletId: wallet._id,
      amount: wallet.commissionUnpaid,
      periodFrom,
      periodTo: now,
      status: "requested",
      method: settings.commissionMethod,
      createdAt: now,
    });

    for (const adminId of await adminIds(ctx)) {
      await notify(ctx, {
        userId: adminId,
        kind: "settlement_requested",
        title: "درخواست تسویه جدید",
        body: `${user.name ?? user.phone ?? "راننده"} مبلغ ${wallet.commissionUnpaid.toLocaleString("fa-IR")} تومان تسویه درخواست کرده است.`,
        link: "/app/admin/settlements",
      });
    }
    await audit(ctx, {
      actorId: user._id,
      action: "settlement_requested",
      entity: "settlements",
      entityId: settlementId,
      summary: `درخواست تسویه ${wallet.commissionUnpaid.toLocaleString("fa-IR")} تومان`,
    });
    return { ok: true as const, settlementId };
  },
});

/** انصراف راننده از درخواست تسویه */
export const cancelSettlement = mutation({
  args: { settlementId: v.id("settlements") },
  handler: async (ctx, { settlementId }) => {
    const user = await requireUser(ctx);
    const settlement = await ctx.db.get(settlementId);
    if (!settlement) throw new Error("درخواست تسویه یافت نشد.");
    if (settlement.driverId !== user._id) throw new Error("این درخواست متعلق به شما نیست.");
    if (settlement.status !== "requested") {
      throw new Error("فقط درخواست‌های در حال بررسی قابل انصراف هستند.");
    }
    await ctx.db.patch(settlementId, {
      status: "rejected",
      note: "انصراف راننده",
      paidAt: Date.now(),
    });
    return { ok: true as const };
  },
});