import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { computeCommission } from "./lib/pricing";
import {
  audit,
  effectiveTripStatus,
  ensureSettings,
  ensureWallet,
  loadSettings,
  notify,
  requireUser,
  type AnyCtx,
  type SettingsLike,
} from "./lib/server";
import { locationArg, quotePayloadValidator } from "./lib/validators";

const accountRoleValidator = v.union(
  v.literal("passenger"),
  v.literal("driver"),
);
const sortValidator = v.union(
  v.literal("time"),
  v.literal("price"),
  v.literal("distance"),
);

const REQUESTABLE_STATUSES = ["open", "accepted"] as const;

async function driverBlockReason(
  ctx: AnyCtx,
  driverId: Id<"users">,
  settings: SettingsLike,
): Promise<string | null> {
  const wallet = await ctx.db
    .query("wallets")
    .withIndex("by_driver", (q) => q.eq("driverId", driverId))
    .first();
  if (
    settings.blockAcceptanceWhenInDebt &&
    wallet &&
    wallet.debt > 0 &&
    settings.commissionMethod !== "wallet"
  ) {
    return `بدهی پرداخت‌نشده کمیسیون (${wallet.debt.toLocaleString("fa-IR")} تومان) دارید؛ تا تسویه، پذیرش سفر مسدود است.`;
  }
  return null;
}

async function loadTrip(ctx: AnyCtx, tripId: Id<"trips">) {
  const trip = await ctx.db.get(tripId);
  if (!trip) throw new Error("سفر موردنظر یافت نشد.");
  return trip;
}

/** ─────────────────────────── پرس‌وجوها ─────────────────────────── */

/**
 * فهرست فشرده سفرهای فعال (بخش ۰۴) با جست‌وجو، مرتب‌سازی و فیلتر.
 */
export const list = query({
  args: {
    search: v.optional(v.string()),
    sort: v.optional(sortValidator),
    minPrice: v.optional(v.number()),
    maxPrice: v.optional(v.number()),
    minDistance: v.optional(v.number()),
    maxDistance: v.optional(v.number()),
    newOnly: v.optional(v.boolean()),
    /** بازهٔ تاریخ حرکت (شمسی در رابط کاربری) — پایان بازه، آغاز روز بعد است */
    departureFrom: v.optional(v.number()),
    departureTo: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const settings = await loadSettings(ctx);
    const now = Date.now();

    const collected: Doc<"trips">[] = [];
    for (const status of ["open", "accepted", "arrived", "in_progress"] as const) {
      const rows = await ctx.db
        .query("trips")
        .withIndex("by_status_departure", (q) => q.eq("status", status))
        .collect();
      collected.push(...rows);
    }

    const wallet = await ctx.db
      .query("wallets")
      .withIndex("by_driver", (q) => q.eq("driverId", user._id))
      .first();
    const debtBlocked =
      settings.blockAcceptanceWhenInDebt &&
      !!wallet &&
      wallet.debt > 0 &&
      settings.commissionMethod !== "wallet";

    const search = (args.search ?? "").trim().toLowerCase();
    const minPrice = args.minPrice ?? 0;
    const maxPrice = args.maxPrice ?? Number.MAX_SAFE_INTEGER;
    const minDistance = args.minDistance ?? 0;
    const maxDistance = args.maxDistance ?? Number.MAX_SAFE_INTEGER;
    const newWindowMs = 30 * 60_000;

    const ownerIds = Array.from(new Set(collected.map((t) => t.ownerId)));
    const owners = new Map<string, Doc<"users">>();
    for (const id of ownerIds) {
      const owner = await ctx.db.get(id);
      if (owner) owners.set(id, owner);
    }

    const myRequests = await ctx.db
      .query("tripRequests")
      .withIndex("by_requester", (q) => q.eq("requesterId", user._id))
      .collect();
    const myRequestByTrip = new Map<string, string>();
    for (const request of myRequests) {
      myRequestByTrip.set(request.tripId, request.status);
    }

    let rows = collected
      .map((trip) => ({ trip, owner: owners.get(trip.ownerId) }))
      .filter((row) => {
        const status = effectiveTripStatus(row.trip, now, settings.tripExpiryMinutes);
        if (status === "expired" || status === "cancelled") return false;
        if (status === "completed") return false;
        return true;
      })
      .filter((row) => {
        if (!search) return true;
        return (
          row.trip.origin.label.toLowerCase().includes(search) ||
          row.trip.destination.label.toLowerCase().includes(search)
        );
      })
      .filter(
        (row) =>
          row.trip.priceTotal >= minPrice &&
          row.trip.priceTotal <= maxPrice &&
          row.trip.distanceKm >= minDistance &&
          row.trip.distanceKm <= maxDistance,
      )
      .filter((row) =>
        args.newOnly ? now - row.trip.createdAt < newWindowMs : true,
      )
      .filter((row) => {
        if (args.departureFrom !== undefined && row.trip.departureAt < args.departureFrom) {
          return false;
        }
        if (args.departureTo !== undefined && row.trip.departureAt >= args.departureTo) {
          return false;
        }
        return true;
      });

    const sort = args.sort ?? "time";
    rows.sort((a, b) => {
      if (sort === "price") return a.trip.priceTotal - b.trip.priceTotal;
      if (sort === "distance") return a.trip.distanceKm - b.trip.distanceKm;
      return a.trip.departureAt - b.trip.departureAt;
    });

    const trips = await Promise.all(
      rows.map(async ({ trip, owner }) => {
        const status = effectiveTripStatus(trip, now, settings.tripExpiryMinutes);
        const isMine = trip.ownerId === user._id;
        const isDriverSide = user.accountType === "driver" && user.driverStatus === "approved";
        const myRequestStatus = myRequestByTrip.get(trip._id) ?? null;

        let canAccept = false;
        let blockReason: string | null = null;

        if (trip.ownerRole === "passenger") {
          if (!isMine && isDriverSide) {
            if (status !== "open") blockReason = "این سفر پذیرفته شده است.";
            else if (trip.seatsBooked >= trip.seats) blockReason = "ظرفیت تکمیل است.";
            else {
              const blocked = await driverBlockReason(ctx, user._id, settings);
              if (blocked) blockReason = blocked;
              else {
                const accepted = await ctx.db
                  .query("tripRequests")
                  .withIndex("by_trip", (q) =>
                    q.eq("tripId", trip._id).eq("status", "accepted"),
                  )
                  .first();
                if (accepted) blockReason = "این سفر قبلاً پذیرفته شده است.";
                else canAccept = true;
              }
            }
            if (!blockReason && !canAccept) blockReason = "پذیرش برای شما مجاز نیست.";
          } else if (!isDriverSide) {
            blockReason = isMine
              ? "در انتظار پذیرش راننده"
              : "فقط رانندگان می‌توانند این سفر را بپذیرند.";
          }
        } else {
          if (isMine) blockReason = "در انتظار درخواست مسافر";
          else if (user.accountType !== "passenger")
            blockReason = "فقط مسافران می‌توانند درخواست ثبت کنند.";
          else if (status !== "open" && status !== "accepted")
            blockReason = "این سفر فعال نیست.";
          else if (trip.seatsBooked >= trip.seats) blockReason = "ظرفیت تکمیل است.";
          else if (myRequestStatus === "pending") blockReason = "درخواست شما ثبت شده است.";
          else if (myRequestStatus === "accepted") blockReason = "در این سفر پذیرفته شده‌اید.";
          else canAccept = true;
        }

        const ownerUser = owner;
        return {
          ...trip,
          effectiveStatus: status,
          isMine,
          ownerName: ownerUser?.name ?? (trip.ownerRole === "driver" ? "راننده سفریار" : "مسافر سفریار"),
          ownerRating: ownerUser?.defaultRating ?? null,
          canRequest: canAccept && trip.ownerRole === "driver",
          canAcceptTrip: canAccept && trip.ownerRole === "passenger",
          myRequestStatus,
          blockReason,
          isNew: now - trip.createdAt < newWindowMs,
          isNight: trip.conditions.includes("night"),
        };
      }),
    );

    return { trips, now };
  },
});

/** سفر + جزئیات طرف‌های درگیر (برای صفحه جزئیات) */
export const get = query({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const user = await requireUser(ctx);
    const settings = await loadSettings(ctx);
    const trip = await ctx.db.get(tripId);
    if (!trip) return null;
    const now = Date.now();
    const owner = await ctx.db.get(trip.ownerId);
    const driver = trip.driverId ? await ctx.db.get(trip.driverId) : null;
    const vehicle =
      trip.driverId != null
        ? await ctx.db
            .query("vehicles")
            .withIndex("by_driver", (q) => q.eq("driverId", trip.driverId!))
            .first()
        : null;

    const requests = await ctx.db
      .query("tripRequests")
      .withIndex("by_trip", (q) => q.eq("tripId", trip._id))
      .collect();

    const requesterIds = Array.from(new Set(requests.map((r) => r.requesterId)));
    const requesters = new Map<string, Doc<"users">>();
    for (const id of requesterIds) {
      const u = await ctx.db.get(id);
      if (u) requesters.set(id, u);
    }

    const isOwner = trip.ownerId === user._id;
    const isAcceptedParticipant =
      isOwner ||
      trip.driverId === user._id ||
      requests.some((r) => r.requesterId === user._id && r.status === "accepted");

    const myRequest = requests.find((r) => r.requesterId === user._id) ?? null;
    const status = effectiveTripStatus(trip, now, settings.tripExpiryMinutes);

    return {
      trip: { ...trip, effectiveStatus: status },
      owner: owner
        ? {
            _id: owner._id,
            name: owner.name ?? "کاربر سفریار",
            rating: owner.defaultRating ?? null,
            accountType: owner.accountType ?? null,
          }
        : null,
      // اطلاعات ضروری طرف مقابل فقط پس از تأیید سفر دیده می‌شود
      driver:
        isAcceptedParticipant && driver
          ? {
              _id: driver._id,
              name: driver.name ?? "راننده سفریار",
              phone: driver.phone ?? null,
              rating: driver.defaultRating ?? null,
              vehicle: vehicle
                ? {
                    model: vehicle.model,
                    plate: vehicle.plate,
                    color: vehicle.color,
                    capacity: vehicle.capacity,
                  }
                : null,
            }
          : null,
      requests: isOwner
        ? requests.map((r) => ({
            ...r,
            requesterName: requesters.get(r.requesterId)?.name ?? "کاربر سفریار",
            requesterRating: requesters.get(r.requesterId)?.defaultRating ?? null,
          }))
        : [],
      myRequest,
      isOwner,
      isDriver: trip.driverId === user._id,
      isAcceptedParticipant,
      viewerRole: user.accountType ?? "passenger",
      settings,
      canRate:
        status === "completed" &&
        !trip.rating &&
        ((trip.ownerRole === "passenger" && isOwner) ||
          (trip.ownerRole === "driver" &&
            !!myRequest &&
            myRequest.status === "accepted")),
    };
  },
});

/** سفرهای من (به‌عنوان مالک یا راننده) */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const settings = await loadSettings(ctx);
    const now = Date.now();
    const own = await ctx.db
      .query("trips")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .collect();
    const driving = await ctx.db
      .query("trips")
      .withIndex("by_driver", (q) => q.eq("driverId", user._id))
      .collect();
    const map = new Map<string, Doc<"trips">>();
    for (const t of [...own, ...driving]) map.set(t._id, t);
    const trips = Array.from(map.values())
      .map((t) => ({ ...t, effectiveStatus: effectiveTripStatus(t, now, settings.tripExpiryMinutes) }))
      .sort((a, b) => b.departureAt - a.departureAt);
    return { trips, now };
  },
});

/** درخواست‌های من (به‌عنوان مسافر روی سفرهای رانندگان) */
export const myRequests = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const settings = await loadSettings(ctx);
    const now = Date.now();
    const requests = await ctx.db
      .query("tripRequests")
      .withIndex("by_requester", (q) => q.eq("requesterId", user._id))
      .collect();
    const rows = [];
    for (const request of requests) {
      const trip = await ctx.db.get(request.tripId);
      if (!trip) continue;
      rows.push({
        request,
        trip: {
          ...trip,
          effectiveStatus: effectiveTripStatus(trip, now, settings.tripExpiryMinutes),
        },
      });
    }
    rows.sort((a, b) => b.request.createdAt - a.request.createdAt);
    return { rows, now };
  },
});

/** درخواست‌های رسیده روی سفرهای من (برای راننده/مالک سفر) */
export const inbox = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const settings = await loadSettings(ctx);
    const now = Date.now();
    const own = await ctx.db
      .query("trips")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .collect();
    const rows = [];
    for (const trip of own) {
      const requests = await ctx.db
        .query("tripRequests")
        .withIndex("by_trip", (q) => q.eq("tripId", trip._id))
        .collect();
      for (const request of requests) {
        const requester = await ctx.db.get(request.requesterId);
        rows.push({
          request,
          trip: {
            ...trip,
            effectiveStatus: effectiveTripStatus(trip, now, settings.tripExpiryMinutes),
          },
          requesterName: requester?.name ?? "کاربر سفریار",
          requesterRating: requester?.defaultRating ?? null,
        });
      }
    }
    rows.sort((a, b) => b.request.createdAt - a.request.createdAt);
    return { rows, now };
  },
});

/** ─────────────────────────── mutationها ─────────────────────────── */

/** درج سفر — فقط از مسیر سرور (tripActions.create) صدا زده می‌شود */
export const insert = internalMutation({
  args: {
    userId: v.id("users"),
    ownerRole: accountRoleValidator,
    origin: locationArg,
    destination: locationArg,
    departureAt: v.number(),
    seats: v.number(),
    note: v.optional(v.string()),
    quote: quotePayloadValidator,
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("کاربر یافت نشد.");
    const settings = await ensureSettings(ctx);
    const now = Date.now();

    if (args.ownerRole === "driver") {
      if (user.accountType !== "driver" || user.driverStatus !== "approved") {
        throw new Error("فقط رانندگان تأییدشده می‌توانند سفر ثبت کنند.");
      }
      const vehicle = await ctx.db
        .query("vehicles")
        .withIndex("by_driver", (q) => q.eq("driverId", user._id))
        .first();
      if (vehicle && args.seats > vehicle.capacity) {
        throw new Error(
          `ظرفیت قابل استفادهٔ خودروی شما ${vehicle.capacity} نفر است؛ نمی‌توانید ${args.seats} مسافر ثبت کنید.`,
        );
      }
      const blocked = await driverBlockReason(ctx, user._id, settings);
      if (blocked) throw new Error(blocked);
    }

    const tripId = await ctx.db.insert("trips", {
      ownerId: user._id,
      ownerRole: args.ownerRole,
      origin: args.origin,
      destination: args.destination,
      route: args.quote.route,
      distanceKm: args.quote.distanceKm,
      durationMin: args.quote.durationMin,
      departureAt: args.departureAt,
      conditions: args.quote.conditions,
      conditionSources: args.quote.conditionSources,
      baseRatePerKm: args.quote.baseRatePerKm,
      surchargePerKm: args.quote.surchargePerKm,
      ratePerKm: args.quote.ratePerKm,
      breakdown: args.quote.breakdown,
      priceTotal: args.quote.priceTotal,
      pricePerPassenger: args.quote.pricePerPassenger,
      seats: args.seats,
      seatsBooked: 0,
      commissionPercent: args.quote.commissionPercent,
      commissionFixed: args.quote.commissionFixed,
      commissionBasis: args.quote.commissionBasis,
      commissionPayer: args.quote.commissionPayer,
      commissionMethod: args.quote.commissionMethod,
      commissionAmount: args.quote.commissionAmount,
      driverShare: args.quote.driverShare,
      driverNet: args.quote.driverNet,
      status: "open",
      driverId: args.ownerRole === "driver" ? user._id : undefined,
      createdAt: now,
      updatedAt: now,
      note: args.note,
    });

    await audit(ctx, {
      actorId: user._id,
      action: "trip_created",
      entity: "trips",
      entityId: tripId,
      summary: `ثبت سفر ${args.origin.label} به ${args.destination.label} — ${args.quote.distanceKm} کیلومتر، ${args.quote.priceTotal.toLocaleString("fa-IR")} تومان`,
    });

    return tripId;
  },
});

/**
 * پذیرش قطعی سفر توسط راننده (بخش ۰۶).
 * کنترل کامل سمت سرور انجام می‌شود تا یک سفر هرگز دوبار پذیرفته نشود.
 */
export const accept = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const user = await requireUser(ctx);
    const settings = await ensureSettings(ctx);
    if (user.accountType !== "driver" || user.driverStatus !== "approved") {
      throw new Error("فقط رانندگان تأییدشده می‌توانند سفر را بپذیرند.");
    }
    const trip = await loadTrip(ctx, tripId);
    const now = Date.now();

    if (trip.ownerId === user._id) throw new Error("نمی‌توانید سفر خودتان را بپذیرید.");
    if (trip.ownerRole !== "passenger") {
      throw new Error("برای این سفر باید درخواست ثبت کنید، نه پذیرش مستقیم.");
    }
    if (trip.status !== "open") {
      throw new Error("این سفر دیگر در وضعیت پذیرش نیست.");
    }
    if (effectiveTripStatus(trip, now, settings.tripExpiryMinutes) !== "open") {
      throw new Error("زمان حرکت این سفر گذشته و از فهرست فعال حذف شده است.");
    }
    if (trip.seatsBooked >= trip.seats) throw new Error("ظرفیت خودرو تکمیل است.");

    const acceptedAlready = await ctx.db
      .query("tripRequests")
      .withIndex("by_trip", (q) => q.eq("tripId", trip._id).eq("status", "accepted"))
      .first();
    if (acceptedAlready) {
      throw new Error("این سفر قبلاً توسط راننده دیگری پذیرفته شده است.");
    }

    const mineExisting = await ctx.db
      .query("tripRequests")
      .withIndex("by_trip", (q) => q.eq("tripId", trip._id))
      .collect();
    const mineRequest = mineExisting.find((r) => r.requesterId === user._id);
    if (mineRequest && (mineRequest.status === "pending" || mineRequest.status === "accepted")) {
      throw new Error("برای این سفر قبلاً درخواستی ثبت کرده‌اید.");
    }

    const blocked = await driverBlockReason(ctx, user._id, settings);
    if (blocked) throw new Error(blocked);

    const vehicle = await ctx.db
      .query("vehicles")
      .withIndex("by_driver", (q) => q.eq("driverId", user._id))
      .first();
    if (vehicle && trip.seats > vehicle.capacity) {
      throw new Error(`ظرفیت خودرو شما (${vehicle.capacity} صندلی) کافی نیست.`);
    }

    await ctx.db.insert("tripRequests", {
      tripId: trip._id,
      requesterId: user._id,
      requesterRole: "driver",
      seats: 1,
      status: "accepted",
      createdAt: now,
      respondedAt: now,
      respondedBy: user._id,
    });
    await ctx.db.patch(trip._id, {
      status: "accepted",
      driverId: user._id,
      acceptedAt: now,
      seatsBooked: trip.seatsBooked + 1,
      updatedAt: now,
    });

    await notify(ctx, {
      userId: trip.ownerId,
      kind: "trip_accepted",
      title: "درخواست سفر شما پذیرفته شد",
      body: `راننده‌ای سفر «${trip.origin.label} به ${trip.destination.label}» را پذیرفت.`,
      link: `/dashboard/trips/${trip._id}`,
    });
    await audit(ctx, {
      actorId: user._id,
      action: "trip_accepted",
      entity: "trips",
      entityId: trip._id,
      summary: `پذیرش سفر توسط راننده ${user.name ?? user.phone ?? user._id}`,
    });

    return { ok: true as const, tripId: trip._id };
  },
});

/** درخواست صندلی توسط مسافر روی سفر پیشنهادی راننده */
export const requestSeat = mutation({
  args: { tripId: v.id("trips"), seats: v.optional(v.number()) },
  handler: async (ctx, { tripId }) => {
    const user = await requireUser(ctx);
    const settings = await ensureSettings(ctx);
    if (user.accountType !== "passenger") {
      throw new Error("فقط مسافران می‌توانند درخواست سفر ثبت کنند.");
    }
    const trip = await loadTrip(ctx, tripId);
    const now = Date.now();

    if (trip.ownerId === user._id) throw new Error("این سفر خودتان است.");
    if (trip.ownerRole !== "driver") {
      throw new Error("این سفر منتظر پذیرش راننده است؛ از دکمه پذیرش استفاده کنید.");
    }
    const status = effectiveTripStatus(trip, now, settings.tripExpiryMinutes);
    if (status !== "open" && status !== "accepted") {
      throw new Error("این سفر فعال نیست و درخواست پذیرفته نمی‌شود.");
    }
    if (trip.seatsBooked >= trip.seats) throw new Error("ظرفیت این سفر تکمیل است.");

    const existing = await ctx.db
      .query("tripRequests")
      .withIndex("by_trip", (q) => q.eq("tripId", trip._id))
      .collect();
    const mine = existing.find((r) => r.requesterId === user._id);
    if (mine && mine.status === "pending") throw new Error("درخواست شما قبلاً ثبت شده است.");
    if (mine && mine.status === "accepted") throw new Error("شما در این سفر پذیرفته شده‌اید.");

    if (mine) {
      await ctx.db.delete(mine._id);
    }

    await ctx.db.insert("tripRequests", {
      tripId: trip._id,
      requesterId: user._id,
      requesterRole: "passenger",
      seats: 1,
      status: "pending",
      createdAt: now,
    });

    await notify(ctx, {
      userId: trip.ownerId,
      kind: "new_request",
      title: "درخواست جدید",
      body: `مسافری برای سفر «${trip.origin.label} به ${trip.destination.label}» درخواست ثبت کرد.`,
      link: `/dashboard/trips/${trip._id}`,
    });

    return { ok: true as const };
  },
});

/** پذیرش یا رد درخواست توسط مالک سفر */
export const respond = mutation({
  args: {
    requestId: v.id("tripRequests"),
    decision: v.union(v.literal("accept"), v.literal("reject")),
  },
  handler: async (ctx, { requestId, decision }) => {
    const user = await requireUser(ctx);
    const settings = await ensureSettings(ctx);
    const request = await ctx.db.get(requestId);
    if (!request) throw new Error("درخواست موردنظر یافت نشد.");
    const trip = await loadTrip(ctx, request.tripId);
    const now = Date.now();

    if (trip.ownerId !== user._id) throw new Error("فقط مالک سفر می‌تواند درخواست را بررسی کند.");
    if (request.status !== "pending") throw new Error("این درخواست قبلاً بررسی شده است.");
    if (request.requesterId === user._id) throw new Error("درخواست خودتان قابل بررسی نیست.");

    if (decision === "reject") {
      await ctx.db.patch(request._id, {
        status: "rejected",
        respondedAt: now,
        respondedBy: user._id,
      });
      await notify(ctx, {
        userId: request.requesterId,
        kind: "request_rejected",
        title: "درخواست شما رد شد",
        body: `درخواست شما برای سفر «${trip.origin.label} به ${trip.destination.label}» پذیرفته نشد.`,
        link: `/dashboard/trips/${trip._id}`,
      });
      await audit(ctx, {
        actorId: user._id,
        action: "request_rejected",
        entity: "tripRequests",
        entityId: request._id,
        summary: "رد درخواست سفر",
      });
      return { ok: true as const };
    }

    const status = effectiveTripStatus(trip, now, settings.tripExpiryMinutes);
    if (status !== "open" && status !== "accepted") {
      throw new Error("این سفر دیگر فعال نیست.");
    }
    if (trip.seatsBooked + request.seats > trip.seats) {
      throw new Error("ظرفیت خودرو با این درخواست نقض می‌شود.");
    }

    await ctx.db.patch(request._id, {
      status: "accepted",
      respondedAt: now,
      respondedBy: user._id,
    });
    await ctx.db.patch(trip._id, {
      status: "accepted",
      seatsBooked: trip.seatsBooked + request.seats,
      updatedAt: now,
    });

    await notify(ctx, {
      userId: request.requesterId,
      kind: "request_accepted",
      title: "درخواست شما پذیرفته شد",
      body: `درخواست شما برای سفر «${trip.origin.label} به ${trip.destination.label}» پذیرفته شد.`,
      link: `/dashboard/trips/${trip._id}`,
    });
    await audit(ctx, {
      actorId: user._id,
      action: "request_accepted",
      entity: "tripRequests",
      entityId: request._id,
      summary: "پذیرش درخواست مسافر",
    });

    return { ok: true as const };
  },
});

/** انصراف مسافر از درخواست خودش */
export const cancelRequest = mutation({
  args: { requestId: v.id("tripRequests") },
  handler: async (ctx, { requestId }) => {
    const user = await requireUser(ctx);
    const request = await ctx.db.get(requestId);
    if (!request) throw new Error("درخواست یافت نشد.");
    if (request.requesterId !== user._id) throw new Error("این درخواست متعلق به شما نیست.");
    if (request.status !== "pending") {
      throw new Error("برای پذیرفته‌شده‌ها از لغو سفر استفاده کنید.");
    }
    await ctx.db.patch(request._id, { status: "cancelled", respondedAt: Date.now() });
    const trip = await ctx.db.get(request.tripId);
    if (trip) {
      await notify(ctx, {
        userId: trip.ownerId,
        kind: "request_cancelled",
        title: "درخواستی لغو شد",
        body: "مسافری از درخواست خود انصراف داد.",
        link: `/dashboard/trips/${trip._id}`,
      });
    }
    return { ok: true as const };
  },
});

/** لغو سفر توسط مالک یا راننده پذیرفته‌شده */
export const cancelTrip = mutation({
  args: { tripId: v.id("trips"), reason: v.optional(v.string()) },
  handler: async (ctx, { tripId, reason }) => {
    const user = await requireUser(ctx);
    const trip = await loadTrip(ctx, tripId);
    const isOwner = trip.ownerId === user._id;
    const isDriver = trip.driverId === user._id;
    if (!isOwner && !isDriver) throw new Error("شما اجازه لغو این سفر را ندارید.");
    if (trip.status === "completed") throw new Error("سفر پایان‌یافته قابل لغو نیست.");
    if (trip.status === "in_progress") throw new Error("سفر در حال انجام است؛ ابتدا پایان سفر را ثبت کنید.");

    const now = Date.now();
    await ctx.db.patch(trip._id, {
      status: "cancelled",
      cancelledAt: now,
      cancelledBy: user._id,
      updatedAt: now,
    });

    const pending = await ctx.db
      .query("tripRequests")
      .withIndex("by_trip", (q) => q.eq("tripId", trip._id))
      .collect();
    for (const request of pending) {
      if (request.status === "pending" || request.status === "accepted") {
        await ctx.db.patch(request._id, {
          status: request.status === "accepted" && isDriver ? "rejected" : "cancelled",
          respondedAt: now,
        });
        if (request.requesterId !== user._id) {
          await notify(ctx, {
            userId: request.requesterId,
            kind: "trip_cancelled",
            title: "سفر لغو شد",
            body: `سفر «${trip.origin.label} به ${trip.destination.label}» لغوشده اعلام شد.`,
            link: `/dashboard/trips/${trip._id}`,
          });
        }
      }
    }

    if (isOwner && trip.driverId && trip.driverId !== user._id) {
      await notify(ctx, {
        userId: trip.driverId,
        kind: "trip_cancelled",
        title: "سفر لغو شد",
        body: `سفری که پذیرفته بودید توسط طرف مقابل لغو شد.${reason ? ` دلیل: ${reason}` : ""}`,
        link: `/dashboard/trips/${trip._id}`,
      });
    }

    await audit(ctx, {
      actorId: user._id,
      action: "trip_cancelled",
      entity: "trips",
      entityId: trip._id,
      summary: `لغو سفر${reason ? ` — ${reason}` : ""}`,
    });
    return { ok: true as const };
  },
});

async function assertDriverOfTrip(trip: Doc<"trips">, userId: Id<"users">) {
  if (trip.driverId !== userId) {
    throw new Error("فقط راننده این سفر می‌تواند وضعیت را تغییر دهد.");
  }
}

/** راننده به مبدأ رسید */
export const markArrived = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const user = await requireUser(ctx);
    const trip = await loadTrip(ctx, tripId);
    assertDriverOfTrip(trip, user._id);
    if (trip.status !== "accepted") throw new Error("وضعیت فعلی سفر اجازه این تغییر را نمی‌دهد.");
    const now = Date.now();
    await ctx.db.patch(trip._id, { status: "arrived", arrivedAt: now, updatedAt: now });
    await notify(ctx, {
      userId: trip.ownerId,
      kind: "driver_arrived",
      title: "راننده به مبدأ رسید",
      body: `راننده سفر «${trip.origin.label} به ${trip.destination.label}» به مبدأ رسید.`,
      link: `/dashboard/trips/${trip._id}`,
    });
    await audit(ctx, {
      actorId: user._id,
      action: "trip_arrived",
      entity: "trips",
      entityId: trip._id,
      summary: "اعلام رسیدن راننده به مبدأ",
    });
    return { ok: true as const };
  },
});

/** شروع سفر */
export const startTrip = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const user = await requireUser(ctx);
    const trip = await loadTrip(ctx, tripId);
    assertDriverOfTrip(trip, user._id);
    if (trip.status !== "arrived") throw new Error("راننده ابتدا باید به مبدأ رسیده باشد.");
    const now = Date.now();
    await ctx.db.patch(trip._id, { status: "in_progress", startedAt: now, updatedAt: now });
    await notify(ctx, {
      userId: trip.ownerId,
      kind: "trip_started",
      title: "سفر آغاز شد",
      body: `سفر «${trip.origin.label} به ${trip.destination.label}» در حال انجام است.`,
      link: `/dashboard/trips/${trip._id}`,
    });
    await audit(ctx, {
      actorId: user._id,
      action: "trip_started",
      entity: "trips",
      entityId: trip._id,
      summary: "شروع سفر",
    });
    return { ok: true as const };
  },
});

/**
 * پایان سفر + تسویه مالی (یک‌بار بیشتر انجام نمی‌شود).
 * تمام ارقام در پایگاه داده ثبت می‌شوند؛ موجودی صوری در رابط کاربری تغییر نمی‌کند.
 */
export const completeTrip = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const user = await requireUser(ctx);
    const trip = await loadTrip(ctx, tripId);
    assertDriverOfTrip(trip, user._id);
    if (trip.status !== "in_progress") {
      throw new Error("سفر هنوز شروع نشده است.");
    }
    if (trip.settled) throw new Error("این سفر قبلاً تسویه شده است.");

    const settings = await ensureSettings(ctx);
    const now = Date.now();
    const collected = trip.seatsBooked * trip.pricePerPassenger;
    const commissionBase = collected;

    const commission = computeCommission({
      driverShare: collected,
      fareTotal: commissionBase,
      cfg: {
        ...settings,
        commissionPercent: trip.commissionPercent,
        commissionFixed: trip.commissionFixed,
        commissionBasis: trip.commissionBasis,
        commissionPayer: trip.commissionPayer,
      },
    });

    const chargedToDriver =
      trip.commissionPayer === "driver" ? commission.commissionAmount : 0;

    await ctx.db.patch(trip._id, {
      status: "completed",
      completedAt: now,
      settled: true,
      settledAt: now,
      updatedAt: now,
      commissionAmount: commission.commissionAmount,
      driverShare: collected,
      driverNet: Math.max(0, collected - chargedToDriver),
    });

    const participants = new Set<string>([trip.ownerId.toString()]);
    if (trip.driverId) participants.add(trip.driverId.toString());
    const requests = await ctx.db
      .query("tripRequests")
      .withIndex("by_trip", (q) => q.eq("tripId", trip._id))
      .collect();
    for (const request of requests) {
      if (request.status === "accepted") participants.add(request.requesterId.toString());
    }

    if (collected > 0 && trip.driverId) {
      const driverId = trip.driverId;
      const wallet = await ensureWallet(ctx, driverId);

      await ctx.db.insert("transactions", {
        walletId: wallet._id,
        driverId,
        tripId: trip._id,
        type: "earning",
        amount: collected,
        affectsBalance: true,
        status: "confirmed",
        description: `درآمد ناخالص سفر ${trip.origin.label} به ${trip.destination.label}`,
        createdAt: now,
      });

      const nextBalance = wallet.balance + collected;
      const patch: Partial<Doc<"wallets">> = {
        balance: nextBalance,
        grossEarnings: wallet.grossEarnings + collected,
        netEarnings: wallet.netEarnings + Math.max(0, collected - chargedToDriver),
        updatedAt: now,
      };

      if (chargedToDriver > 0) {
        const canSettle =
          trip.commissionMethod === "wallet" && nextBalance >= chargedToDriver;

        if (canSettle) {
          patch.balance = nextBalance - chargedToDriver;
          patch.commissionPaid = wallet.commissionPaid + chargedToDriver;
          await ctx.db.insert("transactions", {
            walletId: wallet._id,
            driverId,
            tripId: trip._id,
            type: "commission",
            amount: -chargedToDriver,
            affectsBalance: true,
            status: "confirmed",
            description: `کمیسیون سفریار (${trip.commissionPercent}٪) از کیف پول کسر شد`,
            createdAt: now,
          });
          await ctx.db.insert("payments", {
            payerId: driverId,
            tripId: trip._id,
            kind: "commission",
            amount: chargedToDriver,
            provider: "wallet",
            status: "confirmed",
            idempotencyKey: `commission:trip:${trip._id}`,
            createdAt: now,
            confirmedAt: now,
          });
        } else {
          patch.commissionUnpaid = wallet.commissionUnpaid + chargedToDriver;
          patch.debt = wallet.debt + chargedToDriver;
          patch.status = "debt";
          await ctx.db.insert("transactions", {
            walletId: wallet._id,
            driverId,
            tripId: trip._id,
            type: "commission_due",
            amount: chargedToDriver,
            affectsBalance: false,
            status: "pending",
            description:
              trip.commissionMethod === "wallet"
                ? `کمیسیون سفریار ثبت شد (موجودی کیف پول کافی نیست)`
                : `کمیسیون سفریار ثبت شد (${trip.commissionMethod === "gateway" ? "پرداخت از طریق درگاه" : trip.commissionMethod === "periodic" ? "تسویه دوره‌ای" : "ثبت بدهی"})`,
            createdAt: now,
          });
          if (trip.commissionMethod === "wallet") {
            await ctx.db.insert("payments", {
              payerId: driverId,
              tripId: trip._id,
              kind: "commission",
              amount: chargedToDriver,
              provider: "wallet",
              status: "failed",
              idempotencyKey: `commission:trip:${trip._id}`,
              failureReason: "موجودی کیف پول برای کسر کمیسیون کافی نیست",
              createdAt: now,
            });
          }
        }
      }

      await ctx.db.patch(wallet._id, patch);
      if (patch.status === "debt") {
        await notify(ctx, {
          userId: driverId,
          kind: "commission_due",
          title: "ثبت کمیسیون",
          body: `${chargedToDriver.toLocaleString("fa-IR")} تومان کمیسیون برای این سفر ثبت شد.`,
          link: "/dashboard/wallet",
        });
      } else if (chargedToDriver > 0) {
        await notify(ctx, {
          userId: driverId,
          kind: "commission_paid",
          title: "کمیسیون کسر شد",
          body: `${chargedToDriver.toLocaleString("fa-IR")} تومان کمیسیون از کیف پول شما کسر شد.`,
          link: "/dashboard/wallet",
        });
      }
    }

    for (const id of participants) {
      if (id === trip.driverId?.toString()) continue;
      await notify(ctx, {
        userId: id as Id<"users">,
        kind: "trip_completed",
        title: "پایان سفر",
        body: `سفر «${trip.origin.label} به ${trip.destination.label}» پایان یافت. رسید شما در صفحه سفر موجود است.`,
        link: `/dashboard/trips/${trip._id}`,
      });
    }

    await audit(ctx, {
      actorId: user._id,
      action: "trip_completed",
      entity: "trips",
      entityId: trip._id,
      summary: `پایان سفر و تسویه: وصول ${collected.toLocaleString("fa-IR")} تومان، کمیسیون ${commission.commissionAmount.toLocaleString("fa-IR")} تومان`,
    });

    return { ok: true as const, collected, commission: commission.commissionAmount };
  },
});

/** امتیازدهی پس از سفر */
export const rate = mutation({
  args: {
    tripId: v.id("trips"),
    rating: v.number(),
    review: v.optional(v.string()),
  },
  handler: async (ctx, { tripId, rating, review }) => {
    const user = await requireUser(ctx);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      throw new Error("امتیاز باید بین ۱ تا ۵ باشد.");
    }
    const trip = await loadTrip(ctx, tripId);
    if (trip.status !== "completed") throw new Error("فقط پس از پایان سفر می‌توان امتیاز داد.");

    const requests = await ctx.db
      .query("tripRequests")
      .withIndex("by_trip", (q) => q.eq("tripId", trip._id))
      .collect();
    const isAcceptedPassenger = requests.some(
      (r) => r.requesterId === user._id && r.status === "accepted",
    );
    const allowed =
      (trip.ownerRole === "passenger" && trip.ownerId === user._id) ||
      (trip.ownerRole === "driver" && isAcceptedPassenger);
    if (!allowed) throw new Error("شما از شرکت‌کنندگان این سفر نیستید.");
    if (trip.rating) throw new Error("برای این سفر امتیاز ثبت شده است.");

    await ctx.db.patch(trip._id, {
      rating: Math.round(rating),
      review: review?.trim() || undefined,
      updatedAt: Date.now(),
    });

    if (trip.driverId) {
      const driver = await ctx.db.get(trip.driverId);
      if (driver) {
        const count = driver.ratingCount ?? 0;
        const previous = driver.defaultRating ?? 0;
        const nextCount = count + 1;
        const nextRating = Math.round(((previous * count + rating) / nextCount) * 10) / 10;
        await ctx.db.patch(trip.driverId, {
          defaultRating: nextRating,
          ratingCount: nextCount,
        });
      }
    }

    await audit(ctx, {
      actorId: user._id,
      action: "trip_rated",
      entity: "trips",
      entityId: trip._id,
      summary: `امتیاز ${Math.round(rating)} از ۵`,
    });
    return { ok: true as const };
  },
});