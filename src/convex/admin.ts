import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  audit,
  ensureWallet,
  notify,
  requireAdmin,
  type AnyCtx,
  type WriteCtx,
} from "./lib/server";

const driverStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
);

async function settleWalletFor(
  ctx: WriteCtx,
  driverId: Id<"users">,
  amount: number,
  fromWallet: boolean,
  settlementId: Id<"settlements">,
): Promise<void> {
  const wallet = await ensureWallet(ctx, driverId);
  const now = Date.now();
  const patch: Partial<Doc<"wallets">> = {
    commissionUnpaid: Math.max(0, wallet.commissionUnpaid - amount),
    commissionPaid: wallet.commissionPaid + amount,
    debt: Math.max(0, wallet.debt - amount),
    updatedAt: now,
  };
  if (fromWallet) {
    if (wallet.balance < amount) {
      throw new Error(
        `موجودی کیف پول راننده (${wallet.balance.toLocaleString("fa-IR")} تومان) کافی نیست.`,
      );
    }
    patch.balance = wallet.balance - amount;
  }
  patch.status = patch.debt === 0 ? "active" : "debt";
  await ctx.db.patch(wallet._id, patch);
  await ctx.db.insert("transactions", {
    walletId: wallet._id,
    driverId,
    settlementId,
    type: "settlement",
    amount: fromWallet ? -amount : -amount,
    affectsBalance: fromWallet,
    status: "confirmed",
    description: fromWallet
      ? "تسویه کمیسیون با کسر از کیف پول"
      : "تسویه کمیسیون با واریز مستقیم (تأیید دستی مدیر)",
    createdAt: now,
  });
}

/** ───────────────────── گزارش‌ها و فهرست‌ها ───────────────────── */

export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").collect();
    const trips = await ctx.db.query("trips").collect();
    const wallets = await ctx.db.query("wallets").collect();
    const settlements = await ctx.db
      .query("settlements")
      .withIndex("by_status", (q) => q.eq("status", "requested"))
      .collect();
    const pendingDocs = await ctx.db
      .query("driverDocuments")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    const completed = trips.filter((t) => t.status === "completed");
    const gross = wallets.reduce((sum, w) => sum + w.grossEarnings, 0);
    const commissionPaid = wallets.reduce((sum, w) => sum + w.commissionPaid, 0);
    const commissionUnpaid = wallets.reduce((sum, w) => sum + w.commissionUnpaid, 0);
    const withdrawn = wallets.reduce((sum, w) => sum + w.totalWithdrawn, 0);
    const debt = wallets.reduce((sum, w) => sum + w.debt, 0);

    return {
      counts: {
        users: users.length,
        drivers: users.filter((u) => u.accountType === "driver").length,
        approvedDrivers: users.filter((u) => u.driverStatus === "approved").length,
        passengers: users.filter((u) => u.accountType === "passenger").length,
        trips: trips.length,
        activeTrips: trips.filter((t) =>
          ["open", "accepted", "arrived", "in_progress"].includes(t.status),
        ).length,
        completedTrips: completed.length,
        pendingDocuments: pendingDocs.length,
        pendingSettlements: settlements.length,
      },
      finance: {
        gross,
        commissionPaid,
        commissionUnpaid,
        debt,
        withdrawn,
        fareTotal: completed.reduce((sum, t) => sum + t.priceTotal, 0),
        collected: completed.reduce((sum, t) => sum + t.seatsBooked * t.pricePerPassenger, 0),
      },
    };
  },
});

export const users = query({
  args: {
    search: v.optional(v.string()),
    accountType: v.optional(
      v.union(v.literal("passenger"), v.literal("driver"), v.literal("all")),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const all = await ctx.db.query("users").collect();
    const search = (args.search ?? "").trim().toLowerCase();
    const filtered = all.filter((u) => {
      if (args.accountType && args.accountType !== "all" && u.accountType !== args.accountType)
        return false;
      if (!search) return true;
      return (
        (u.phone ?? "").toLowerCase().includes(search) ||
        (u.name ?? "").toLowerCase().includes(search) ||
        (u.email ?? "").toLowerCase().includes(search)
      );
    });
    const rows = [];
    for (const user of filtered.slice(0, 200)) {
      const wallet = await ctx.db
        .query("wallets")
        .withIndex("by_driver", (q) => q.eq("driverId", user._id))
        .first();
      rows.push({
        user,
        wallet: wallet
          ? {
              balance: wallet.balance,
              debt: wallet.debt,
              commissionUnpaid: wallet.commissionUnpaid,
              status: wallet.status,
            }
          : null,
      });
    }
    return { rows };
  },
});

export const documents = query({
  args: {
    status: v.optional(
      v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"), v.literal("all")),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const status = args.status ?? "pending";
    const docs =
      status === "all"
        ? await ctx.db.query("driverDocuments").order("desc").take(200)
        : await ctx.db
            .query("driverDocuments")
            .withIndex("by_status", (q) => q.eq("status", status))
            .order("desc")
            .take(200);
    const rows = [];
    for (const doc of docs) {
      const driver = await ctx.db.get(doc.driverId);
      const vehicle = await ctx.db
        .query("vehicles")
        .withIndex("by_driver", (q) => q.eq("driverId", doc.driverId))
        .first();
      rows.push({
        doc,
        driverName: driver?.name ?? driver?.phone ?? "نامشخص",
        driverPhone: driver?.phone ?? null,
        driverStatus: driver?.driverStatus ?? null,
        vehicle: vehicle ? `${vehicle.model} — ${vehicle.plate}` : null,
      });
    }
    return { rows };
  },
});

export const tripsAdmin = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const search = (args.search ?? "").trim().toLowerCase();
    const all = await ctx.db.query("trips").order("desc").take(300);
    const rows = [];
    for (const trip of all) {
      if (
        search &&
        !trip.origin.label.toLowerCase().includes(search) &&
        !trip.destination.label.toLowerCase().includes(search)
      )
        continue;
      const owner = await ctx.db.get(trip.ownerId);
      const driver = trip.driverId ? await ctx.db.get(trip.driverId) : null;
      rows.push({
        trip,
        ownerName: owner?.name ?? owner?.phone ?? "نامشخص",
        driverName: driver?.name ?? driver?.phone ?? null,
      });
    }
    return { rows };
  },
});

export const wallets = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const all = await ctx.db.query("wallets").collect();
    const rows = [];
    for (const wallet of all) {
      const driver = await ctx.db.get(wallet.driverId);
      const pendingWithdrawals = await ctx.db
        .query("transactions")
        .withIndex("by_wallet", (q) => q.eq("walletId", wallet._id))
        .order("desc")
        .take(30);
      rows.push({
        wallet,
        driverName: driver?.name ?? driver?.phone ?? "نامشخص",
        driverPhone: driver?.phone ?? null,
        recentTransactions: pendingWithdrawals,
      });
    }
    return { rows };
  },
});

export const settlements = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("requested"),
        v.literal("approved"),
        v.literal("paid"),
        v.literal("rejected"),
        v.literal("all"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const status = args.status ?? "requested";
    const rows =
      status === "all"
        ? await ctx.db.query("settlements").order("desc").take(200)
        : await ctx.db
            .query("settlements")
            .withIndex("by_status", (q) => q.eq("status", status))
            .order("desc")
            .take(200);
    const out = [];
    for (const settlement of rows) {
      const driver = await ctx.db.get(settlement.driverId);
      out.push({
        settlement,
        driverName: driver?.name ?? driver?.phone ?? "نامشخص",
        driverPhone: driver?.phone ?? null,
      });
    }
    return { rows: out };
  },
});

export const payments = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("payments").order("desc").take(200);
    const out = [];
    for (const payment of rows) {
      const payer = await ctx.db.get(payment.payerId);
      out.push({ payment, payerName: payer?.name ?? payer?.phone ?? "نامشخص" });
    }
    return { rows: out };
  },
});

export const auditLog = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("auditLog").order("desc").take(150);
    const out = [];
    for (const row of rows) {
      const actor = row.actorId ? await ctx.db.get(row.actorId) : null;
      out.push({
        ...row,
        actorName: actor?.name ?? actor?.phone ?? "سیستم",
      });
    }
    return { rows: out };
  },
});

/** گزارش مالی در یک بازه زمانی */
export const financialReport = query({
  args: { fromTs: v.number(), toTs: v.number() },
  handler: async (ctx, { fromTs, toTs }) => {
    await requireAdmin(ctx);
    const transactions = await ctx.db.query("transactions").collect();
    const inRange = transactions.filter((t) => t.createdAt >= fromTs && t.createdAt <= toTs);
    const confirmed = inRange.filter((t) => t.status === "confirmed");
    const sum = (type: string) =>
      confirmed
        .filter((t) => t.type === type)
        .reduce((total, t) => total + t.amount, 0);

    const trips = await ctx.db.query("trips").collect();
    const tripsInRange = trips.filter(
      (t) => t.completedAt != null && t.completedAt >= fromTs && t.completedAt <= toTs,
    );

    return {
      fromTs,
      toTs,
      earnings: sum("earning"),
      commissionCollected: -sum("commission"),
      commissionPaidByDriver: -sum("commission_payment"),
      withdrawals: -sum("withdrawal"),
      deposits: sum("deposit"),
      settlements: -sum("settlement"),
      tripCount: tripsInRange.length,
      collected: tripsInRange.reduce((sum2, t) => sum2 + t.seatsBooked * t.pricePerPassenger, 0),
      commissionRegistered: confirmed
        .filter((t) => t.type === "commission_due")
        .reduce((total, t) => total + t.amount, 0),
      transactionCount: inRange.length,
    };
  },
});

/** ───────────────────── mutationهای مدیریتی ───────────────────── */

/** بررسی مدرک راننده */
export const reviewDocument = mutation({
  args: {
    documentId: v.id("driverDocuments"),
    decision: v.union(v.literal("approved"), v.literal("rejected")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { documentId, decision, notes }) => {
    const admin = await requireAdmin(ctx);
    const doc = await ctx.db.get(documentId);
    if (!doc) throw new Error("مدرک یافت نشد.");
    const now = Date.now();
    await ctx.db.patch(documentId, {
      status: decision,
      notes: notes?.trim() || undefined,
      reviewedAt: now,
      reviewerId: admin._id,
    });

    const all = await ctx.db
      .query("driverDocuments")
      .withIndex("by_driver", (q) => q.eq("driverId", doc.driverId))
      .collect();
    const latestByType = new Map<string, (typeof all)[number]>();
    for (const d of all) latestByType.set(d.docType, d);
    const docs = Array.from(latestByType.values());
    let status: Doc<"users">["driverStatus"] = "pending";
    if (docs.length > 0) {
      if (docs.some((d) => d.status === "rejected")) status = "rejected";
      else if (docs.every((d) => d.status === "approved")) status = "approved";
      else status = "pending";
    }
    await ctx.db.patch(doc.driverId, { driverStatus: status });

    await notify(ctx, {
      userId: doc.driverId,
      kind: "document_reviewed",
      title: status === "approved" ? "مدارک شما تأیید شد" : "نتیجه بررسی مدارک",
      body:
        status === "approved"
          ? "مدارک شما تأیید شد؛ اکنون می‌توانید سفر ثبت کنید و سفرها را بپذیرید."
          : status === "rejected"
            ? `مدرک شما رد شد.${notes ? ` دلیل: ${notes}` : ""}`
            : "مدرک شما در انتظار بررسی است.",
      link: "/dashboard/profile",
    });
    await audit(ctx, {
      actorId: admin._id,
      action: "document_reviewed",
      entity: "driverDocuments",
      entityId: documentId,
      summary: `${decision === "approved" ? "تأیید" : "رد"} مدرک ${doc.docType}`,
    });
    return { ok: true as const, driverStatus: status };
  },
});

export const setDriverStatus = mutation({
  args: { userId: v.id("users"), status: driverStatusValidator },
  handler: async (ctx, { userId, status }) => {
    const admin = await requireAdmin(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("کاربر یافت نشد.");
    if (user.role === "admin" && status !== "approved") {
      throw new Error("وضعیت مدیر قابل تغییر به این شکل نیست.");
    }
    await ctx.db.patch(userId, { driverStatus: status });
    await notify(ctx, {
      userId,
      kind: "driver_status_changed",
      title: "تغییر وضعیت حساب رانندگی",
      body: `وضعیت شما به «${status === "approved" ? "تأییدشده" : status === "rejected" ? "ردشده" : "در انتظار بررسی"}» تغییر کرد.`,
      link: "/dashboard/profile",
    });
    await audit(ctx, {
      actorId: admin._id,
      action: "driver_status_changed",
      entity: "users",
      entityId: userId,
      summary: `تغییر وضعیت راننده به ${status}`,
    });
    return { ok: true as const };
  },
});

export const setUserActive = mutation({
  args: { userId: v.id("users"), active: v.boolean() },
  handler: async (ctx, { userId, active }) => {
    const admin = await requireAdmin(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("کاربر یافت نشد.");
    if (user._id === admin._id) throw new Error("امکان غیرفعال‌سازی حساب خودتان نیست.");
    if (user.role === "admin") throw new Error("حساب مدیر قابل غیرفعال‌سازی نیست.");
    await ctx.db.patch(userId, { active });
    await audit(ctx, {
      actorId: admin._id,
      action: active ? "user_activated" : "user_deactivated",
      entity: "users",
      entityId: userId,
      summary: `${active ? "فعال" : "غیرفعال"}‌سازی حساب ${user.phone ?? user.name ?? userId}`,
    });
    return { ok: true as const };
  },
});

export const setUserRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("user"), v.literal("member")),
  },
  handler: async (ctx, { userId, role }) => {
    const admin = await requireAdmin(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("کاربر یافت نشد.");
    if (user._id === admin._id && role !== "admin") {
      throw new Error("امکان حذف دسترسی مدیر خودتان نیست.");
    }
    await ctx.db.patch(userId, { role });
    await audit(ctx, {
      actorId: admin._id,
      action: "role_changed",
      entity: "users",
      entityId: userId,
      summary: `تغییر نقش کاربر به ${role}`,
    });
    return { ok: true as const };
  },
});

export const cancelTripAdmin = mutation({
  args: { tripId: v.id("trips"), reason: v.string() },
  handler: async (ctx, { tripId, reason }) => {
    const admin = await requireAdmin(ctx);
    const trip = await ctx.db.get(tripId);
    if (!trip) throw new Error("سفر یافت نشد.");
    if (trip.status === "completed") throw new Error("سفر پایان‌یافته قابل لغو نیست.");
    const now = Date.now();
    await ctx.db.patch(tripId, {
      status: "cancelled",
      cancelledAt: now,
      cancelledBy: admin._id,
      updatedAt: now,
    });
    const targets = new Set<string>([trip.ownerId.toString()]);
    if (trip.driverId) targets.add(trip.driverId.toString());
    for (const id of targets) {
      await notify(ctx, {
        userId: id as Id<"users">,
        kind: "trip_cancelled",
        title: "سفر توسط مدیر لغو شد",
        body: `سفر «${trip.origin.label} به ${trip.destination.label}» لغو شد. دلیل: ${reason}`,
        link: `/dashboard/trips/${trip._id}`,
      });
    }
    await audit(ctx, {
      actorId: admin._id,
      action: "trip_cancelled_admin",
      entity: "trips",
      entityId: tripId,
      summary: `لغو سفر توسط مدیر — ${reason}`,
    });
    return { ok: true as const };
  },
});

/** تأیید یا رد درخواست برداشت */
export const reviewWithdrawal = mutation({
  args: {
    transactionId: v.id("transactions"),
    decision: v.union(v.literal("confirmed"), v.literal("rejected")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { transactionId, decision, note }) => {
    const admin = await requireAdmin(ctx);
    const txn = await ctx.db.get(transactionId);
    if (!txn) throw new Error("تراکنش یافت نشد.");
    if (txn.type !== "withdrawal") throw new Error("این تراکنش برداشت نیست.");
    if (txn.status !== "pending") throw new Error("این درخواست قبلاً بررسی شده است.");
    const wallet = await ctx.db.get(txn.walletId);
    if (!wallet) throw new Error("کیف پول یافت نشد.");

    const now = Date.now();
    if (decision === "rejected") {
      await ctx.db.patch(transactionId, {
        status: "rejected",
        description: `${txn.description}${note ? ` — رد شد: ${note}` : " — رد شد"}`,
      });
      await ctx.db.patch(wallet._id, {
        balance: wallet.balance - txn.amount, // txn.amount منفی است → بازگشت موجودی
        totalWithdrawn: Math.max(0, wallet.totalWithdrawn - Math.abs(txn.amount)),
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(transactionId, { status: "confirmed" });
    }

    await notify(ctx, {
      userId: txn.driverId,
      kind: "withdrawal_result",
      title: decision === "confirmed" ? "برداشت تأیید شد" : "برداشت رد شد",
      body:
        decision === "confirmed"
          ? `درخواست برداشت ${Math.abs(txn.amount).toLocaleString("fa-IR")} تومان تأیید شد.`
          : `درخواست برداشت شما رد شد.${note ? ` دلیل: ${note}` : ""}`,
      link: "/dashboard/wallet",
    });
    await audit(ctx, {
      actorId: admin._id,
      action: `withdrawal_${decision}`,
      entity: "transactions",
      entityId: transactionId,
      summary: `${decision === "confirmed" ? "تأیید" : "رد"} برداشت ${Math.abs(txn.amount).toLocaleString("fa-IR")} تومان`,
    });
    return { ok: true as const };
  },
});

/** ثبت واریز دستی به کیف پول راننده (پس از دریافت واقعی وجه) */
export const recordDeposit = mutation({
  args: {
    driverId: v.id("users"),
    amount: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { driverId, amount, note }) => {
    const admin = await requireAdmin(ctx);
    if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount) !== amount) {
      throw new Error("مبلغ واریزی باید عدد صحیح و بزرگ‌تر از صفر باشد.");
    }
    const driver = await ctx.db.get(driverId);
    if (!driver || driver.accountType !== "driver") {
      throw new Error("راننده موردنظر یافت نشد.");
    }
    const wallet = await ensureWallet(ctx, driverId);
    const now = Date.now();
    await ctx.db.patch(wallet._id, {
      balance: wallet.balance + amount,
      totalDeposited: wallet.totalDeposited + amount,
      updatedAt: now,
    });
    await ctx.db.insert("transactions", {
      walletId: wallet._id,
      driverId,
      type: "deposit",
      amount,
      affectsBalance: true,
      status: "confirmed",
      description: `واریز دستی${note ? ` — ${note}` : ""} (تأیید مدیر)`,
      createdAt: now,
    });
    await notify(ctx, {
      userId: driverId,
      kind: "wallet_deposit",
      title: "واریز به کیف پول",
      body: `${amount.toLocaleString("fa-IR")} تومان به کیف پول شما واریز شد.`,
      link: "/dashboard/wallet",
    });
    await audit(ctx, {
      actorId: admin._id,
      action: "wallet_deposit",
      entity: "wallets",
      entityId: wallet._id,
      summary: `واریز ${amount.toLocaleString("fa-IR")} تومان به کیف پول ${driver.name ?? driver.phone ?? driverId}`,
    });
    return { ok: true as const };
  },
});

/** اصلاح دستی موجودی (فقط با ذکر دلیل، در سوابق ثبت می‌شود) */
export const adjustWallet = mutation({
  args: {
    driverId: v.id("users"),
    delta: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, { driverId, delta, reason }) => {
    const admin = await requireAdmin(ctx);
    if (!Number.isFinite(delta) || Math.round(delta) !== delta || delta === 0) {
      throw new Error("مقدار اصلاح باید عدد صحیح غیرصفر باشد.");
    }
    if (reason.trim().length < 5) throw new Error("دلیل اصلاح را شرح دهید.");
    const wallet = await ensureWallet(ctx, driverId);
    if (wallet.balance + delta < 0) {
      throw new Error("موجودی کیف پول نمی‌تواند منفی شود.");
    }
    const now = Date.now();
    await ctx.db.patch(wallet._id, {
      balance: wallet.balance + delta,
      updatedAt: now,
    });
    await ctx.db.insert("transactions", {
      walletId: wallet._id,
      driverId,
      type: "adjustment",
      amount: delta,
      affectsBalance: true,
      status: "confirmed",
      description: `اصلاح موجودی — ${reason.trim()}`,
      createdAt: now,
    });
    await audit(ctx, {
      actorId: admin._id,
      action: "wallet_adjustment",
      entity: "wallets",
      entityId: wallet._id,
      summary: `اصلاح موجودی ${delta.toLocaleString("fa-IR")} تومان — ${reason.trim()}`,
    });
    return { ok: true as const };
  },
});

/** تأیید تسویه دوره‌ای */
export const approveSettlement = mutation({
  args: { settlementId: v.id("settlements"), decision: v.union(v.literal("approved"), v.literal("rejected")) },
  handler: async (ctx, { settlementId, decision }) => {
    const admin = await requireAdmin(ctx);
    const settlement = await ctx.db.get(settlementId);
    if (!settlement) throw new Error("درخواست تسویه یافت نشد.");
    if (settlement.status !== "requested") {
      throw new Error("این درخواست قبلاً بررسی شده است.");
    }
    await ctx.db.patch(settlementId, {
      status: decision,
      note: decision === "rejected" ? "رد توسط مدیر" : "تأیید توسط مدیر",
    });
    await notify(ctx, {
      userId: settlement.driverId,
      kind: "settlement_result",
      title: decision === "approved" ? "تسویه شما تأیید شد" : "تسویه رد شد",
      body:
        decision === "approved"
          ? `درخواست تسویه ${settlement.amount.toLocaleString("fa-IR")} تومان تأیید شد.`
          : "درخواست تسویه شما رد شد.",
      link: "/dashboard/wallet",
    });
    await audit(ctx, {
      actorId: admin._id,
      action: `settlement_${decision}`,
      entity: "settlements",
      entityId: settlementId,
      summary: `${decision === "approved" ? "تأیید" : "رد"} تسویه ${settlement.amount.toLocaleString("fa-IR")} تومان`,
    });
    return { ok: true as const };
  },
});

/** ثبت پرداخت نهایی تسویه (کسر از کیف پول یا واریز مستقیم) */
export const markSettlementPaid = mutation({
  args: {
    settlementId: v.id("settlements"),
    fromWallet: v.boolean(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { settlementId, fromWallet, note }) => {
    const admin = await requireAdmin(ctx);
    const settlement = await ctx.db.get(settlementId);
    if (!settlement) throw new Error("درخواست تسویه یافت نشد.");
    if (settlement.status !== "approved") {
      throw new Error("ابتدا درخواست تسویه را تأیید کنید.");
    }
    const wallet = await ctx.db.get(settlement.walletId);
    if (!wallet) throw new Error("کیف پول یافت نشد.");
    if (wallet.commissionUnpaid < settlement.amount) {
      throw new Error("بدهی فعلی از مبلغ تسویه کمتر است؛ درخواست را بازبینی کنید.");
    }

    await settleWalletFor(ctx, settlement.driverId, settlement.amount, fromWallet, settlementId);
    const now = Date.now();
    await ctx.db.patch(settlementId, {
      status: "paid",
      paidAt: now,
      note: note?.trim() || (fromWallet ? "کسر از کیف پول" : "واریز مستقیم"),
    });
    await ctx.db.insert("payments", {
      payerId: settlement.driverId,
      settlementId,
      kind: "settlement",
      amount: settlement.amount,
      provider: fromWallet ? "wallet" : "manual",
      status: "confirmed",
      idempotencyKey: `settlement:${settlement._id}`,
      createdAt: now,
      confirmedAt: now,
    });
    await notify(ctx, {
      userId: settlement.driverId,
      kind: "settlement_paid",
      title: "تسویه‌حساب انجام شد",
      body: `${settlement.amount.toLocaleString("fa-IR")} تومان کمیسیون تسویه شد.`,
      link: "/dashboard/wallet",
    });
    await audit(ctx, {
      actorId: admin._id,
      action: "settlement_paid",
      entity: "settlements",
      entityId: settlementId,
      summary: `پرداخت تسویه ${settlement.amount.toLocaleString("fa-IR")} تومان (${fromWallet ? "از کیف پول" : "واریز مستقیم"})`,
    });
    return { ok: true as const };
  },
});
