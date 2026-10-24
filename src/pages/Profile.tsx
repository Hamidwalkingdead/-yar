import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { faDate, faDigits, faKm, notifyError, notifySuccess, toman } from "@/lib/fa";
import { cn } from "@/lib/utils";
import {
  CarFront,
  FileCheck2,
  LogOut,
  Route,
  ShieldCheck,
  Star,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQuery } from "convex/react";

const DOC_LABEL: Record<string, string> = {
  license: "گواهینامه رانندگی",
  insurance: "بیمه‌نامه خودرو",
  artesh: "کارت پایان خدمت",
  id_card: "کارت ملی",
};

const DOC_STATUS: Record<string, string> = {
  pending: "در انتظار بررسی",
  approved: "تأیید شده",
  rejected: "رد شده",
};

const REQUEST_STATUS: Record<string, string> = {
  pending: "در انتظار پاسخ",
  accepted: "پذیرفته شده",
  rejected: "رد شده",
  cancelled: "لغو شده",
};

function Card({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="trip-row">
      <h2 className="flex items-center gap-2 text-sm font-black tracking-tight">
        {icon}
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const mine = useQuery(api.profile.mine);
  const myTrips = useQuery(api.trips.mine);
  const myRequests = useQuery(api.trips.myRequests);
  const adminExists = useQuery(api.settings.adminExists);

  const updateName = useMutation(api.profile.updateName);
  const saveVehicle = useMutation(api.profile.saveVehicle);
  const submitDocument = useMutation(api.profile.submitDocument);
  const claimAdmin = useMutation(api.settings.claimAdmin);

  const [name, setName] = useState(user?.name ?? "");
  const [vehicle, setVehicle] = useState({ model: "", plate: "", color: "", capacity: "4" });
  const [docType, setDocType] = useState<"license" | "insurance" | "artesh" | "id_card">("license");
  const [docDesc, setDocDesc] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  if (mine === undefined) {
    return (
      <div className="mx-auto w-full max-w-4xl px-3 pt-6 sm:px-6">
        <div className="trip-row animate-pulse">
          <div className="h-5 w-40 rounded bg-muted" />
        </div>
      </div>
    );
  }

  const run = async (label: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(label);
    try {
      await fn();
      if (ok) notifySuccess(ok);
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(null);
    }
  };

  const profile = mine.user;
  const isDriver = profile?.accountType === "driver";

  return (
    <div className="mx-auto w-full max-w-4xl px-3 pt-5 sm:px-6 sm:pt-8">
      <PageHeader
        title="پروفایل و حساب کاربری"
        description={
          profile?.accountType
            ? profile.accountType === "driver"
              ? "اطلاعات راننده، خودرو، مدارک و سفرهای شما"
              : "اطلاعات مسافر و درخواست‌های سفر شما"
            : "نقش خود را انتخاب نکرده‌اید؛ با پشتیبانی تماس بگیرید."
        }
        action={
          <Button
            variant="outline"
            size="sm"
            className="cursor-pointer gap-1.5"
            onClick={() => void signOut()}
          >
            <LogOut className="size-4" />
            خروج
          </Button>
        }
      />

      {/* اطلاعات حساب */}
      <Card icon={<UserRound className="size-4 text-brand-teal" />} title="اطلاعات حساب">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground">شماره موبایل</p>
            <p className="font-semibold" dir="ltr">
              {faDigits(profile?.phone ?? user?.phone ?? "—")}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">نقش</p>
            <p className="font-semibold">
              {profile?.accountType === "driver" ? "راننده" : profile?.accountType === "passenger" ? "مسافر" : "تعیین‌نشده"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">وضعیت تأیید رانندگی</p>
            <p className="font-semibold">
              {profile?.driverStatus === "approved"
                ? "تأیید شده"
                : profile?.driverStatus === "pending"
                  ? "در انتظار بررسی مدیر"
                  : profile?.driverStatus === "rejected"
                    ? "رد شده"
                    : "—"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">سفرهای ثبت‌شده</p>
            <p className="font-semibold">{faDigits(String(mine.stats.trips))}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3 border-t border-border/60 pt-4">
          <div className="min-w-40 flex-1">
            <label className="label-fa">نام و نام خانوادگی</label>
            <input
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثلاً علی رضایی"
            />
          </div>
          <Button
            className="mt-6 cursor-pointer"
            disabled={name.trim().length < 3 || busy !== null}
            onClick={() =>
              void run("name", () => updateName({ name: name.trim() }), "نام به‌روزرسانی شد.")
            }
          >
            {busy === "name" ? "در حال ثبت…" : "به‌روزرسانی نام"}
          </Button>
        </div>

        {adminExists === false && (
          <div className="mt-4 rounded-lg border border-brand-saffron/50 bg-accent/60 p-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-accent-foreground">
              <ShieldCheck className="size-4" />
              هنوز مدیری در سامانه ثبت نشده است.
            </p>
            <p className="hint-fa">
              با فعال‌سازی، این حساب به‌عنوان نخستین مدیر ثبت می‌شود و پنل مدیریت باز
              می‌شود. این مسیر فقط یک‌بار در دسترس است.
            </p>
            <Button
              size="sm"
              className="mt-2 cursor-pointer"
              disabled={busy !== null}
              onClick={() =>
                void run("claim", () => claimAdmin({}), "پنل مدیریت فعال شد.")
              }
            >
              فعال‌سازی پنل مدیریت
            </Button>
          </div>
        )}
      </Card>

      {/* خودرو */}
      {isDriver && (
        <div className="mt-4">
          <Card icon={<CarFront className="size-4 text-brand-teal" />} title="خودروی من">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label-fa">مدل خودرو</label>
                <input
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={mine.vehicle?.model ?? vehicle.model}
                  onChange={(e) => setVehicle({ ...vehicle, model: e.target.value })}
                  placeholder="مثلاً پژو پارس"
                />
              </div>
              <div>
                <label className="label-fa">شماره پلاک</label>
                <input
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={mine.vehicle?.plate ?? vehicle.plate}
                  onChange={(e) => setVehicle({ ...vehicle, plate: e.target.value })}
                  placeholder="مثلاً ۱۲ ب ۳۴۵ ایران ۲۲"
                />
              </div>
              <div>
                <label className="label-fa">رنگ</label>
                <input
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={mine.vehicle?.color ?? vehicle.color}
                  onChange={(e) => setVehicle({ ...vehicle, color: e.target.value })}
                  placeholder="مثلاً سفید"
                />
              </div>
              <div>
                <label className="label-fa">ظرفیت (صندلی)</label>
                <input
                  type="number"
                  min={1}
                  max={8}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={mine.vehicle?.capacity ?? Number(vehicle.capacity)}
                  onChange={(e) => setVehicle({ ...vehicle, capacity: e.target.value })}
                />
              </div>
            </div>
            <Button
              className="mt-3 cursor-pointer"
              disabled={busy !== null}
              onClick={() =>
                void run(
                  "vehicle",
                  () =>
                    saveVehicle({
                      model: vehicle.model || mine.vehicle?.model || "",
                      plate: vehicle.plate || mine.vehicle?.plate || "",
                      color: vehicle.color || mine.vehicle?.color || "",
                      capacity: Number(vehicle.capacity) || mine.vehicle?.capacity || 4,
                    }),
                  "اطلاعات خودرو ذخیره شد.",
                )
              }
            >
              ذخیره خودرو
            </Button>
          </Card>
        </div>
      )}

      {/* مدارک */}
      {isDriver && (
        <div className="mt-4">
          <Card
            icon={<FileCheck2 className="size-4 text-brand-teal" />}
            title="مدارک رانندگی"
          >
            {mine.documents.length > 0 && (
              <ul className="mb-3 space-y-2">
                {mine.documents.map((d) => (
                  <li
                    key={d._id}
                    className="flex items-center justify-between rounded-lg border border-border/60 p-2.5 text-sm"
                  >
                    <span>{DOC_LABEL[d.docType] ?? d.docType}</span>
                    <span
                      className={cn(
                        "chip",
                        d.status === "approved" && "bg-brand-teal-soft text-brand-teal-deep",
                        d.status === "rejected" && "bg-destructive/10 text-destructive",
                      )}
                    >
                      {DOC_STATUS[d.status]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label-fa">نوع مدرک</label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={docType}
                  onChange={(e) => setDocType(e.target.value as typeof docType)}
                >
                  {Object.entries(DOC_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label-fa">توضیح / شماره مدرک</label>
                <input
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={docDesc}
                  onChange={(e) => setDocDesc(e.target.value)}
                  placeholder="مثلاً شماره گواهینامه"
                />
              </div>
            </div>
            <p className="hint-fa">
              بارگذاری فایل تصویری نیاز به سرویس ذخیره‌سازی فایل دارد؛ در نسخه ۱ مشخصات
              مدرک ثبت می‌شود و بررسی آن با مدیر است.
            </p>
            <Button
              className="mt-3 cursor-pointer"
              disabled={docDesc.trim().length < 3 || busy !== null}
              onClick={() =>
                void run(
                  "doc",
                  () => submitDocument({ docType, description: docDesc.trim() }),
                  "مدرک ثبت شد و در انتظار بررسی مدیر است.",
                )
              }
            >
              ثبت مدرک
            </Button>
          </Card>
        </div>
      )}

      {/* سفرهای من */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card icon={<Route className="size-4 text-brand-teal" />} title="سفرهای من">
          {!myTrips || myTrips.trips.length === 0 ? (
            <p className="text-sm text-muted-foreground">هنوز سفری ثبت نکرده‌اید.</p>
          ) : (
            <ul className="space-y-2">
              {myTrips.trips.slice(0, 8).map((t) => (
                <li key={t._id}>
                  <button
                    type="button"
                    className="w-full cursor-pointer rounded-lg border border-border/60 p-2.5 text-right transition-colors hover:bg-muted"
                    onClick={() => navigate(`/dashboard/trips/${t._id}`)}
                  >
                    <span className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-medium">
                        {t.origin.label} ← {t.destination.label}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {faDate(t.departureAt)}
                      </span>
                    </span>
                    <span className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{faKm(t.distanceKm)}</span>
                      <span className="font-semibold text-brand-teal">{toman(t.priceTotal)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card icon={<Star className="size-4 text-brand-teal" />} title="درخواست‌های من">
          {!myRequests || myRequests.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">درخواستی ثبت نکرده‌اید.</p>
          ) : (
            <ul className="space-y-2">
              {myRequests.rows.slice(0, 8).map(({ request, trip }) => (
                <li key={request._id}>
                  <button
                    type="button"
                    className="w-full cursor-pointer rounded-lg border border-border/60 p-2.5 text-right transition-colors hover:bg-muted"
                    onClick={() => navigate(`/dashboard/trips/${trip._id}`)}
                  >
                    <span className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-medium">
                        {trip.origin.label} ← {trip.destination.label}
                      </span>
                      <span className="chip">{REQUEST_STATUS[request.status] ?? request.status}</span>
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {faDate(request.createdAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
