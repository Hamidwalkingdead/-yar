"use node";

import { v } from "convex/values";
import { api } from "./_generated/api";
import { action } from "./_generated/server";
import { geocode, reverseGeocode } from "./lib/geo";
import { buildQuote } from "./lib/quote";
import { locationArg } from "./lib/validators";

/**
 * سرویس‌های نقشه و مسیریابی (بخش ۰۵).
 * تمام فراخوانی‌ها سمت سرور انجام می‌شوند تا هم مسافت از مسیر واقعی جاده‌ای
 * تأیید شود و هم وابستگی به سرویس خارجی قابل تعویض بماند.
 */

/** جست‌وجوی آدرس (Nominatim / OpenStreetMap) */
export const searchAddress = action({
  args: { query: v.string() },
  handler: async (_ctx, { query }) => {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      throw new Error("برای جست‌وجوی آدرس حداقل ۳ حرف وارد کنید.");
    }
    try {
      const results = await geocode(trimmed);
      if (results.length === 0) {
        return { results: [], warning: "آدرسی با این عبارت یافت نشد." };
      }
      return { results, warning: null as string | null };
    } catch (error) {
      throw new Error(
        `سرویس جست‌وجوی آدرس در دسترس نیست: ${error instanceof Error ? error.message : "خطای ناشناخته"}`,
      );
    }
  },
});

/** تبدیل نقطه انتخابی روی نقشه به آدرس */
export const reverseLookup = action({
  args: { lat: v.number(), lng: v.number() },
  handler: async (_ctx, args) => {
    const result = await reverseGeocode(args);
    return { result };
  },
});

/**
 * پیش‌نمایش قیمت: مسافت واقعی مسیر + شرایط معتبر + نرخ پایه + کمیسیون.
 * قیمت نهایی هنگام ثبت سفر دوباره و سمت سرور محاسبه می‌شود.
 */
export const quote = action({
  args: {
    origin: locationArg,
    destination: locationArg,
    departureAt: v.number(),
    seats: v.number(),
  },
  handler: async (ctx, args) => {
    const settings = await ctx.runQuery(api.settings.get, {});
    try {
      const quote = await buildQuote(settings, {
        origin: args.origin,
        destination: args.destination,
        departureAt: args.departureAt,
        seats: args.seats,
      });
      return { quote, error: null as string | null };
    } catch (error) {
      return {
        quote: null,
        error:
          error instanceof Error
            ? error.message
            : "محاسبه مسیر ناموفق بود؛ دوباره تلاش کنید.",
      };
    }
  },
});