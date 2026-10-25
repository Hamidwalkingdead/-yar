import { PageHeader } from "@/components/AppShell";
import { JalaliDateTime } from "@/components/JalaliDateTime";
import { RouteMap, type MapPoint } from "@/components/RouteMap";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { QuoteResult } from "@/convex/lib/quote";
import { useAuth } from "@/hooks/use-auth";
import {
  faDate,
  faDigits,
  faKm,
  faTime,
  notifyError,
  notifySuccess,
  toman,
} from "@/lib/fa";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Calculator,
  Clock,
  LocateFixed,
  Loader2,
  MapPin,
  MapPinned,
  Route,
  Search,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useAction } from "convex/react";

type Place = { label: string; lat: number; lng: number };

function PlacePicker({
  label,
  placeholder,
  value,
  onChange,
  picking,
  onPickToggle,
}: {
  label: string;
  placeholder: string;
  value: Place | null;
  onChange: (place: Place | null) => void;
  /** این مبدأ/مقصد در حال انتخاب از روی نقشه است */
  picking: boolean;
  onPickToggle: () => void;
}) {
  const searchAddress = useAction(api.routing.searchAddress);
  const reverseLookup = useAction(api.routing.reverseLookup);
  const [text, setText] = useState("");
  const [results, setResults] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  /** پر کردن خودکار محل با لوکیشن دستگاه + آدرس‌یابی معکوس */
  const locateMe = () => {
    if (locating) return;
    setWarning(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setWarning("دستگاه شما موقعیت مکانی را پشتیبانی نمی‌کند؛ از جست‌وجوی آدرس یا نقشه استفاده کنید.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const fallback = `موقعیت فعلی (${lat.toFixed(4)}، ${lng.toFixed(4)})`;
        let placeLabel = fallback;
        try {
          const res = await reverseLookup({ lat, lng });
          if (res.result?.label) placeLabel = res.result.label;
        } catch {
          // آدرس‌یابی معکوس در دسترس نیست؛ مختصات خام ثبت می‌شود
        }
        onChange({ label: placeLabel, lat, lng });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setWarning(
          err.code === err.PERMISSION_DENIED
            ? "دسترسی به موقعیت مکانی رد شد؛ می‌توانید آدرس را جست‌وجو کنید یا از نقشه انتخاب کنید."
            : "موقعیت مکانی در دسترس نیست؛ دوباره تلاش کنید یا از نقشه انتخاب کنید.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60_000 },
    );
  };

  const actionButtons = (
    <div className="mt-2 grid grid-cols-2 gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="cursor-pointer gap-1"
        disabled={locating}
        onClick={locateMe}
      >
        {locating ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <LocateFixed className="size-4" />
        )}
        {locating ? "در حال یافتن…" : "محل فعلی من"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-pressed={picking}
        className={cn(
          "cursor-pointer gap-1",
          picking && "border-brand-teal bg-brand-teal-soft text-brand-teal-deep",
        )}
        onClick={onPickToggle}
      >
        <MapPinned className="size-4" />
        {picking ? "روی نقشه کلیک کنید" : "انتخاب از نقشه"}
      </Button>
    </div>
  );

  const run = async () => {
    if (text.trim().length < 3 || busy) return;
    setBusy(true);
    setWarning(null);
    try {
      const res = await searchAddress({ query: text.trim() });
      setResults(
        res.results.map((r) => ({ label: r.label, lat: r.lat, lng: r.lng })),
      );
      if (res.warning) setWarning(res.warning);
    } catch (error) {
      setResults([]);
      setWarning(
        error instanceof Error ? error.message : "جست‌وجوی آدرس ممکن نشد.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (value) {
    return (
      <div className="rounded-xl border border-brand-teal/40 bg-brand-teal-soft/50 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-brand-teal-deep" />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-brand-teal-deep">{label}</p>
              <p className="truncate text-sm font-medium">{value.label}</p>
            </div>
          </div>
          <button
            type="button"
            className="shrink-0 cursor-pointer text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            onClick={() => {
              onChange(null);
              setText("");
              setResults(null);
            }}
          >
            تغییر
          </button>
        </div>
        {actionButtons}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/70 bg-card p-3">
      <label className="label-fa">{label}</label>
      <div className="flex gap-2">
        <input
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void run();
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="cursor-pointer gap-1"
          disabled={busy || text.trim().length < 3}
          onClick={() => void run()}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          جست‌وجو
        </Button>
      </div>
      {actionButtons}
      {warning && <p className="hint-fa">{warning}</p>}
      {results && results.length > 0 && (
        <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
          {results.map((r, i) => (
            <li key={`${r.lat}-${r.lng}-${i}`}>
              <button
                type="button"
                className="w-full cursor-pointer rounded-md px-2 py-2 text-right text-xs leading-5 transition-colors hover:bg-muted"
                onClick={() => {
                  onChange(r);
                  setResults(null);
                }}
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {results && results.length === 0 && !warning && (
        <p className="hint-fa">آدرسی با این عبارت پیدا نشد؛ عبارت را کامل‌تر کنید.</p>
      )}
    </div>
  );
}

function QuotePanel({ quote }: { quote: QuoteResult }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-border/70 bg-card p-3">
          <p className="text-[11px] text-muted-foreground">مسافت مسیر</p>
          <p className="mt-1 text-sm font-black">{faKm(quote.distanceKm)}</p>
        </div>
        <div className="rounded-xl border border-border/70 bg-card p-3">
          <p className="text-[11px] text-muted-foreground">مدت تقریبی</p>
          <p className="mt-1 text-sm font-black">{faDigits(String(Math.round(quote.durationMin)))} دقیقه</p>
        </div>
        <div className="rounded-xl border border-border/70 bg-card p-3">
          <p className="text-[11px] text-muted-foreground">نرخ نهایی هر کیلومتر</p>
          <p className="mt-1 text-sm font-black">{toman(quote.ratePerKm)}</p>
        </div>
        <div className="rounded-xl border border-brand-teal/40 bg-brand-teal-soft/50 p-3">
          <p className="text-[11px] text-brand-teal-deep">قیمت کل</p>
          <p className="mt-1 text-sm font-black text-brand-teal-deep">
            {toman(quote.priceTotal)}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border/70 bg-card p-4">
        <h3 className="text-sm font-bold">ریز محاسبه کرایه</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {quote.breakdown.map((line, i) => (
            <li key={`${line.condition}-${i}`} className="flex items-center justify-between border-b border-border/60 pb-2">
              <span className="text-muted-foreground">{line.label}</span>
              <span className="font-semibold">
                {toman(line.amountPerKm)} در هر کیلومتر
              </span>
            </li>
          ))}
          <li className="flex items-center justify-between font-bold">
            <span>قیمت کل ({faKm(quote.distanceKm)})</span>
            <span className="text-brand-teal">{toman(quote.priceTotal)}</span>
          </li>
          {quote.pricePerPassenger !== quote.priceTotal && (
            <li className="flex items-center justify-between text-muted-foreground">
              <span>قیمت هر مسافر</span>
              <span>{toman(quote.pricePerPassenger)}</span>
            </li>
          )}
        </ul>

        <div className="mt-4 rounded-lg bg-muted/60 p-3 text-xs leading-6 text-muted-foreground">
          <p className="flex items-center justify-between">
            <span>کمیسیون سفریار ({faDigits(String(quote.commissionPercent))}٪)</span>
            <span className="font-semibold text-foreground">{toman(quote.commissionAmount)}</span>
          </p>
          <p className="flex items-center justify-between">
            <span>درآمد خالص راننده</span>
            <span className="font-semibold text-foreground">{toman(quote.driverNet)}</span>
          </p>
          <p className="mt-1">
            روش پرداخت کمیسیون: {quote.commissionMethod === "wallet" ? "کسر از کیف پول" : quote.commissionMethod === "gateway" ? "درگاه پرداخت" : quote.commissionMethod === "periodic" ? "تسویه دوره‌ای" : "ثبت بدهی"}
          </p>
        </div>
      </div>

      {quote.warnings.length > 0 && (
        <div className="alert-warn space-y-1">
          {quote.warnings.map((w) => (
            <p key={w}>• {w}</p>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TripCreatePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const quoteAction = useAction(api.routing.quote);
  const reverseLookup = useAction(api.routing.reverseLookup);
  const createTrip = useAction(api.tripActions.create);

  const ownerRole: "passenger" | "driver" = user?.accountType === "driver" ? "driver" : "passenger";
  const isDriver = ownerRole === "driver";

  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [departureAt, setDepartureAt] = useState(() => {
    // گرد کردن به نزدیک‌ترین ۵ دقیقه تا گام‌های انتخاب‌گر ساعت هم‌خوان بمانند
    const target = Date.now() + 3600_000;
    return Math.floor(target / 300_000) * 300_000;
  });
  const [picking, setPicking] = useState<"origin" | "destination" | null>(null);
  const [seats, setSeats] = useState(isDriver ? 2 : 1);
  const [note, setNote] = useState("");
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canQuote = !!origin && !!destination;

  /** انتخاب مبدأ/مقصد با کلیک روی نقشه + آدرس‌یابی معکوس برای برچسب */
  const applyPickedPoint = async (
    target: "origin" | "destination",
    point: { lat: number; lng: number },
  ) => {
    setPicking(null);
    let label = `نقطه انتخابی روی نقشه (${point.lat.toFixed(4)}، ${point.lng.toFixed(4)})`;
    try {
      const res = await reverseLookup(point);
      if (res.result?.label) label = res.result.label;
    } catch {
      // آدرس‌یابی معکوس در دسترس نیست؛ با همان مختصات ثبت می‌شود
    }
    const place: Place = { label, lat: point.lat, lng: point.lng };
    if (target === "origin") setOrigin(place);
    else setDestination(place);
    setQuote(null);
  };

  const calcQuote = async () => {
    if (!origin || !destination || quoting) return;
    setQuoting(true);
    setQuoteError(null);
    try {
      const res = await quoteAction({
        origin,
        destination,
        departureAt,
        seats: Math.max(1, seats),
      });
      if (res.error || !res.quote) {
        setQuote(null);
        setQuoteError(res.error ?? "محاسبه مسیر ممکن نشد.");
      } else {
        setQuote(res.quote);
      }
    } catch (error) {
      setQuote(null);
      setQuoteError(
        error instanceof Error ? error.message : "محاسبه قیمت ممکن نشد؛ دوباره تلاش کنید.",
      );
    } finally {
      setQuoting(false);
    }
  };

  const submit = async () => {
    if (!origin || !destination || !quote || submitting) return;
    setSubmitting(true);
    try {
      const result = await createTrip({
        ownerRole,
        origin,
        destination,
        departureAt,
        seats: Math.max(1, seats),
        note: note.trim() ? note.trim() : undefined,
      });
      notifySuccess("سفر ثبت شد.", "در فهرست سفرها برای پذیرش نمایش داده می‌شود.");
      navigate(`/dashboard/trips/${result.tripId}`);
    } catch (error) {
      notifyError(error, "ثبت سفر ممکن نشد.");
    } finally {
      setSubmitting(false);
    }
  };

  const mapOrigin: MapPoint | null = origin ? { ...origin } : null;
  const mapDestination: MapPoint | null = destination ? { ...destination } : null;

  return (
    <div className="mx-auto w-full max-w-4xl px-3 pt-5 sm:px-6 sm:pt-8">
      <PageHeader
        title={isDriver ? "ثبت سفر جدید" : "درخواست سفر"}
        description={
          isDriver
            ? "مبدأ و مقصد را انتخاب کنید؛ مسافت از مسیر واقعی جاده و قیمت از تنظیمات نرخ محاسبه می‌شود."
            : "مسیر خود را ثبت کنید تا رانندگان تأییدشده آن را بپذیرند."
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <PlacePicker
            label="مبدأ سفر"
            placeholder="مثلاً تهران، میدان آزادی"
            value={origin}
            picking={picking === "origin"}
            onPickToggle={() => setPicking((p) => (p === "origin" ? null : "origin"))}
            onChange={(p) => {
              setOrigin(p);
              setPicking(null);
              setQuote(null);
            }}
          />
          <PlacePicker
            label="مقصد سفر"
            placeholder="مثلاً اصفهان، میدان نقش‌جهان"
            value={destination}
            picking={picking === "destination"}
            onPickToggle={() => setPicking((p) => (p === "destination" ? null : "destination"))}
            onChange={(p) => {
              setDestination(p);
              setPicking(null);
              setQuote(null);
            }}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <JalaliDateTime
                label="زمان حرکت"
                value={departureAt}
                onChange={(ts) => {
                  setDepartureAt(ts);
                  setQuote(null);
                }}
              />
            </div>
            <div>
              <label className="label-fa">
                {isDriver ? "تعداد صندلی‌های قابل ارائه" : "تعداد صندلی"}
              </label>
              <input
                type="number"
                min={1}
                max={8}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={seats}
                disabled={!isDriver}
                onChange={(e) => {
                  setSeats(Math.max(1, Math.min(8, Number(e.target.value) || 1)));
                  setQuote(null);
                }}
              />
              {!isDriver && <p className="hint-fa">درخواست مسافر برای یک صندلی ثبت می‌شود.</p>}
            </div>
          </div>

          <div>
            <label className="label-fa">توضیح (اختیاری)</label>
            <textarea
              className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="مثلاً کوله بزرگ دارم یا کنار اتوبان سوار می‌شوم."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <Button
            type="button"
            className="w-full cursor-pointer gap-2"
            variant={quote ? "outline" : "default"}
            disabled={!canQuote || quoting}
            onClick={() => void calcQuote()}
          >
            {quoting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                در حال محاسبه مسیر و قیمت…
              </>
            ) : (
              <>
                <Calculator className="size-4" />
                {quote ? "به‌روزرسانی قیمت" : "محاسبه مسافت و قیمت"}
              </>
            )}
          </Button>
          {!canQuote && (
            <p className="hint-fa">برای محاسبه قیمت، ابتدا مبدأ و مقصد را انتخاب کنید.</p>
          )}
          {quoteError && <p className="alert-error">{quoteError}</p>}
        </div>

        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
            <RouteMap
              origin={mapOrigin}
              destination={mapDestination}
              route={quote?.route}
              height={300}
              picking={picking !== null}
              onPick={(point) => {
                if (picking) void applyPickedPoint(picking, point);
              }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="size-2.5 rounded-full bg-brand-teal" />
              مبدأ
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="size-2.5 rounded-full bg-brand-saffron-deep" />
              مقصد
            </span>
            <span className="inline-flex items-center gap-1">
              <Route className="size-3.5" />
              مسیر جاده‌ای قابل پیمایش
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" />
              {faDate(departureAt)} ساعت {faTime(departureAt)}
            </span>
          </div>
          <p className="hint-fa">
            نقشه از OpenStreetMap و مسیر از سرویس مسیریابی واقعی دریافت می‌شود؛
            مسافت «خط مستقیم» محاسبه نمی‌شود.
          </p>
        </div>
      </div>

      {quote && (
        <div className="mt-6">
          <QuotePanel quote={quote} />
        </div>
      )}

      <div className="sticky bottom-24 z-30 mt-6 flex flex-col gap-2 rounded-xl border border-border/70 bg-card/95 p-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between md:bottom-4">
        <div className="text-sm">
          {quote ? (
            <span>
              قیمت نهایی:{" "}
              <b className="text-brand-teal">{toman(quote.priceTotal)}</b>
              <span className="mr-2 text-muted-foreground">
                ({faKm(quote.distanceKm)}، {quote.ratePerKm.toLocaleString("fa-IR")} تومان هر کیلومتر)
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">
              پس از محاسبه قیمت، ثبت سفر فعال می‌شود.
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="cursor-pointer"
            onClick={() => navigate("/dashboard")}
          >
            انصراف
          </Button>
          <Button
            className={cn("cursor-pointer gap-1.5", !quote && "opacity-60")}
            disabled={!quote || submitting}
            onClick={() => void submit()}
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                در حال ثبت…
              </>
            ) : (
              <>
                ثبت سفر
                <ArrowLeft className="size-4" />
              </>
            )}
          </Button>
        </div>
      </div>

      {!isDriver && (
        <p className="alert-warn mt-4">
          <TriangleAlert className="size-4 shrink-0" />
          برای ثبت سفر به‌عنوان راننده باید نقش راننده داشته باشید و مدارک‌تان از سوی
          مدیر تأیید شده باشد.
        </p>
      )}
    </div>
  );
}
