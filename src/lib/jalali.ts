import { DEFAULT_TIMEZONE, localInputValue, parseLocalInput, toFaDigits } from "./fa";

/**
 * تبدیل تقویم میلادی به شمسی و برعکس، بدون وابستگی به کتابخانهٔ جانبی.
 *
 * روش کار: همهٔ محاسبات روی «روز میلادی ژولیانی» (JDN) انجام می‌شود؛
 * یعنی هر تاریخی یک عدد صحیح است و تبدیل‌ها فقط جمع و تفریق‌اند.
 *
 * - سال شمسی: ۳۶۵ روز و در سال کبیسه ۳۶۶ روز.
 * - سال کبیسه: موقعیت‌های ۱، ۵، ۹، ۱۳، ۱۷، ۲۲، ۲۶ و ۳۰ در چرخهٔ ۳۳ ساله
 *   (۸ کبیسه در هر ۳۳ سال) — همان قاعده‌ای که گاه‌شماری رسمی ایران به کار می‌برد.
 * - لنگر: ۱ فروردین ۱۴۰۳ = ۲۰ مارس ۲۰۲۴ میلادی.
 *
 * درستی محاسبات با تقویم استاندارد مرورگر (`Intl` با تقویم persian) سنجیده شده است.
 */

export interface JalaliParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export const JALALI_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
] as const;

/** چیدمان کبیسه‌ها در چرخهٔ ۳۳ ساله */
const LEAP_POSITIONS = new Set([1, 5, 9, 13, 17, 22, 26, 30]);

const ANCHOR_YEAR = 1403;
const ANCHOR_JDN = gregorianToJdn(2024, 3, 20); // ۱ فروردین ۱۴۰۳

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** تاریخ میلادی → شمارهٔ روز ژولیانی */
function gregorianToJdn(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

/** شمارهٔ روز ژولیانی → تاریخ میلادی */
function jdnToGregorian(jdn: number): { year: number; month: number; day: number } {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return {
    day: e - Math.floor((153 * m + 2) / 5) + 1,
    month: m + 3 - 12 * Math.floor(m / 10),
    year: 100 * b + d - 4800 + Math.floor(m / 10),
  };
}

export function isJalaliLeap(year: number): boolean {
  return LEAP_POSITIONS.has(((year % 33) + 33) % 33);
}

function jalaliYearLength(year: number): number {
  return 365 + (isJalaliLeap(year) ? 1 : 0);
}

/** تعداد روزهای ماه (ماه‌های ۱ تا ۶ برابر ۳۱، ۷ تا ۱۱ برابر ۳۰، اسفند ۲۹ یا ۳۰) */
export function jalaliMonthLength(year: number, month: number): number {
  if (month <= 6) return 31;
  if (month <= 11) return 30;
  return isJalaliLeap(year) ? 30 : 29;
}

function jalaliToJdn(year: number, month: number, day: number): number {
  let jdn = ANCHOR_JDN;
  if (year >= ANCHOR_YEAR) {
    for (let y = ANCHOR_YEAR; y < year; y++) jdn += jalaliYearLength(y);
  } else {
    for (let y = ANCHOR_YEAR - 1; y >= year; y--) jdn -= jalaliYearLength(y);
  }
  const dayOfYear = month <= 6 ? (month - 1) * 31 + day : 186 + (month - 7) * 30 + day;
  return jdn + dayOfYear - 1;
}

function jdnToJalali(jdn: number): { year: number; month: number; day: number } {
  let offset = jdn - ANCHOR_JDN;
  let year = ANCHOR_YEAR;
  while (offset >= jalaliYearLength(year)) {
    offset -= jalaliYearLength(year);
    year += 1;
  }
  while (offset < 0) {
    year -= 1;
    offset += jalaliYearLength(year);
  }
  const dayOfYear = offset + 1;
  const month = dayOfYear <= 186 ? Math.ceil(dayOfYear / 31) : 7 + Math.floor((dayOfYear - 187) / 30);
  const day =
    dayOfYear <= 186 ? dayOfYear - (month - 1) * 31 : dayOfYear - 186 - (month - 7) * 30;
  return { year, month, day };
}

/** زمان میلادی → اجزای شمسی (تاریخ و ساعت در منطقه زمانی سفر) */
export function jalaliFromTimestamp(
  ts: number,
  timezone: string = DEFAULT_TIMEZONE,
): JalaliParts {
  const [datePart, timePart] = localInputValue(ts, timezone).split("T");
  const [gy, gm, gd] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  const jalali = jdnToJalali(gregorianToJdn(gy, gm, gd));
  return { year: jalali.year, month: jalali.month, day: jalali.day, hour: hh % 24, minute: mm };
}

/** اجزای شمسی → زمان میلادی (unix میلی‌ثانیه) */
export function timestampFromJalali(
  parts: JalaliParts,
  timezone: string = DEFAULT_TIMEZONE,
): number {
  const gregorian = jdnToGregorian(jalaliToJdn(parts.year, parts.month, parts.day));
  const value = `${gregorian.year}-${pad2(gregorian.month)}-${pad2(gregorian.day)}T${pad2(parts.hour)}:${pad2(parts.minute)}`;
  return parseLocalInput(value, timezone) ?? Date.now();
}

/** تاریخ شمسی با ارقام فارسی: «۱۴۰۳/۰۸/۰۴» */
export function formatJalaliDate(ts: number, timezone: string = DEFAULT_TIMEZONE): string {
  const p = jalaliFromTimestamp(ts, timezone);
  return toFaDigits(`${p.year}/${pad2(p.month)}/${pad2(p.day)}`);
}

/** نام ماه شمسی */
export function jalaliMonthName(month: number): string {
  return JALALI_MONTHS[month - 1] ?? "";
}

/** امروز شمسی بر اساس منطقه زمانی سفر */
export function jalaliToday(timezone: string = DEFAULT_TIMEZONE): JalaliParts {
  return jalaliFromTimestamp(Date.now(), timezone);
}
