import type { TripCondition } from "../schema";

/**
 * موتور قیمت‌گذاری سفریار (بخش ۰۷) و کمیسیون (بخش ۰۸).
 *
 * نرخ پایه هر کیلومتر + مجموع افزایش شرایط سفر = نرخ نهایی هر کیلومتر
 * قیمت کل = مسافت واقعی مسیر × نرخ نهایی هر کیلومتر
 *
 * تمام توابع این فایل خالص هستند و به شبکه یا پایگاه داده دسترسی ندارند؛
 * ورودی‌ها همیشه از تنظیمات ذخیره‌شده در پایگاه داده می‌آیند.
 */

export interface PricingConfig {
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
}

/** ساعت محلی (منطقه زمانی سفر) */
export function hourInTimezone(at: number, timezone: string): number {
  try {
    const formatted = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    }).format(new Date(at));
    const hour = Number(formatted);
    return Number.isFinite(hour) ? hour % 24 : new Date(at).getUTCHours();
  } catch {
    return new Date(at).getUTCHours();
  }
}

/** آیا ساعت حرکت در بازه شب قرار می‌گیرد؟ (قاعده زمانی، نه حدس) */
export function isNightDeparture(
  departureAt: number,
  cfg: PricingConfig,
  timezone = "Asia/Tehran",
): boolean {
  const hour = hourInTimezone(departureAt, timezone);
  const start = cfg.nightStartHour;
  const end = cfg.nightEndHour;
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

/** افزایش نرخ هر کیلومتر برای یک شرط */
export function surchargeFor(condition: TripCondition, cfg: PricingConfig): number {
  switch (condition) {
    case "night":
      return cfg.surchargeNight;
    case "rain":
      return cfg.surchargeRain;
    case "snow":
      return cfg.surchargeSnow;
    case "mountain":
      return cfg.surchargeMountain;
  }
}

export interface FareBreakdownLine {
  condition: TripCondition | "base";
  label: string;
  amountPerKm: number;
}

export interface FareResult {
  baseRatePerKm: number;
  surchargePerKm: number;
  ratePerKm: number;
  priceTotal: number;
  pricePerPassenger: (seats: number) => number;
  breakdown: FareBreakdownLine[];
}

export const CONDITION_LABELS: Record<TripCondition, string> = {
  night: "شب",
  rain: "بارندگی",
  snow: "برف",
  mountain: "مسیر کوهستانی",
};

/** محاسبه قیمت کل سفر از مسافت واقعی مسیر */
export function computeFare(
  distanceKm: number,
  conditions: TripCondition[],
  cfg: PricingConfig,
): FareResult {
  const unique = Array.from(new Set(conditions));
  const surchargePerKm = unique.reduce((sum, c) => sum + surchargeFor(c, cfg), 0);
  const ratePerKm = cfg.baseRatePerKm + surchargePerKm;
  const priceTotal = Math.round(distanceKm * ratePerKm);

  const breakdown: FareBreakdownLine[] = [
    {
      condition: "base",
      label: "نرخ پایه هر کیلومتر",
      amountPerKm: cfg.baseRatePerKm,
    },
    ...unique.map((c) => ({
      condition: c,
      label: `افزایش ${CONDITION_LABELS[c]}`,
      amountPerKm: surchargeFor(c, cfg),
    })),
  ];

  return {
    baseRatePerKm: cfg.baseRatePerKm,
    surchargePerKm,
    ratePerKm,
    priceTotal,
    pricePerPassenger: (seats: number) =>
      Math.round(priceTotal / Math.max(1, seats)),
    breakdown,
  };
}

export interface CommissionResult {
  commissionAmount: number;
  driverShare: number;
  driverNet: number;
}

/**
 * کمیسیون = مبلغ مشمول × درصد ÷ ۱۰۰ (+ مبلغ ثابت)
 * درآمد خالص راننده = مبلغ متعلق به راننده − کمیسیون راننده
 */
export function computeCommission(opts: {
  driverShare: number;
  fareTotal: number;
  cfg: PricingConfig;
}): CommissionResult {
  const { driverShare, fareTotal, cfg } = opts;
  const basisAmount = cfg.commissionBasis === "fare_total" ? fareTotal : driverShare;
  const percentPart = (basisAmount * cfg.commissionPercent) / 100;
  const total = Math.max(0, Math.round(percentPart + cfg.commissionFixed));
  const chargedToDriver = cfg.commissionPayer === "driver" ? total : 0;
  return {
    commissionAmount: total,
    driverShare,
    driverNet: Math.max(0, driverShare - chargedToDriver),
  };
}

/** گردکردن مبالغ به تومان کامل */
export function toToman(value: number): number {
  return Math.round(value);
}
