import { cn } from "@/lib/utils";

/**
 * نشان سفریار: مسیر در حال پیمایش بین دو نقطه داخل یک قاب فیروزه‌ای.
 * برند سفریار مستقل از الگوبرداری‌هاست و فقط این نشان و تایپ‌وگرافی فارسی
 * هویت بصری محصول را می‌سازند.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      role="img"
      aria-label="سفریار"
      className={cn("size-10", className)}
    >
      <rect width="48" height="48" rx="14" fill="var(--color-brand-teal)" />
      <path
        d="M13 34c0-7.5 6-9 11-9s7-1.5 7-6"
        fill="none"
        stroke="var(--color-brand-saffron)"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeDasharray="1 7"
      />
      <path
        d="M13 34c0-7.5 6-9 11-9s7-1.5 7-6"
        fill="none"
        stroke="var(--color-brand-saffron)"
        strokeWidth="3.2"
        strokeLinecap="round"
        opacity="0.35"
      />
      <circle cx="13" cy="34" r="4.5" fill="#fff" />
      <circle cx="13" cy="34" r="1.8" fill="var(--color-brand-teal-deep)" />
      <path
        d="M35 10c-3.9 0-7 3.1-7 7 0 5.2 7 12 7 12s7-6.8 7-12c0-3.9-3.1-7-7-7z"
        fill="var(--color-brand-saffron)"
      />
      <circle cx="35" cy="17" r="2.6" fill="var(--color-brand-teal-deep)" />
    </svg>
  );
}

export function Wordmark({
  className,
  onClick,
}: {
  className?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      aria-label="صفحه اصلی سفریار"
    >
      <BrandMark className="size-9" />
      <span className="flex flex-col items-start leading-none">
        <span className="text-lg font-black tracking-tight">سفریار</span>
        <span className="text-[10px] font-medium text-muted-foreground">SAFARYAR</span>
      </span>
    </button>
  );
}


