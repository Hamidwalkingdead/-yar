"use node";

import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { buildQuote } from "./lib/quote";
import { locationArg, toQuotePayload } from "./lib/validators";

/**
 * ثبت سفر (بخش ۰۶).
 *
 * قیمت، مسافت و کمیسیون همگی سمت سرور و از روی مسیر واقعی محاسبه می‌شوند؛
 * بنابراین هیچ مقداری از سمت کلاینت برای ارقام مالی پذیرفته نمی‌شود.
 */
export const create = action({
  args: {
    ownerRole: v.union(v.literal("passenger"), v.literal("driver")),
    origin: locationArg,
    destination: locationArg,
    departureAt: v.number(),
    seats: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(api.users.currentUser, {});
    if (!user) throw new Error("ابتدا وارد حساب خود شوید.");
    if (user.active === false) throw new Error("حساب شما غیرفعال است.");

    const seats = Math.floor(args.seats);
    if (!Number.isFinite(seats) || seats < 1 || seats > 8) {
      throw new Error("تعداد صندلی باید بین ۱ تا ۸ باشد.");
    }
    if (args.ownerRole === "passenger" && seats !== 1) {
      throw new Error("درخواست سفر مسافر فقط برای یک صندلی ثبت می‌شود.");
    }
    if (args.departureAt < Date.now() - 60_000) {
      throw new Error("زمان حرکت نمی‌تواند در گذشته باشد.");
    }
    if (args.origin.label.trim().length < 3 || args.destination.label.trim().length < 3) {
      throw new Error("مبدأ و مقصد را به‌درستی انتخاب کنید.");
    }
    if (args.origin.lat === args.destination.lat && args.origin.lng === args.destination.lng) {
      throw new Error("مبدأ و مقصد نمی‌توانند یکسان باشند.");
    }

    if (args.ownerRole === "driver") {
      if (user.accountType !== "driver" || user.driverStatus !== "approved") {
        throw new Error(
          "فقط رانندگانی که مدارکشان تأیید شده می‌توانند سفر ثبت کنند.",
        );
      }
    } else if (user.accountType === "driver") {
      throw new Error(
        "شما به‌عنوان راننده ثبت‌نام کرده‌اید؛ برای درخواست سفر از حساب مسافر استفاده کنید.",
      );
    }

    const settings = await ctx.runQuery(api.settings.get, {});
    const quote = await buildQuote(settings, {
      origin: { ...args.origin },
      destination: { ...args.destination },
      departureAt: args.departureAt,
      seats,
    });

    const tripId: Id<"trips"> = await ctx.runMutation(internal.trips.insert, {
      userId: user._id,
      ownerRole: args.ownerRole,
      origin: args.origin,
      destination: args.destination,
      departureAt: args.departureAt,
      seats,
      note: args.note,
      quote: toQuotePayload(quote),
    });

    return { tripId, quote };
  },
});