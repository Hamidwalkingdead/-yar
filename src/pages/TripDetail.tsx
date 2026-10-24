import { PageHeader } from "@/components/AppShell";
import { RouteMap } from "@/components/RouteMap";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
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
  Check,
  Loader2,
  MapPin,
  Phone,
  Route,
  Star,
  TriangleAlert,
  UsersRound,
  X,
} from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useMutation, useQuery } from "convex/react";

const STATUS_LABEL: Record<string, { text: string; className: string }> = {
  open: { text: "باز برای پذیرش", className: "bg-brand-teal-soft text-brand-teal-deep" },
  accepted: { text: "پذیرفته‌شده", className: "bg-accent text-accent-foreground" },
  arrived: { text: "راننده به مبدأ رسید", className: "bg-accent text-accent-foreground" },
  in_progress: { text: "در حال سفر", className: "bg-accent text-accent-foreground" },
  completed: { text: "پایان‌یافته", className: "bg-muted text-muted-foreground" },
  cancelled: { text: "لغوشده", className: "bg-destructive/10 text-destructive" },
  expired: { text: "منقضی", className: "bg-muted text-muted-foreground" },
};

const CONDITION_LABEL: Record<string, string> = {
  night: "شب",
  rain: "بارندگی",
  snow: "برف",
  mountain: "مسیر کوهستانی",
};

const REQUEST_STATUS: Record<string, string> = {
  pending: "در انتظار پاسخ",
  accepted: "پذیرفته‌شده",
  rejected: "رد شده",
  cancelled: "لغوشده",
};

export default function TripDetailPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const data = useQuery(api.trips.get, tripId ? { tripId: tripId as Id<"trips"> } : "skip");
  const [busy, setBusy] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState("");

  const accept = useMutation(api.trips.accept);
  const requestSeat = useMutation(api.trips.requestSeat);
  const respond = useMutation(api.trips.respond);
  const cancelRequest = useMutation(api.trips.cancelRequest);
  const cancelTrip = useMutation(api.trips.cancelTrip);
  const markArrived = useMutation(api.trips.markArrived);
  const startTrip = useMutation(api.trips.startTrip);
  const completeTrip = useMutation(api.trips.completeTrip);
  const rate = useMutation(api.trips.rate);

  if (data === undefined) {
    return (
      <div className="mx-auto w-full max-w-4xl px-3 pt-8 sm:px-6">
        <div className="trip-row animate-pulse">
          <div className="h-5 w-1/3 rounded bg-muted" />
          <div className="mt-4 h-40 rounded-lg bg-muted" />
        </div>
      </div>
    );
  }
  if (data === null || !tripId) {
    return (
      <div className="mx-auto w-full max-w-4xl px-3 pt-8 sm:px-6">
        <div className="trip-row py-12 text-center">
          <p className="font-bold">سفر یافت نشد.</p>
          <Button className="mt-4 cursor-pointer" onClick={() => navigate("/dashboard")}>
            بازگشت به فهرست
          </Button>
        </div>
      </div>
    );
  }

  const id = tripId as Id<"trips">;
  const { trip, owner, driver, requests, myRequest, isOwner, isDriver, viewerRole, settings } = data;
  const status = STATUS_LABEL[trip.effectiveStatus] ?? STATUS_LABEL.open;
  const active =
    trip.effectiveStatus === "open" ||
    trip.effectiveStatus === "accepted" ||
    trip.effectiveStatus === "arrived" ||
    trip.effectiveStatus === "in_progress";

  const run = async (label: string, fn: () => Promise<unknown>, okMessage?: string) => {
    setBusy(label);
    try {
      await fn();
      if (okMessage) notifySuccess(okMessage);
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-3 pt-5 sm:px-6 sm:pt-8">
      <PageHeader
        title={trip.ownerRole === "driver" ? "جزئیات سفر پیشنهادی راننده" : "جزئیات درخواست سفر"}
        description={`${trip.origin.label} به ${trip.destination.label}`}
        action={
          <Button variant="outline" size="sm" className="cursor-pointer gap-1" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="size-4" />
            فهرست سفرها
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold", status.className)}>
          {status.text}
        </span>
        <span className="chip">{owner?.name ?? "کاربر سفریار"}</span>
        {owner?.rating != null && (
          <span className="chip">
            امتیاز {faDigits(owner.rating.toFixed(1))}
          </span>
        )}
        <span className="chip">{isOwner ? "متعلق به شما" : isDriver ? "شما راننده این سفرید" : viewerRole === "driver" ? "راننده" : "مسافر"}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
          <RouteMap
            origin={trip.origin}
            destination={trip.destination}
            route={trip.route}
            height={300}
          />
        </div>

        <div className="space-y-3">
          <div className="trip-row">
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 text-brand-teal" />
                <div>
                  <p className="text-sm font-semibold">{trip.origin.label}</p>
                  <p className="text-sm text-muted-foreground">به {trip.destination.label}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">زمان حرکت</span>
                <span className="text-left font-semibold">
                  {faDate(trip.departureAt)} ساعت {faTime(trip.departureAt)}
                </span>
                <span className="text-muted-foreground">مسافت مسیر</span>
                <span className="text-left font-semibold">{faKm(trip.distanceKm)}</span>
                <span className="text-muted-foreground">مدت تقریبی</span>
                <span className="text-left font-semibold">
                  {faDigits(String(Math.round(trip.durationMin)))} دقیقه
                </span>
                <span className="text-muted-foreground">صندلی‌ها</span>
                <span className="text-left font-semibold">
                  {faDigits(`${trip.seatsBooked}/${trip.seats}`)}
                </span>
              </div>
              {trip.conditions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
                  {trip.conditions.map((c) => (
                    <span key={c} className="chip bg-accent text-accent-foreground">
                      {CONDITION_LABEL[c] ?? c}
                    </span>
                  ))}
                </div>
              )}
              {trip.note && (
                <p className="border-t border-border/60 pt-3 text-sm leading-7 text-muted-foreground">
                  یادداشت: {trip.note}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* قیمت و کمیسیون */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="trip-row">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <Route className="size-4 text-brand-teal" />
            ریز کرایه
          </h3>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex justify-between border-b border-border/60 pb-2">
              <span className="text-muted-foreground">نرخ پایه هر کیلومتر</span>
              <span>{toman(trip.baseRatePerKm)}</span>
            </li>
            <li className="flex justify-between border-b border-border/60 pb-2">
              <span className="text-muted-foreground">افزایش شرایط (هر کیلومتر)</span>
              <span>{toman(trip.surchargePerKm)}</span>
            </li>
            <li className="flex justify-between border-b border-border/60 pb-2">
              <span className="text-muted-foreground">نرخ نهایی هر کیلومتر</span>
              <span className="font-semibold">{toman(trip.ratePerKm)}</span>
            </li>
            <li className="flex justify-between font-bold">
              <span>قیمت کل</span>
              <span className="text-brand-teal">{toman(trip.priceTotal)}</span>
            </li>
            {trip.seats > 1 && (
              <li className="flex justify-between text-muted-foreground">
                <span>قیمت هر مسافر</span>
                <span>{toman(trip.pricePerPassenger)}</span>
              </li>
            )}
          </ul>
        </div>

        <div className="trip-row">
          <h3 className="text-sm font-bold">کمیسیون و تسویه</h3>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex justify-between border-b border-border/60 pb-2">
              <span className="text-muted-foreground">درصد کمیسیون</span>
              <span>{faDigits(String(trip.commissionPercent))}٪</span>
            </li>
            <li className="flex justify-between border-b border-border/60 pb-2">
              <span className="text-muted-foreground">مبلغ کمیسیون</span>
              <span className="font-semibold text-brand-saffron-deep">{toman(trip.commissionAmount)}</span>
            </li>
            <li className="flex justify-between border-b border-border/60 pb-2">
              <span className="text-muted-foreground">درآمد خالص راننده</span>
              <span>{toman(trip.driverNet)}</span>
            </li>
            <li className="flex justify-between text-muted-foreground">
              <span>روش پرداخت</span>
              <span>
                {settings.commissionMethod === "wallet"
                  ? "کسر از کیف پول"
                  : settings.commissionMethod === "gateway"
                    ? "درگاه پرداخت"
                    : settings.commissionMethod === "periodic"
                      ? "تسویه دوره‌ای"
                      : "ثبت بدهی"}
              </span>
            </li>
          </ul>
          {trip.settled && (
            <p className="mt-3 rounded-lg bg-brand-teal-soft px-3 py-2 text-xs text-brand-teal-deep">
              تسویه‌شده در {faDate(trip.settledAt ?? trip.completedAt ?? trip.createdAt)}
            </p>
          )}
        </div>
      </div>

      {/* طرف مقابل */}
      {driver && (
        <div className="trip-row mt-4">
          <h3 className="text-sm font-bold">راننده این سفر</h3>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-brand-teal-soft text-brand-teal-deep">
                <Route className="size-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">{driver.name}</p>
                <p className="text-xs text-muted-foreground">
                  {driver.vehicle
                    ? `${driver.vehicle.model} — ${driver.vehicle.plate}`
                    : "خودرو ثبت نشده"}
                </p>
              </div>
            </div>
            {driver.phone && (
              <a
                href={`tel:${driver.phone}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 px-3 py-2 text-xs font-semibold"
                dir="ltr"
              >
                <Phone className="size-3.5" />
                {faDigits(driver.phone)}
              </a>
            )}
          </div>
        </div>
      )}

      {/* درخواست‌های رسیده — فقط برای مالک سفر */}
      {isOwner && requests.length > 0 && (
        <div className="trip-row mt-4">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <UsersRound className="size-4 text-brand-teal" />
            درخواست‌ها ({faDigits(String(requests.length))})
          </h3>
          <ul className="mt-3 space-y-2">
            {requests.map((r) => (
              <li
                key={r._id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 p-3"
              >
                <div>
                  <p className="text-sm font-semibold">{r.requesterName}</p>
                  <p className="text-xs text-muted-foreground">
                    {REQUEST_STATUS[r.status] ?? r.status} — {faDate(r.createdAt)}
                  </p>
                </div>
                {r.status === "pending" && active ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="cursor-pointer gap-1"
                      disabled={busy !== null}
                      onClick={() =>
                        void run(
                          r._id,
                          () => respond({ requestId: r._id, decision: "reject" }),
                          "درخواست رد شد.",
                        )
                      }
                    >
                      <X className="size-3.5" />
                      رد
                    </Button>
                    <Button
                      size="sm"
                      className="cursor-pointer gap-1"
                      disabled={busy !== null}
                      onClick={() =>
                        void run(
                          r._id,
                          () => respond({ requestId: r._id, decision: "accept" }),
                          "درخواست پذیرفته شد.",
                        )
                      }
                    >
                      <Check className="size-3.5" />
                      پذیرش
                    </Button>
                  </div>
                ) : (
                  <span className="chip">{REQUEST_STATUS[r.status] ?? r.status}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* اقدامات اصلی */}
      <div className="sticky bottom-24 z-30 mt-4 flex flex-wrap gap-2 rounded-xl border border-border/70 bg-card/95 p-3 backdrop-blur md:bottom-4">
        {busy && (
          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            در حال انجام عملیات…
          </span>
        )}

        {/* پذیرش سفر توسط راننده */}
        {data.trip.effectiveStatus === "open" && !isOwner && viewerRole === "driver" && (
          <Button
            className="cursor-pointer"
            disabled={busy !== null}
            onClick={() => void run("accept", () => accept({ tripId: id }), "سفر پذیرفته شد.")}
          >
            پذیرش سفر
          </Button>
        )}

        {/* درخواست صندلی توسط مسافر */}
        {!isOwner && viewerRole === "passenger" && (trip.effectiveStatus === "open" || trip.effectiveStatus === "accepted") && (
          myRequest?.status === "pending" ? (
            <Button
              variant="outline"
              className="cursor-pointer"
              disabled={busy !== null}
              onClick={() =>
                void run("cancelRequest", () => cancelRequest({ requestId: myRequest._id }), "درخواست شما لغو شد.")
              }
            >
              لغو درخواست من
            </Button>
          ) : myRequest?.status === "accepted" ? (
            <span className="chip">شما در این سفر پذیرفته شده‌اید</span>
          ) : (
            <Button
              className="cursor-pointer"
              disabled={busy !== null}
              onClick={() => void run("request", () => requestSeat({ tripId: id }), "درخواست شما ثبت شد.")}
            >
              درخواست صندلی
            </Button>
          )
        )}

        {/* چرخه عمر سفر برای راننده/مالک */}
        {isDriver && trip.effectiveStatus === "accepted" && (
          <Button
            className="cursor-pointer"
            disabled={busy !== null}
            onClick={() => void run("arrived", () => markArrived({ tripId: id }), "رسیدن به مبدأ ثبت شد.")}
          >
            رسیدم به مبدأ
          </Button>
        )}
        {(isDriver || isOwner) && trip.effectiveStatus === "arrived" && (
          <Button
            className="cursor-pointer"
            disabled={busy !== null}
            onClick={() => void run("start", () => startTrip({ tripId: id }), "سفر آغاز شد.")}
          >
            شروع سفر
          </Button>
        )}
        {isDriver && trip.effectiveStatus === "in_progress" && (
          <Button
            className="cursor-pointer"
            disabled={busy !== null}
            onClick={() => void run("complete", () => completeTrip({ tripId: id }), "سفر پایان یافت و تسویه ثبت شد.")}
          >
            پایان سفر
          </Button>
        )}

        {/* لغو سفر */}
        {isOwner && active && (
          <Button
            variant="outline"
            className="cursor-pointer text-destructive"
            disabled={busy !== null}
            onClick={() => void run("cancel", () => cancelTrip({ tripId: id }), "سفر لغو شد.")}
          >
            لغو سفر
          </Button>
        )}

        {!active && trip.effectiveStatus !== "completed" && (
          <span className="text-xs text-muted-foreground">
            این سفر دیگر فعال نیست و اقدام جدیدی روی آن مجاز نیست.
          </span>
        )}
      </div>

      {/* امتیازدهی */}
      {data.canRate && (
        <div className="trip-row mt-4">
          <h3 className="text-sm font-bold">امتیاز به این سفر</h3>
          <div className="mt-3 flex items-center gap-1" dir="ltr">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                className="cursor-pointer p-1"
                onClick={() => setRating(star)}
                aria-label={`${star} ستاره`}
              >
                <Star
                  className={cn(
                    "size-6",
                    star <= rating ? "fill-brand-saffron text-brand-saffron-deep" : "text-border",
                  )}
                />
              </button>
            ))}
          </div>
          <textarea
            className="mt-3 min-h-16 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="تجربه‌تان را بنویسید (اختیاری)"
            value={review}
            onChange={(e) => setReview(e.target.value)}
          />
          <Button
            className="mt-3 cursor-pointer"
            disabled={busy !== null}
            onClick={() =>
              void run(
                "rate",
                () => rate({ tripId: id, rating, review: review.trim() || undefined }),
                "امتیاز شما ثبت شد.",
              )
            }
          >
            ثبت امتیاز
          </Button>
        </div>
      )}

      {trip.effectiveStatus === "open" && isOwner && (
        <p className="alert-warn mt-4">
          <TriangleAlert className="size-4 shrink-0" />
          این سفر در انتظار پذیرش است؛ پس از پذیرش راننده، اطلاعات تماس برای هر دو
          طرف نمایش داده می‌شود.
        </p>
      )}
    </div>
  );
}
