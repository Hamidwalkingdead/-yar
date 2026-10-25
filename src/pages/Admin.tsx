import { PageHeader } from "@/components/AppShell";
import { JalaliDateField } from "@/components/JalaliDateTime";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import {
  faDate,
  faDigits,
  faRelative,
  notifyError,
  notifySuccess,
  toman,
} from "@/lib/fa";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  FileCheck2,
  Landmark,
  ScrollText,
  Settings2,
  UsersRound,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { useMutation, useQuery } from "convex/react";

const TABS = [
  { id: "overview", label: "نمای کلی", icon: BarChart3 },
  { id: "users", label: "کاربران", icon: UsersRound },
  { id: "documents", label: "مدارک", icon: FileCheck2 },
  { id: "settlements", label: "تسویه‌ها", icon: Landmark },
  { id: "wallets", label: "کیف پول‌ها", icon: Wallet },
  { id: "settings", label: "تنظیمات نرخ", icon: Settings2 },
  { id: "audit", label: "سوابق", icon: ScrollText },
] as const;

type TabId = (typeof TABS)[number]["id"];

const DOC_STATUS: Record<string, string> = {
  pending: "در انتظار",
  approved: "تأیید شده",
  rejected: "رد شده",
};

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-base font-black", tone ?? "text-foreground")}>{value}</p>
    </div>
  );
}

export default function AdminPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: TabId = TABS.some((t) => t.id === raw) ? (raw as TabId) : "overview";

  const overview = useQuery(api.admin.overview);
  const users = useQuery(
    api.admin.users,
    tab === "users" ? { accountType: "all" } : "skip",
  );
  const documents = useQuery(
    api.admin.documents,
    tab === "documents" ? { status: "pending" } : "skip",
  );
  const settlements = useQuery(
    api.admin.settlements,
    tab === "settlements" ? { status: "requested" } : "skip",
  );
  const allSettlements = useQuery(
    api.admin.settlements,
    tab === "settlements" ? { status: "all" } : "skip",
  );
  const wallets = useQuery(api.admin.wallets, tab === "wallets" ? {} : "skip");
  const auditLog = useQuery(api.admin.auditLog, tab === "audit" ? {} : "skip");
  const settings = useQuery(api.settings.get, tab === "settings" ? {} : "skip");
  const payout = useQuery(api.admin.payoutAccount, tab === "settings" ? {} : "skip");
  const reconcileData = useQuery(api.admin.reconcile, tab === "wallets" ? {} : "skip");
  const reviewDocument = useMutation(api.admin.reviewDocument);
  const setDriverStatus = useMutation(api.admin.setDriverStatus);
  const setUserActive = useMutation(api.admin.setUserActive);
  const approveSettlement = useMutation(api.admin.approveSettlement);
  const markSettlementPaid = useMutation(api.admin.markSettlementPaid);
  const reviewWithdrawal = useMutation(api.admin.reviewWithdrawal);
  const updateSettings = useMutation(api.settings.update);
  const savePayoutAccount = useMutation(api.admin.savePayoutAccount);

  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [toggles, setToggles] = useState<Record<string, boolean> | null>(null);
  const [payoutForm, setPayoutForm] = useState<Record<string, string> | null>(null);
  const [reportDriver, setReportDriver] = useState<Id<"users"> | null>(null);
  const [reportFrom, setReportFrom] = useState<number | null>(null);
  const [reportTo, setReportTo] = useState<number | null>(null);
  const { user, isLoading: authLoading } = useAuth();

  // گزارش مالی راننده — پس از انتخاب راننده و بازهٔ شمسی
  const report = useQuery(
    api.admin.driverReport,
    reportDriver && reportFrom !== null && reportTo !== null
      ? { driverId: reportDriver, fromTs: reportFrom, toTs: reportTo + 86_400_000 }
      : "skip",
  );

  if (!authLoading && user?.role !== "admin") {
    return (
      <div className="mx-auto w-full max-w-3xl px-3 pt-8 sm:px-6">
        <div className="trip-row py-12 text-center">
          <p className="font-bold">دسترسی غیرمجاز</p>
          <p className="mt-2 text-sm text-muted-foreground">
            پنل مدیریت فقط برای حساب مدیر در دسترس است. اگر هنوز مدیری ثبت نشده، از
            پروفایل گزینه «فعال‌سازی پنل مدیریت» را بزنید.
          </p>
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

  const setTab = (id: TabId) => {
    const next = new URLSearchParams(params);
    next.set("tab", id);
    setParams(next, { replace: true });
  };

  const num = (key: string) => Number(form?.[key] ?? 0);

  const saveSettings = async () => {
    if (!settings || !form) return;
    await run(
      "settings",
      () =>
        updateSettings({
          baseRatePerKm: num("baseRatePerKm"),
          surchargeNight: num("surchargeNight"),
          surchargeRain: num("surchargeRain"),
          surchargeSnow: num("surchargeSnow"),
          surchargeMountain: num("surchargeMountain"),
          nightStartHour: num("nightStartHour"),
          nightEndHour: num("nightEndHour"),
          mountainGainM: num("mountainGainM"),
          commissionPercent: num("commissionPercent"),
          commissionFixed: num("commissionFixed"),
          commissionBasis: settings.commissionBasis,
          commissionPayer: settings.commissionPayer,
          commissionMethod: settings.commissionMethod,
          autoCommissionEnabled: autoCommission,
          walletTopupRequired: walletTopup,
          minAcceptanceBalance: num("minAcceptanceBalance"),
          debtHandling: debtPolicy,
          blockAcceptanceWhenInDebt: debtPolicy === "block",
          requireSettlementBeforeWithdraw: settings.requireSettlementBeforeWithdraw,
          tripExpiryMinutes: num("tripExpiryMinutes"),
          mapProvider: settings.mapProvider,
          smsProvider: settings.smsProvider,
          paymentProvider: settings.paymentProvider,
          timezone: settings.timezone,
        }),
      "تنظیمات ذخیره شد.",
    );
  };

  const formValue = (key: string, fallback: number | string) =>
    form?.[key] ?? String(fallback);

  // مقادیر کلیدهای مستقل روش‌های وصول کمیسیون (تا ذخیره، در حالت محلی نگه داشته می‌شوند)
  const autoCommission =
    toggles?.autoCommissionEnabled ?? settings?.autoCommissionEnabled ?? true;
  const walletTopup =
    toggles?.walletTopupRequired ?? settings?.walletTopupRequired ?? false;
  const debtPolicy: "block" | "allow" =
    toggles?.debtBlock !== undefined
      ? toggles.debtBlock
        ? "block"
        : "allow"
      : (settings?.debtHandling ?? "block");

  const payoutValue = (key: string) =>
    payoutForm?.[key] ??
    (payout as Record<string, string | undefined> | null)?.[key] ??
    "";

  const savePayout = async () => {
    await run(
      "payout",
      () =>
        savePayoutAccount({
          bankName: payoutValue("bankName") || undefined,
          accountHolder: payoutValue("accountHolder") || undefined,
          cardNumber: payoutValue("cardNumber") || undefined,
          note: payoutValue("note") || undefined,
        }),
      "اطلاعات حساب مقصد ذخیره شد.",
    );
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-3 pt-5 sm:px-6 sm:pt-8">
      <PageHeader
        title="پنل مدیریت"
        description="کاربران، مدارک، کمیسیون، تسویه‌ها و تنظیمات نرخ سفریار"
      />

      <div className="mb-5 flex flex-wrap gap-1.5">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
              tab === item.id
                ? "border-brand-teal bg-brand-teal text-white"
                : "border-border/70 bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            <item.icon className="size-3.5" />
            {item.label}
          </button>
        ))}
      </div>

      {overview === undefined && (
        <div className="trip-row animate-pulse">
          <div className="h-5 w-48 rounded bg-muted" />
        </div>
      )}

      {/* نمای کلی */}
      {overview && tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="کاربران" value={faDigits(String(overview.counts.users))} />
            <Stat label="رانندگان تأییدشده" value={faDigits(String(overview.counts.approvedDrivers))} />
            <Stat label="مسافران" value={faDigits(String(overview.counts.passengers))} />
            <Stat label="سفرها" value={faDigits(String(overview.counts.trips))} />
            <Stat label="سفرهای فعال" value={faDigits(String(overview.counts.activeTrips))} />
            <Stat label="سفرهای پایان‌یافته" value={faDigits(String(overview.counts.completedTrips))} />
            <Stat
              label="مدارک در انتظار"
              value={faDigits(String(overview.counts.pendingDocuments))}
              tone={overview.counts.pendingDocuments ? "text-brand-saffron-deep" : undefined}
            />
            <Stat
              label="تسویه‌های در انتظار"
              value={faDigits(String(overview.counts.pendingSettlements))}
              tone={overview.counts.pendingSettlements ? "text-brand-saffron-deep" : undefined}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="درآمد ناخالص رانندگان" value={toman(overview.finance.gross)} />
            <Stat label="کمیسیون وصول‌شده" value={toman(overview.finance.commissionPaid)} tone="text-brand-teal" />
            <Stat label="کمیسیون وصول‌نشده" value={toman(overview.finance.commissionUnpaid)} tone="text-brand-saffron-deep" />
            <Stat label="بدهی" value={toman(overview.finance.debt)} />
            <Stat label="برداشت‌شده" value={toman(overview.finance.withdrawn)} />
            <Stat label="کرایه جمع‌آوری‌شده" value={toman(overview.finance.collected)} />
          </div>
        </div>
      )}

      {/* کاربران */}
      {tab === "users" && users && (
        <ul className="space-y-2">
          {users.rows.length === 0 && (
            <li className="trip-row text-sm text-muted-foreground">کاربری ثبت نشده است.</li>
          )}
          {users.rows.map(({ user, wallet }) => (
            <li key={user._id} className="trip-row">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">
                    {user.name ?? "بدون نام"}
                    <span className="mr-2 text-xs font-normal text-muted-foreground" dir="ltr">
                      {faDigits(user.phone ?? "")}
                    </span>
                  </p>
                  <p className="mt-1 flex flex-wrap gap-1.5">
                    <span className="chip">
                      {user.accountType === "driver" ? "راننده" : user.accountType === "passenger" ? "مسافر" : "نقش‌نشده"}
                    </span>
                    <span className="chip">
                      {user.driverStatus === "approved"
                        ? "راننده تأییدشده"
                        : user.driverStatus === "pending"
                          ? "در انتظار بررسی"
                          : user.driverStatus === "rejected"
                            ? "مدارک رد شده"
                            : "بدون وضعیت"}
                    </span>
                    {user.role === "admin" && <span className="chip">مدیر</span>}
                    {user.active === false && (
                      <span className="chip bg-destructive/10 text-destructive">غیرفعال</span>
                    )}
                    {wallet && (
                      <span className="chip">
                        موجودی {toman(wallet.balance)} — بدهی {toman(wallet.debt)}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {user.accountType === "driver" && (
                    <>
                      <Button
                        size="sm"
                        variant={user.driverStatus === "approved" ? "outline" : "default"}
                        className="cursor-pointer"
                        disabled={busy !== null}
                        onClick={() =>
                          void run(
                            `approve-${user._id}`,
                            () => setDriverStatus({ userId: user._id, status: "approved" }),
                            "راننده تأیید شد.",
                          )
                        }
                      >
                        تأیید راننده
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="cursor-pointer"
                        disabled={busy !== null}
                        onClick={() =>
                          void run(`reject-${user._id}`, () =>
                            setDriverStatus({ userId: user._id, status: "rejected" }),
                          )
                        }
                      >
                        رد
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="cursor-pointer"
                    disabled={busy !== null}
                    onClick={() =>
                      void run(`active-${user._id}`, () =>
                        setUserActive({ userId: user._id, active: user.active === false }),
                      )
                    }
                  >
                    {user.active === false ? "فعال‌سازی" : "غیرفعال‌سازی"}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* مدارک */}
      {tab === "documents" && documents && (
        <ul className="space-y-2">
          {documents.rows.length === 0 && (
            <li className="trip-row text-sm text-muted-foreground">
              مدرکی در انتظار بررسی نیست.
            </li>
          )}
          {documents.rows.map(({ doc, driverName, driverPhone, vehicle }) => (
            <li key={doc._id} className="trip-row">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{driverName}</p>
                  <p className="text-xs text-muted-foreground">
                    {doc.docType === "license"
                      ? "گواهینامه"
                      : doc.docType === "insurance"
                        ? "بیمه‌نامه"
                        : doc.docType === "artesh"
                          ? "کارت پایان خدمت"
                          : "کارت ملی"}
                    {" — "}
                    {doc.description}
                    {vehicle ? ` — ${vehicle}` : ""}
                    {driverPhone ? ` — ${driverPhone}` : ""}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    ثبت: {faRelative(doc.submittedAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="cursor-pointer"
                    disabled={busy !== null}
                    onClick={() =>
                      void run(
                        `rej-${doc._id}`,
                        () => reviewDocument({ documentId: doc._id, decision: "rejected" }),
                        "مدرک رد شد.",
                      )
                    }
                  >
                    رد
                  </Button>
                  <Button
                    size="sm"
                    className="cursor-pointer"
                    disabled={busy !== null}
                    onClick={() =>
                      void run(
                        `app-${doc._id}`,
                        () => reviewDocument({ documentId: doc._id, decision: "approved" }),
                        "مدرک تأیید شد.",
                      )
                    }
                  >
                    تأیید
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* تسویه‌ها */}
      {tab === "settlements" && settlements && allSettlements && (
        <div className="space-y-4">
          <ul className="space-y-2">
            {settlements.rows.length === 0 && (
              <li className="trip-row text-sm text-muted-foreground">
                درخواست تسویه در انتظاری نیست.
              </li>
            )}
            {settlements.rows.map(({ settlement, driverName }) => (
              <li key={settlement._id} className="trip-row">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {driverName} — {toman(settlement.amount)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      دوره {faDate(settlement.periodFrom)} تا {faDate(settlement.periodTo)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="cursor-pointer"
                      disabled={busy !== null}
                      onClick={() =>
                        void run(
                          `sr-${settlement._id}`,
                          () => approveSettlement({ settlementId: settlement._id, decision: "rejected" }),
                          "درخواست رد شد.",
                        )
                      }
                    >
                      رد
                    </Button>
                    <Button
                      size="sm"
                      className="cursor-pointer"
                      disabled={busy !== null}
                      onClick={() =>
                        void run(
                          `sa-${settlement._id}`,
                          () => approveSettlement({ settlementId: settlement._id, decision: "approved" }),
                          "درخواست تأیید شد.",
                        )
                      }
                    >
                      تأیید
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div>
            <h3 className="mb-2 text-sm font-black">همه تسویه‌ها</h3>
            <ul className="space-y-2">
              {allSettlements.rows.map(({ settlement, driverName }) => (
                <li
                  key={settlement._id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 p-3 text-sm"
                >
                  <span>
                    {driverName} — {toman(settlement.amount)}
                    <span className="mr-2 text-xs text-muted-foreground">
                      {faDate(settlement.createdAt)}
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="chip">
                      {settlement.status === "requested"
                        ? "در انتظار"
                        : settlement.status === "approved"
                          ? "تأییدشده"
                          : settlement.status === "paid"
                            ? "پرداخت‌شده"
                            : "ردشده"}
                    </span>
                    {settlement.status === "approved" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="cursor-pointer"
                          disabled={busy !== null}
                          onClick={() =>
                            void run(`pw-${settlement._id}`, () =>
                              markSettlementPaid({
                                settlementId: settlement._id,
                                fromWallet: true,
                              }),
                            )
                          }
                    >
                          کسر از کیف پول
                        </Button>
                        <Button
                          size="sm"
                          className="cursor-pointer"
                          disabled={busy !== null}
                          onClick={() =>
                            void run(`pd-${settlement._id}`, () =>
                              markSettlementPaid({
                                settlementId: settlement._id,
                                fromWallet: false,
                              }),
                            )
                          }
                        >
                          واریز مستقیم
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* کیف پول‌ها */}
      {/* تطبیق دفتر تراکنش‌ها با مانده کیف پول‌ها */}
      {tab === "wallets" && reconcileData && (
        <div className="trip-row mb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold">تطبیق دفتر تراکنش‌ها</h3>
              <p className="mt-1 text-xs leading-6 text-muted-foreground">
                مانده کیف پول، کمیسیون پرداخت‌شده و پرداخت‌نشده با دفتر رویدادها مقایسه می‌شود؛
                مغایرت‌ها بدون تغییر سابقه گزارش می‌شوند.
              </p>
            </div>
            <span
              className={cn(
                "chip",
                reconcileData.ok
                  ? "bg-brand-teal-soft text-brand-teal-deep"
                  : "bg-destructive/10 text-destructive",
              )}
            >
              {reconcileData.ok ? "همه کیف پول‌ها مطابقت دارند" : "مغایرت مالی یافت شد"}
            </span>
          </div>
          {!reconcileData.ok && (
            <ul className="mt-3 space-y-1 text-xs">
              {reconcileData.rows
                .filter((r) => !r.ok)
                .map((r) => (
                  <li
                    key={r.walletId}
                    className="rounded-lg border border-destructive/30 p-2 leading-6"
                  >
                    <span className="font-semibold">{r.driverName}</span> — اختلاف موجودی{" "}
                    {toman(r.deltaBalance)}، اختلاف کمیسیون پرداخت‌شده {toman(r.deltaCommissionPaid)}،
                    اختلاف بدهی {toman(r.deltaUnpaid)}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      {/* گزارش مالی یک راننده در بازهٔ شمسی */}
      {tab === "wallets" && reportDriver && reportFrom !== null && reportTo !== null && (
        <div className="trip-row mb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold">
              گزارش مالی راننده{report ? ` — ${report.driverName}` : ""}
            </h3>
            <Button
              size="sm"
              variant="outline"
              className="cursor-pointer"
              onClick={() => setReportDriver(null)}
            >
              بستن گزارش
            </Button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <JalaliDateField label="از تاریخ (شمسی)" value={reportFrom} onChange={setReportFrom} />
            <JalaliDateField label="تا تاریخ (شمسی)" value={reportTo} onChange={setReportTo} />
          </div>
          {report && (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="سفرهای پایان‌یافته" value={faDigits(String(report.tripCount))} />
              <Stat label="مبالغ وصولی از مسافران" value={toman(report.collected)} />
              <Stat label="کمیسیون سفریار" value={toman(report.commission)} tone="text-brand-saffron-deep" />
              <Stat label="سهم خالص راننده" value={toman(report.driverShare)} tone="text-brand-teal" />
              <Stat label="کمیسیون کسرشده از کیف پول" value={toman(report.commissionDeducted)} />
              <Stat label="کمیسیون ثبت‌شده به‌عنوان بدهی" value={toman(report.commissionRegistered)} />
              <Stat label="پرداخت نقدی راننده" value={toman(report.commissionPaidByDriver)} />
              <Stat label="تسویه‌های انجام‌شده" value={toman(report.settlements)} />
            </div>
          )}
        </div>
      )}

      {tab === "wallets" && wallets && (
        <ul className="space-y-2">
          {wallets.rows.length === 0 && (
            <li className="trip-row text-sm text-muted-foreground">کیف پولی ثبت نشده است.</li>
          )}
          {wallets.rows.map(({ wallet, driverName, driverPhone, recentTransactions }) => {
            const pending = recentTransactions.filter(
              (t) => t.type === "withdrawal" && t.status === "pending",
            );
            return (
              <li key={wallet._id} className="trip-row">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {driverName}
                      {driverPhone ? (
                        <span className="mr-2 text-xs font-normal text-muted-foreground" dir="ltr">
                          {faDigits(driverPhone)}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 flex flex-wrap gap-1.5">
                      <span className="chip">موجودی {toman(wallet.balance)}</span>
                      <span className="chip">ناخالص {toman(wallet.grossEarnings)}</span>
                      <span className="chip">کمیسیون پرداخت‌شده {toman(wallet.commissionPaid)}</span>
                      <span className="chip">کمیسیون پرداخت‌نشده {toman(wallet.commissionUnpaid)}</span>
                      <span className="chip">بدهی {toman(wallet.debt)}</span>
                      <span className="chip">برداشت {toman(wallet.totalWithdrawn)}</span>
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="cursor-pointer"
                    onClick={() => {
                      setReportDriver(wallet.driverId);
                      if (reportFrom === null) setReportFrom(Date.now() - 30 * 86_400_000);
                      if (reportTo === null) setReportTo(Date.now());
                    }}
                  >
                    گزارش مالی این راننده
                  </Button>
                </div>
                {pending.length > 0 && (
                  <ul className="mt-3 space-y-2 border-t border-border/60 pt-3">
                    {pending.map((t) => (
                      <li key={t._id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span>
                          درخواست برداشت {toman(Math.abs(t.amount))} — {faDate(t.createdAt)}
                        </span>
                        <span className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="cursor-pointer"
                            disabled={busy !== null}
                            onClick={() =>
                              void run(`wr-${t._id}`, () =>
                                reviewWithdrawal({ transactionId: t._id, decision: "rejected" }),
                              )
                            }
                          >
                            رد
                          </Button>
                          <Button
                            size="sm"
                            className="cursor-pointer"
                            disabled={busy !== null}
                            onClick={() =>
                              void run(
                                `wc-${t._id}`,
                                () =>
                                  reviewWithdrawal({
                                    transactionId: t._id,
                                    decision: "confirmed",
                                  }),
                                "برداشت تأیید شد.",
                              )
                            }
                          >
                            تأیید و واریز
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* تنظیمات */}
      {tab === "settings" && settings && (
        <div className="trip-row">
          {form === null && (
            <p className="mb-3 text-sm text-muted-foreground">
              مقادیر فعلی از تنظیمات پایگاه داده خوانده شده‌اند؛ پس از تغییر، ذخیره کنید.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                ["baseRatePerKm", "نرخ پایه هر کیلومتر (تومان)", settings.baseRatePerKm],
                ["surchargeNight", "افزایش شب (هر کیلومتر)", settings.surchargeNight],
                ["surchargeRain", "افزایش بارندگی", settings.surchargeRain],
                ["surchargeSnow", "افزایش برف", settings.surchargeSnow],
                ["surchargeMountain", "افزایش مسیر کوهستانی", settings.surchargeMountain],
                ["nightStartHour", "ساعت شروع شب", settings.nightStartHour],
                ["nightEndHour", "ساعت پایان شب", settings.nightEndHour],
                ["mountainGainM", "آستانه ارتفاع (متر)", settings.mountainGainM],
                ["commissionPercent", "درصد کمیسیون", settings.commissionPercent],
                ["commissionFixed", "کمیسیون ثابت (تومان)", settings.commissionFixed],
                ["tripExpiryMinutes", "انقضای سفر (دقیقه)", settings.tripExpiryMinutes],
              ] as [string, string, number][]
            ).map(([key, label, fallback]) => (
              <div key={key}>
                <label className="label-fa">{label}</label>
                <input
                  type="number"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={formValue(key, fallback)}
                  onChange={(e) => setForm({ ...(form ?? {}), [key]: e.target.value })}
                />
              </div>
            ))}
          </div>

          {/* روش‌های مستقل وصول کمیسیون */}
          <div className="mt-6 rounded-xl border border-border/70 p-4">
            <h3 className="text-sm font-bold">روش‌های وصول کمیسیون</h3>
            <p className="hint-fa">هر دو روش می‌توانند هم‌زمان فعال باشند.</p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border/60 p-3">
                <input
                  type="checkbox"
                  className="mt-1 size-4"
                  checked={autoCommission}
                  onChange={(e) =>
                    setToggles({ ...(toggles ?? {}), autoCommissionEnabled: e.target.checked })
                  }
                />
                <span>
                  <span className="block text-sm font-bold">
                    روش اول — کسر خودکار پس از هر سفر
                  </span>
                  <span className="mt-1 block text-xs leading-6 text-muted-foreground">
                    پس از پایان سفر، کمیسیون محاسبه و از موجودی کیف پول کسر می‌شود؛ اگر موجودی
                    کافی نباشد، مابه‌التفاوت به‌عنوان بدهی ثبت می‌شود.
                  </span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border/60 p-3">
                <input
                  type="checkbox"
                  className="mt-1 size-4"
                  checked={walletTopup}
                  onChange={(e) =>
                    setToggles({ ...(toggles ?? {}), walletTopupRequired: e.target.checked })
                  }
                />
                <span>
                  <span className="block text-sm font-bold">
                    روش دوم — شارژ کیف پول پیش از پذیرش سفر
                  </span>
                  <span className="mt-1 block text-xs leading-6 text-muted-foreground">
                    راننده برای پذیرش سفر باید حداقل موجودی تعیین‌شده را داشته باشد و کمیسیون
                    سفرها از اعتبار کیف پول کسر شود.
                  </span>
                </span>
              </label>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label-fa">حداقل موجودی برای پذیرش سفر (تومان)</label>
                <input
                  type="number"
                  min={0}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={formValue("minAcceptanceBalance", settings.minAcceptanceBalance ?? 0)}
                  onChange={(e) => setForm({ ...(form ?? {}), minAcceptanceBalance: e.target.value })}
                />
              </div>
              <div>
                <label className="label-fa">نحوه برخورد با بدهی کمیسیون</label>
                <select
                  dir="rtl"
                  className="h-9 w-full cursor-pointer rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={debtPolicy}
                  onChange={(e) =>
                    setToggles({
                      ...(toggles ?? {}),
                      debtBlock: e.target.value === "block",
                    })
                  }
                >
                  <option value="block">مسدود کردن پذیرش سفر تا تسویه بدهی</option>
                  <option value="allow">ادامه پذیرش سفر با وجود بدهی</option>
                </select>
              </div>
            </div>
          </div>

          {/* حساب مقصد کمیسیون — فقط در همین بخش مدیریت */}
          <div className="mt-6 rounded-xl border border-border/70 p-4">
            <h3 className="text-sm font-bold">حساب مقصد دریافت کمیسیون</h3>
            <p className="hint-fa">
              این اطلاعات فقط در این بخش امن نگهداری می‌شود، هرگز به رانندگان یا گزارش‌های
              عمومی نمایش داده نمی‌شود و ارقام آن در سوابق تغییرات ثبت نمی‌شود.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label-fa">نام بانک</label>
                <input
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={payoutValue("bankName")}
                  onChange={(e) => setPayoutForm({ ...(payoutForm ?? {}), bankName: e.target.value })}
                />
              </div>
              <div>
                <label className="label-fa">به نام</label>
                <input
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={payoutValue("accountHolder")}
                  onChange={(e) =>
                    setPayoutForm({ ...(payoutForm ?? {}), accountHolder: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="label-fa">شماره کارت (اختیاری)</label>
                <input
                  dir="ltr"
                  inputMode="numeric"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={payoutValue("cardNumber")}
                  onChange={(e) =>
                    setPayoutForm({ ...(payoutForm ?? {}), cardNumber: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="label-fa">توضیح (اختیاری)</label>
                <input
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={payoutValue("note")}
                  onChange={(e) => setPayoutForm({ ...(payoutForm ?? {}), note: e.target.value })}
                />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button
                className="cursor-pointer"
                disabled={busy !== null}
                onClick={() => void savePayout()}
              >
                {busy === "payout" ? "در حال ذخیره…" : "ذخیره اطلاعات حساب مقصد"}
              </Button>
              {settings.paymentProvider === "not_connected" && (
                <p className="text-xs text-muted-foreground">
                  درگاه پرداخت متصل نیست؛ تا زمان اتصال، دریافت واقعی وجه فقط از مسیر «واریز
                  دستی پس از تأیید مدیر» انجام می‌شود.
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>روش وصول: {settings.commissionMethod}</span>
            <span>مبنا: {settings.commissionBasis}</span>
            <span>سرویس نقشه: {settings.mapProvider}</span>
            <span>سرویس پیامک: {settings.smsProvider}</span>
            <span>سرویس پرداخت: {settings.paymentProvider}</span>
          </div>
          <Button
            className="mt-4 cursor-pointer"
            disabled={busy !== null}
            onClick={() => void saveSettings()}
          >
            {busy === "settings" ? "در حال ذخیره…" : "ذخیره تنظیمات"}
          </Button>
        </div>
      )}

      {/* سوابق */}
      {tab === "audit" && auditLog && (
        <ul className="space-y-2">
          {auditLog.rows.length === 0 && (
            <li className="trip-row text-sm text-muted-foreground">رویدادی ثبت نشده است.</li>
          )}
          {auditLog.rows.map((row) => (
            <li key={row._id} className="rounded-lg border border-border/60 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{row.summary}</span>
                <span className="text-xs text-muted-foreground">{faRelative(row.createdAt)}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {row.action} — توسط {row.actorName}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
