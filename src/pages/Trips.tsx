import { PageHeader } from "@/components/AppShell";
import { JalaliDateField } from "@/components/JalaliDateTime";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { faDate, faDigits, faKm, faTime, notifyError, toman } from "@/lib/fa";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Clock,
  MapPin,
  Plus,
  Search,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQuery } from "convex/react";

type SortKey = "time" | "price" | "distance";

const STATUS_LABEL: Record<string, { text: string; className: string }> = {
  open: { text: "باز برای پذیرش", className: "bg-brand-teal-soft text-brand-teal-deep" },
  accepted: { text: "پذیرفته‌شده", className: "bg-accent text-accent-foreground" },
  arrived: { text: "راننده رسید", className: "bg-accent text-accent-foreground" },
  in_progress: { text: "در حال سفر", className: "bg-accent text-accent-foreground" },
  completed: { text: "پایان‌یافته", className: "bg-muted text-muted-foreground" },
  cancelled: { text: "لغوشده", className: "bg-destructive/10 text-destructive" },
  expired: { text: "منقضی", className: "bg-muted text-muted-foreground" },
};

const REQUEST_LABEL: Record<string, string> = {
  pending: "درخواست شما ثبت شده",
  accepted: "در این سفر پذیرفته شده‌اید",
  rejected: "درخواست شما رد شد",
  cancelled: "درخواست لغو شد",
};

export default function TripsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("time");
  const [newOnly, setNewOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [minDistance, setMinDistance] = useState("");
  const [maxDistance, setMaxDistance] = useState("");
  const [departureFrom, setDepartureFrom] = useState<number | null>(null);
  const [departureTo, setDepartureTo] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const trips = useQuery(api.trips.list, {
    search: search.trim() ? search.trim() : undefined,
    sort,
    newOnly: newOnly || undefined,
    minPrice: minPrice ? Number(minPrice) * 1000 : undefined,
    maxPrice: maxPrice ? Number(maxPrice) * 1000 : undefined,
    minDistance: minDistance ? Number(minDistance) : undefined,
    maxDistance: maxDistance ? Number(maxDistance) : undefined,
    departureFrom: departureFrom ?? undefined,
    // پایان بازه: آغاز روز بعد (فیلتر سرور «کوچک‌تر از» است)
    departureTo: departureTo !== null ? departureTo + 86_400_000 : undefined,
  });
  const accept = useMutation(api.trips.accept);
  const requestSeat = useMutation(api.trips.requestSeat);

  const hasFilters = Boolean(
    minPrice ||
      maxPrice ||
      minDistance ||
      maxDistance ||
      newOnly ||
      departureFrom !== null ||
      departureTo !== null,
  );

  const rows = trips?.trips ?? [];
  const counts = useMemo(
    () => ({
      open: rows.filter((t) => t.effectiveStatus === "open").length,
      mine: rows.filter((t) => t.isMine).length,
    }),
    [rows],
  );

  const runAction = async (tripId: Id<"trips">, kind: "accept" | "request") => {
    setBusyId(tripId);
    try {
      if (kind === "accept") await accept({ tripId });
      else await requestSeat({ tripId });
      navigate(`/dashboard/trips/${tripId}`);
    } catch (error) {
      notifyError(error, "انجام عملیات ممکن نشد.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-3 pt-5 sm:px-6 sm:pt-8">
      <PageHeader
        title="فهرست سفرها"
        description={`سفرهای فعال: ${faDigits(String(rows.length))} — قابل پذیرش: ${faDigits(String(counts.open))} — سفرهای من: ${faDigits(String(counts.mine))}`}
        action={
          <Button className="cursor-pointer gap-1.5" onClick={() => navigate("/dashboard/new")}>
            <Plus className="size-4" />
            ثبت سفر
          </Button>
        }
      />

      {/* جست‌وجو و مرتب‌سازی */}
      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-10 w-full rounded-lg border border-input bg-card pr-9 pl-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="جست‌وجوی مبدأ یا مقصد… (مثلاً تهران، اصفهان)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border/70 bg-card p-0.5">
            {(
              [
                { id: "time", label: "زمان حرکت" },
                { id: "price", label: "قیمت" },
                { id: "distance", label: "مسافت" },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSort(item.id)}
                className={cn(
                  "cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  sort === item.id
                    ? "bg-brand-teal text-white"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setNewOnly((v) => !v)}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              newOnly
                ? "border-brand-saffron-deep bg-accent text-accent-foreground"
                : "border-border/70 bg-card text-muted-foreground",
            )}
          >
            <Sparkles className="size-3.5" />
            فقط سفرهای تازه
          </button>

          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className="cursor-pointer rounded-lg border border-border/70 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {showFilters ? "بستن فیلترها" : "فیلتر تاریخ، قیمت و مسافت"}
            {hasFilters && <span className="mr-1 text-brand-teal">•</span>}
          </button>
        </div>

        {showFilters && (
          <div className="trip-row grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label-fa">حداقل قیمت (هزار تومان)</label>
              <input
                type="number"
                min={0}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                placeholder="مثلاً ۱۰۰"
              />
            </div>
            <div>
              <label className="label-fa">حداکثر قیمت (هزار تومان)</label>
              <input
                type="number"
                min={0}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="مثلاً ۵۰۰"
              />
            </div>
            <div>
              <label className="label-fa">حداقل مسافت (کیلومتر)</label>
              <input
                type="number"
                min={0}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={minDistance}
                onChange={(e) => setMinDistance(e.target.value)}
              />
            </div>
            <div>
              <label className="label-fa">حداکثر مسافت (کیلومتر)</label>
              <input
                type="number"
                min={0}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={maxDistance}
                onChange={(e) => setMaxDistance(e.target.value)}
              />
            </div>
            <JalaliDateField
              label="از تاریخ حرکت (شمسی)"
              value={departureFrom}
              onChange={setDepartureFrom}
            />
            <JalaliDateField
              label="تا تاریخ حرکت (شمسی)"
              value={departureTo}
              onChange={setDepartureTo}
            />
            <div className="sm:col-span-2">
              <Button
                variant="outline"
                size="sm"
                className="cursor-pointer"
                onClick={() => {
                  setMinPrice("");
                  setMaxPrice("");
                  setMinDistance("");
                  setMaxDistance("");
                  setNewOnly(false);
                  setDepartureFrom(null);
                  setDepartureTo(null);
                }}
              >
                حذف همه فیلترها
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* فهرست سفرها */}
      {trips === undefined ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="trip-row animate-pulse">
              <div className="h-4 w-1/3 rounded bg-muted" />
              <div className="mt-3 h-3 w-1/2 rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="trip-row py-12 text-center">
          <p className="font-bold">سفری با این شرایط پیدا نشد.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            جست‌وجو یا فیلترها را تغییر دهید، یا اولین سفر را خودتان ثبت کنید.
          </p>
          <Button
            className="mt-5 cursor-pointer gap-1.5"
            onClick={() => navigate("/dashboard/new")}
          >
            <Plus className="size-4" />
            ثبت سفر جدید
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((trip) => {
            const status = STATUS_LABEL[trip.effectiveStatus] ?? STATUS_LABEL.open;
            const busy = busyId === trip._id;
            return (
              <li key={trip._id}>
                <article className="trip-row">
                  <button
                    type="button"
                    className="block w-full cursor-pointer text-right"
                    onClick={() => navigate(`/dashboard/trips/${trip._id}`)}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                            status.className,
                          )}
                        >
                          {status.text}
                        </span>
                        <span className="chip">
                          {trip.ownerRole === "driver" ? "راننده" : "مسافر"} ثبت‌کننده
                        </span>
                        {trip.isMine && <span className="chip">سفر من</span>}
                        {trip.isNew && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-brand-saffron/25 px-2 py-0.5 text-[11px] font-bold text-brand-saffron-deep">
                            <Sparkles className="size-3" />
                            تازه
                          </span>
                        )}
                        {trip.myRequestStatus && (
                          <span className="chip">
                            {REQUEST_LABEL[trip.myRequestStatus] ?? "درخواست شما"}
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-black text-brand-teal">
                        {toman(trip.priceTotal)}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div className="flex items-start gap-2">
                        <MapPin className="mt-0.5 size-4 shrink-0 text-brand-teal" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{trip.origin.label}</p>
                          <p className="truncate text-sm text-muted-foreground">
                            به {trip.destination.label}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground sm:justify-end">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3.5" />
                          {faDate(trip.departureAt)} ساعت {faTime(trip.departureAt)}
                        </span>
                        <span>{faKm(trip.distanceKm)}</span>
                        <span className="inline-flex items-center gap-1">
                          <UsersRound className="size-3.5" />
                          {faDigits(trip.seatsBooked)} از {faDigits(trip.seats)} مسافر
                        </span>
                      </div>
                    </div>
                  </button>

                  {(trip.canAcceptTrip || trip.canRequest) && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                      <p className="text-xs text-muted-foreground">
                        {trip.ownerRole === "driver"
                          ? `کرایه هر مسافر: ${toman(trip.pricePerPassenger)}`
                          : `درآمد خالص راننده: ${toman(trip.driverNet)}`}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="cursor-pointer"
                          onClick={() => navigate(`/dashboard/trips/${trip._id}`)}
                        >
                          جزئیات
                          <ArrowLeft className="size-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          className="cursor-pointer"
                          disabled={busy}
                          onClick={() =>
                            void runAction(
                              trip._id,
                              trip.canAcceptTrip ? "accept" : "request",
                            )
                          }
                        >
                          {busy
                            ? "در حال انجام…"
                            : trip.canAcceptTrip
                              ? "پذیرش سفر"
                              : "درخواست سفر"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {!trip.canAcceptTrip && !trip.canRequest && trip.blockReason && (
                    <p className="mt-3 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                      {trip.blockReason}
                    </p>
                  )}
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
