import type { TripCondition } from "../schema";
import {
  fetchElevation,
  fetchWeather,
  routeDriving,
  type LatLng,
} from "./geo";
import {
  CONDITION_LABELS,
  computeCommission,
  computeFare,
  isNightDeparture,
  type PricingConfig,
} from "./pricing";

export interface QuoteInput {
  origin: LatLng & { label: string };
  destination: LatLng & { label: string };
  departureAt: number;
  seats: number;
}

export interface QuoteConditionSources {
  night: "time_rule" | "none";
  weather: "open_meteo" | "unavailable";
  mountain: "open_meteo_elevation" | "unavailable";
}

export interface QuoteResult {
  distanceKm: number;
  durationMin: number;
  route: number[];
  routeProvider: string;
  conditions: TripCondition[];
  conditionSources: QuoteConditionSources;
  baseRatePerKm: number;
  surchargePerKm: number;
  ratePerKm: number;
  priceTotal: number;
  pricePerPassenger: number;
  breakdown: { condition: TripCondition | "base"; label: string; amountPerKm: number }[];
  commissionPercent: number;
  commissionFixed: number;
  commissionAmount: number;
  commissionBasis: "fare_total" | "driver_share";
  commissionPayer: "driver" | "platform";
  commissionMethod: "wallet" | "gateway" | "periodic" | "debt";
  driverShare: number;
  driverNet: number;
  weather: { precipitationMm: number; snowfallMm: number } | null;
  elevation: { minM: number; maxM: number; ascentM: number } | null;
  warnings: string[];
}

/**
 * ساخت پیش‌نمایش قیمت: مسیر واقعی → شرایط سفر از منابع معتبر → قیمت → کمیسیون.
 * اگر داده‌ای از منبع معتبر در دسترس نباشد، شرط اعمال نشده و هشدار ثبت می‌شود؛
 * سامانه هرگز شرایط را حدس نمی‌زند.
 */
export async function buildQuote(
  settings: PricingConfig & { timezone: string; mapProvider?: string },
  input: QuoteInput,
): Promise<QuoteResult> {
  const warnings: string[] = [];

  const route = await routeDriving(
    { lat: input.origin.lat, lng: input.origin.lng },
    { lat: input.destination.lat, lng: input.destination.lng },
    settings.mapProvider,
  );

  const conditions: TripCondition[] = [];
  const sources: QuoteConditionSources = {
    night: "none",
    weather: "unavailable",
    mountain: "unavailable",
  };

  // ۱) شب: قاعده زمانی شفاف بر اساس ساعت حرکت در منطقه زمانی سفر
  if (isNightDeparture(input.departureAt, settings, settings.timezone)) {
    conditions.push("night");
    sources.night = "time_rule";
  }

  // ۲) آب‌وهوا: فقط از منبع معتبر
  const weather = await fetchWeather(
    { lat: input.origin.lat, lng: input.origin.lng },
    input.departureAt,
  );
  if (weather) {
    sources.weather = "open_meteo";
    if (weather.snowfallMm >= 0.2) conditions.push("snow");
    else if (weather.precipitationMm >= 0.2) conditions.push("rain");
  } else {
    warnings.push(
      "داده آب‌وهوا برای این تاریخ از منبع معتبر در دسترس نبود؛ شرط بارندگی یا برف اعمال نشد.",
    );
  }

  // ۳) مسیر کوهستانی: فقط بر اساس ارتفاع واقعی مسیر
  const elevation = await fetchElevation(route.geometry);
  if (elevation) {
    sources.mountain = "open_meteo_elevation";
    if (elevation.ascentM >= settings.mountainGainM) conditions.push("mountain");
  } else {
    warnings.push(
      "داده ارتفاع مسیر از منبع معتبر در دسترس نبود؛ شرط مسیر کوهستانی اعمال نشد.",
    );
  }

  const fare = computeFare(route.distanceKm, conditions, settings);
  const seats = Math.max(1, Math.floor(input.seats));
  const pricePerPassenger = fare.pricePerPassenger(seats);
  const commission = computeCommission({
    driverShare: fare.priceTotal,
    fareTotal: fare.priceTotal,
    cfg: settings,
  });

  return {
    distanceKm: route.distanceKm,
    durationMin: route.durationMin,
    route: route.geometry,
    routeProvider: route.provider,
    conditions,
    conditionSources: sources,
    baseRatePerKm: fare.baseRatePerKm,
    surchargePerKm: fare.surchargePerKm,
    ratePerKm: fare.ratePerKm,
    priceTotal: fare.priceTotal,
    pricePerPassenger,
    breakdown: fare.breakdown,
    commissionPercent: settings.commissionPercent,
    commissionFixed: settings.commissionFixed,
    commissionAmount: commission.commissionAmount,
    commissionBasis: settings.commissionBasis,
    commissionPayer: settings.commissionPayer,
    commissionMethod: settings.commissionMethod,
    driverShare: commission.driverShare,
    driverNet: commission.driverNet,
    weather: weather
      ? {
          precipitationMm: weather.precipitationMm,
          snowfallMm: weather.snowfallMm,
        }
      : null,
    elevation: elevation
      ? { minM: elevation.minM, maxM: elevation.maxM, ascentM: elevation.ascentM }
      : null,
    warnings,
  };
}

export function conditionSummary(conditions: TripCondition[]): string {
  if (conditions.length === 0) return "روز عادی";
  return conditions.map((c) => CONDITION_LABELS[c]).join("، ");
}