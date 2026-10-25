import { faDate, faDigits, faTime, faWeekday } from "@/lib/fa";
import {
  JALALI_MONTHS,
  jalaliFromTimestamp,
  jalaliMonthLength,
  timestampFromJalali,
  type JalaliParts,
} from "@/lib/jalali";
import { cn } from "@/lib/utils";

/**
 * انتخاب‌گر تاریخ و ساعت شمسی (جایگزین فیلد میلادی datetime-local).
 *
 * وضعیت همیشه یک زمان میلادی (unix) است؛ فقط نمایش و انتخاب به شمسی انجام می‌شود
 * تا ذخیره‌سازی سفر و محاسبه قیمت دست‌نخورده بماند.
 */
export function JalaliDateTime({
  value,
  onChange,
  label = "زمان حرکت",
  minYearOffset = -1,
  maxYearOffset = 3,
  className,
}: {
  value: number;
  onChange: (timestamp: number) => void;
  label?: string;
  /** محدوده سال‌ها نسبت به امسال */
  minYearOffset?: number;
  maxYearOffset?: number;
  className?: string;
}) {
  const parts = jalaliFromTimestamp(value);
  const today = jalaliFromTimestamp(Date.now());
  const years: number[] = [];
  for (let y = today.year + minYearOffset; y <= today.year + maxYearOffset; y++) years.push(y);

  const maxDay = jalaliMonthLength(parts.year, parts.month);
  const day = Math.min(parts.day, maxDay);
  // دقیقه‌ها با ۵ دقیقه گام برمی‌دارند؛ مقدار ناهماهنگ به نزدیک‌ترین گام نزدیک می‌شود
  const minute = Math.floor(parts.minute / 5) * 5;

  const update = (patch: Partial<JalaliParts>) => {
    const next: JalaliParts = { ...parts, ...patch };
    const nextMax = jalaliMonthLength(next.year, next.month);
    if (next.day > nextMax) next.day = nextMax;
    onChange(timestampFromJalali(next));
  };

  const selectClass = (grow = "") =>
    cn(
      "h-9 cursor-pointer rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
      grow,
    );

  const items: {
    key: string;
    label: string;
    value: number;
    options: { value: number; text: string }[];
    onChange: (next: number) => void;
  }[] = [
    {
      key: "day",
      label: "روز",
      value: day,
      options: Array.from({ length: maxDay }, (_, i) => ({
        value: i + 1,
        text: faDigits(i + 1),
      })),
      onChange: (next) => update({ day: next }),
    },
    {
      key: "month",
      label: "ماه",
      value: parts.month,
      options: JALALI_MONTHS.map((name, i) => ({ value: i + 1, text: name })),
      onChange: (next) => update({ month: next }),
    },
    {
      key: "year",
      label: "سال",
      value: parts.year,
      options: years.map((y) => ({ value: y, text: faDigits(y) })),
      onChange: (next) => update({ year: next }),
    },
    {
      key: "hour",
      label: "ساعت",
      value: parts.hour,
      options: Array.from({ length: 24 }, (_, i) => ({
        value: i,
        text: faDigits(String(i).padStart(2, "0")),
      })),
      onChange: (next) => update({ hour: next }),
    },
    {
      key: "minute",
      label: "دقیقه",
      value: minute,
      options: Array.from({ length: 12 }, (_, i) => ({
        value: i * 5,
        text: faDigits(String(i * 5).padStart(2, "0")),
      })),
      onChange: (next) => update({ minute: next }),
    },
  ];

  const renderSelect = (item: (typeof items)[number], grow?: string) => (
    <div className="min-w-0">
      <label
        htmlFor={`jalali-${item.key}`}
        className="mb-1 block text-[11px] font-semibold text-muted-foreground"
      >
        {item.label}
      </label>
      <select
        id={`jalali-${item.key}`}
        dir="rtl"
        className={selectClass(grow)}
        value={item.value}
        onChange={(e) => item.onChange(Number(e.target.value))}
      >
        {item.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.text}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className={className}>
      <p className="label-fa mb-1.5">{label}</p>

      <div className="grid grid-cols-3 gap-2">
        {items.slice(0, 3).map((item) => renderSelect(item))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {items.slice(3).map((item) => renderSelect(item))}
      </div>

      <p className="hint-fa">
        {faWeekday(value)} {faDate(value)} — ساعت {faTime(value)} (شمسی، منطقه زمانی تهران)
      </p>
    </div>
  );
}
