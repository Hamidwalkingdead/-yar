import { toast } from "sonner";

/**
 * قالب‌بندی فارسی سفریار: قیمت به تومان، تاریخ و ساعت بر اساس منطقه زمانی سفر،
 * و نمایش ارقام فارسی.
 */

export const DEFAULT_TIMEZONE = "Asia/Tehran";

export function faNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat("fa-IR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** مبلغ به تومان + واژه تومان */
export function toman(value: number): string {
  return `${faNumber(Math.round(value))} تومان`;
}

/** فقط رقم‌های فارسی بدون جداکننده (برای فیلدهای کوچک) */
export function faDigits(value: number | string): string {
  return typeof value === "number" ? faNumber(value) : toFaDigits(value);
}

/** تبدیل همه رقم‌های یک رشته به فارسی — برای شماره، کد و ارقام درون متن */
export function toFaDigits(value: string): string {
  return value.replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

export function faDate(
  ts: number,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
  timezone = DEFAULT_TIMEZONE,
): string {
  return new Intl.DateTimeFormat("fa-IR", { ...options, timeZone: timezone }).format(
    new Date(ts),
  );
}

export function faTime(ts: number, timezone = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat("fa-IR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(ts));
}

export function faDateTime(ts: number, timezone = DEFAULT_TIMEZONE): string {
  return `${faDate(ts, { dateStyle: "medium" }, timezone)} ساعت ${faTime(ts, timezone)}`;
}

export function faWeekday(ts: number, timezone = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat("fa-IR", { weekday: "long", timeZone: timezone }).format(
    new Date(ts),
  );
}

/** «۵ دقیقه پیش» / «۲ ساعت پیش» */
export function faRelative(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "همین حالا";
  if (minutes < 60) return `${faNumber(minutes)} دقیقه پیش`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${faNumber(hours)} ساعت پیش`;
  const days = Math.floor(hours / 24);
  return `${faNumber(days)} روز پیش`;
}

export function faDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours === 0) return `${faNumber(rest)} دقیقه`;
  if (rest === 0) return `${faNumber(hours)} ساعت`;
  return `${faNumber(hours)} ساعت و ${faNumber(rest)} دقیقه`;
}

export function faKm(km: number): string {
  return `${faNumber(km, km < 10 ? 1 : 0)} کیلومتر`;
}

/** مقدار ورودی عددی شمسی/لاتین → میلادی برای فیلد زمان */
export function localInputValue(ts: number, timezone = DEFAULT_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ts));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** تبدیل مقدار فیلد datetime-local به رمز میلادی unix، در منطقه زمانی سفر */
export function parseLocalInput(value: string, timezone = DEFAULT_TIMEZONE): number | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match;
  const naiveUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  // offset از منطقه زمانی هدف در همان لحظه
  const offset = tzOffsetMs(new Date(naiveUtc), timezone);
  return naiveUtc - offset;
}

function tzOffsetMs(date: Date, timezone: string): number {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const parts = dtf.formatToParts(date);
    const map: Record<string, string> = {};
    for (const p of parts) map[p.type] = p.value;
    const asUtc = Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      Number(map.hour) % 24,
      Number(map.minute),
      Number(map.second),
    );
    return asUtc - date.getTime();
  } catch {
    return 0;
  }
}

/** نرمال‌سازی شماره موبایل ایران به فرمت 09xxxxxxxxx */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "").replace(/^\+98/, "0").replace(/^98/, "0");
  const normalized = digits.replace(/\D/g, "");
  if (/^09\d{9}$/.test(normalized)) return normalized;
  if (/^9\d{9}$/.test(normalized)) return `0${normalized}`;
  return null;
}

export function maskPhone(phone: string): string {
  if (phone.length < 7) return phone;
  return `${phone.slice(0, 4)}•••${phone.slice(-3)}`;
}

/** نمایش خطای سرور بدون تُن فنی */
export function errorText(error: unknown, fallback = "خطایی رخ داد؛ دوباره تلاش کنید."): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return fallback;
}

export function notifyError(error: unknown, fallback?: string): void {
  toast.error(errorText(error, fallback));
}

export function notifySuccess(message: string, description?: string): void {
  toast.success(message, description ? { description } : undefined);
}
