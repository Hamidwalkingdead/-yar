import { v } from "convex/values";
import {
  commissionMethodValidator,
  locationValidator,
  tripConditionValidator,
} from "../schema";
import type { QuoteResult } from "./quote";

export const locationArg = locationValidator;

export const conditionSourcesValidator = v.object({
  night: v.union(v.literal("time_rule"), v.literal("none")),
  weather: v.union(v.literal("open_meteo"), v.literal("unavailable")),
  mountain: v.union(v.literal("open_meteo_elevation"), v.literal("unavailable")),
});

export const commissionBasisValidator = v.union(
  v.literal("fare_total"),
  v.literal("driver_share"),
);
export const commissionPayerValidator = v.union(
  v.literal("driver"),
  v.literal("platform"),
);

export const quotePayloadValidator = v.object({
  distanceKm: v.number(),
  durationMin: v.number(),
  route: v.array(v.number()),
  routeProvider: v.string(),
  conditions: v.array(tripConditionValidator),
  conditionSources: conditionSourcesValidator,
  baseRatePerKm: v.number(),
  surchargePerKm: v.number(),
  ratePerKm: v.number(),
  priceTotal: v.number(),
  pricePerPassenger: v.number(),
  commissionPercent: v.number(),
  commissionFixed: v.number(),
  commissionAmount: v.number(),
  commissionBasis: commissionBasisValidator,
  commissionPayer: commissionPayerValidator,
  commissionMethod: commissionMethodValidator,
  driverShare: v.number(),
  driverNet: v.number(),
});

export type QuotePayload = {
  [K in keyof Omit<QuoteResult, "breakdown" | "weather" | "elevation" | "warnings">]: QuoteResult[K];
};

export function toQuotePayload(quote: QuoteResult): QuotePayload {
  return {
    distanceKm: quote.distanceKm,
    durationMin: quote.durationMin,
    route: quote.route,
    routeProvider: quote.routeProvider,
    conditions: quote.conditions,
    conditionSources: quote.conditionSources,
    baseRatePerKm: quote.baseRatePerKm,
    surchargePerKm: quote.surchargePerKm,
    ratePerKm: quote.ratePerKm,
    priceTotal: quote.priceTotal,
    pricePerPassenger: quote.pricePerPassenger,
    commissionPercent: quote.commissionPercent,
    commissionFixed: quote.commissionFixed,
    commissionAmount: quote.commissionAmount,
    commissionBasis: quote.commissionBasis,
    commissionPayer: quote.commissionPayer,
    commissionMethod: quote.commissionMethod,
    driverShare: quote.driverShare,
    driverNet: quote.driverNet,
  };
}