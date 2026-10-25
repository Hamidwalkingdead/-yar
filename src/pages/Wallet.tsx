import { MoneyStat, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { paymentTrackingCode } from "@/convex/lib/ledger";
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
  ArrowDownToLine,
  CirclePlus,
  CreditCard,
  Loader2,
  ReceiptText,
  Wallet as WalletIcon,
} from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";

const TXN_TYPE: Record<string, string> = {
  earning: "درآمد سفر",
  commission: "کمیسیون",
  settlement: "تسویه کمیسیون",
  withdrawal: "برداشت",
  adjustment: "اصلاح دستی مدیر",
  deposit: "واریز",
};

const TXN_STATUS: Record<string, string> = {
  pending: "در انتظار",
  confirmed: "تأییدشده",
  failed: "ناموفق",
};

const SETTLEMENT_STATUS: Record<string, string> = {
  requested: "در انتظار تأیید مدیر",
  approved: "تأییدشده",
  rejected: "ردشده",
  paid: "پرداخت‌شده",
};

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-black tracking-tight">
      {icon}
      {children}
    </h2>
  );
}

export default function WalletPage() {
  const data = useQuery(api.wallet.summary);
  const payFromWallet = useMutation(api.wallet.payCommissionFromWallet);
  const payViaGateway = useMutation(api.wallet.payCommissionViaGateway);
  const requestTopup = useMutation(api.wallet.requestTopup);
  const requestWithdrawal = useMutation(api.wallet.requestWithdrawal);
  const requestSettlement = useMutation(api.wallet.requestSettlement);
  const cancelSettlement = useMutation(api.wallet.cancelSettlement);
  const claimAdmin = useMutation(api.settings.claimAdmin);
  const adminExists = useQuery(api.settings.adminExists);

  const [amount, setAmount] = useState("");
  const [topupAmount, setTopupAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  if (data === undefined) {
    return (
      <div className="mx-auto w-full max-w-4xl px-3 pt-6 sm:px-6">
        <div className="trip-row animate-pulse">
          <div className="h-5 w-40 rounded bg-muted" />
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 rounded-lg bg-muted" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const wallet = data.wallet;
  const parsed = Number(amount.replace(/[^\d]/g, ""));
  const topupParsed = Number(topupAmount.replace(/[^\d]/g, ""));

  const run = async (label: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(label);
    try {
      const result = (await fn()) as { ok?: boolean; message?: string };
      if (result?.ok === false) notifyError(result.message ?? "عملیات انجام نشد.");
      else if (ok) notifySuccess(ok);
      setAmount("");
      setTopupAmount("");
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-3 pt-5 sm:px-6 sm:pt-8">
      <PageHeader
        title="کیف پول و تسویه‌حساب"
        description={
          data.isDriver
            ? data.driverStatus === "approved"
              ? "درآمد، کمیسیون و تراکنش‌های شما به‌صورت شفاف ثبت می‌شود."
              : "وضعیت شما در انتظار تأیید مدارک است؛ درآمد پس از تأیید فعال می‌شود."
            : "کیف پول ویژه رانندگان است. برای دسترسی، با نقش راننده ثبت‌نام کنید و مدارک‌تان تأیید شود."
        }
        action={
          adminExists === false ? (
            <Button
              variant="outline"
              size="sm"
              className="cursor-pointer"
              disabled={busy !== null}
              onClick={() =>
                void run("claim", () => claimAdmin({}), "شما به‌عنوان نخستین مدیر ثبت شدید.")
              }
            >
              فعال‌سازی پنل مدیریت
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MoneyStat label="موجودی کیف پول" value={wallet ? toman(wallet.balance) : "۰ تومان"} tone="positive" />
        <MoneyStat label="درآمد ناخالص" value={wallet ? toman(wallet.grossEarnings) : "۰ تومان"} />
        <MoneyStat label="کمیسیون پرداخت‌شده" value={wallet ? toman(wallet.commissionPaid) : "۰ تومان"} />
        <MoneyStat
          label="کمیسیون پرداخت‌نشده"
          value={wallet ? toman(wallet.commissionUnpaid) : "۰ تومان"}
          tone={wallet && wallet.commissionUnpaid > 0 ? "warn" : "default"}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MoneyStat label="کل برداشت" value={wallet ? toman(wallet.totalWithdrawn) : "۰ تومان"} />
        <MoneyStat
          label="بدهی"
          value={wallet ? toman(wallet.debt) : "۰ تومان"}
          tone={wallet && wallet.debt > 0 ? "warn" : "default"}
        />
        <MoneyStat label="سفرهای پایان‌یافته" value={faDigits(String(data.tripCount))} />
        <MoneyStat label="روش وصول کمیسیون" value={data.settings.commissionMethod === "wallet" ? "کیف پول" : data.settings.commissionMethod === "gateway" ? "درگاه" : data.settings.commissionMethod === "periodic" ? "دوره‌ای" : "بدهی"} />
      </div>

      {data.settings.paymentProvider === "not_connected" && (
        <p className="alert-warn mt-4">
          درگاه پرداخت اینترنتی متصل نیست؛ پرداخت آنلاین ثبت می‌شود اما تأیید نمی‌شود و موجودی
          افزایش نمی‌یابد. روش وصول کمیسیون را مدیر از پنل مدیریت تعیین می‌کند.
        </p>
      )}

      {data.acceptanceGate.blocked && (
        <p className="alert-error mt-4">{data.acceptanceGate.reason}</p>
      )}
      {data.acceptanceGate.walletTopupRequired && !data.acceptanceGate.blocked && (
        <p className="hint-fa mt-2">
          برای پذیرش سفر باید حداقل {toman(data.acceptanceGate.minAcceptanceBalance)} موجودی
          کیف پول داشته باشید.
        </p>
      )}

      {/* عملیات مالی */}
      {data.isDriver && wallet && (
        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          <div className="trip-row">
            <SectionTitle icon={<CreditCard className="size-4 text-brand-teal" />}>
              پرداخت کمیسیون
            </SectionTitle>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">
              مبلغ قابل پرداخت: <b>{toman(wallet.commissionUnpaid)}</b>
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                className="flex-1 cursor-pointer"
                disabled={wallet.commissionUnpaid <= 0 || busy !== null}
                onClick={() =>
                  void run(
                    "payWallet",
                    () => payFromWallet({}),
                    "کمیسیون از موجودی کیف پول کسر شد.",
                  )
                }
              >
                {busy === "payWallet" ? <Loader2 className="size-4 animate-spin" /> : null}
                پرداخت از کیف پول
              </Button>
              <Button
                variant="outline"
                className="flex-1 cursor-pointer"
                disabled={wallet.commissionUnpaid <= 0 || busy !== null}
                onClick={() => void run("payGateway", () => payViaGateway({ amount: wallet.commissionUnpaid }))}
              >
                پرداخت اینترنتی
              </Button>
            </div>
            <div className="mt-3 border-t border-border/60 pt-3">
              <Button
                variant="outline"
                size="sm"
                className="cursor-pointer w-full"
                disabled={wallet.commissionUnpaid <= 0 || busy !== null}
                onClick={() =>
                  void run("settle", () => requestSettlement({}), "درخواست تسویه ثبت شد.")
                }
              >
                درخواست تسویه دوره‌ای
              </Button>
            </div>
          </div>

          <div className="trip-row">
            <SectionTitle icon={<CirclePlus className="size-4 text-brand-teal" />}>
              افزایش اعتبار کیف پول
            </SectionTitle>
            <label className="label-fa mt-3">مبلغ شارژ (تومان)</label>
            <div className="flex gap-2">
              <input
                type="number"
                min={10000}
                className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="مثلاً ۵۰۰۰۰۰"
                value={topupAmount}
                onChange={(e) => setTopupAmount(e.target.value)}
              />
              <Button
                className="cursor-pointer"
                disabled={!topupParsed || topupParsed <= 0 || busy !== null}
                onClick={() =>
                  void run("topup", () => requestTopup({ amount: topupParsed }))
                }
              >
                {busy === "topup" ? <Loader2 className="size-4 animate-spin" /> : null}
                شارژ کیف پول
              </Button>
            </div>
            <p className="hint-fa">
              پرداخت اینترنتی فقط پس از اتصال درگاه تأیید می‌شود؛ تا آن زمان هیچ مبلغی به موجودی
              افزوده نمی‌شود. واریز دستی نیز پس از تأیید مدیر اعمال می‌شود.
            </p>
          </div>

          <div className="trip-row">
            <SectionTitle icon={<ArrowDownToLine className="size-4 text-brand-teal" />}>
              برداشت از کیف پول
            </SectionTitle>
            <label className="label-fa mt-3">مبلغ برداشت (تومان)</label>
            <div className="flex gap-2">
              <input
                type="number"
                min={1000}
                className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="مثلاً ۵۰۰۰۰۰"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <Button
                className="cursor-pointer"
                disabled={!parsed || parsed <= 0 || busy !== null}
                onClick={() =>
                  void run(
                    "withdraw",
                    () => requestWithdrawal({ amount: parsed }),
                    "درخواست برداشت ثبت شد و در انتظار تأیید مدیر است.",
                  )
                }
              >
                {busy === "withdraw" ? <Loader2 className="size-4 animate-spin" /> : null}
                ثبت درخواست
              </Button>
            </div>
            <p className="hint-fa">
              برداشت پس از تأیید مدیر به‌صورت دستی واریز می‌شود؛ تا زمان تأیید، مبلغ
              کسرشده به‌صورت «در انتظار» ثبت است.
            </p>
          </div>
        </div>
      )}

      {/* تسویه‌ها */}
      {data.settlements.length > 0 && (
        <div className="trip-row mt-5">
          <SectionTitle icon={<ReceiptText className="size-4 text-brand-teal" />}>
            درخواست‌های تسویه
          </SectionTitle>
          <ul className="mt-3 space-y-2">
            {data.settlements.map((s) => (
              <li
                key={s._id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 p-3 text-sm"
              >
                <div>
                  <p className="font-semibold">{toman(s.amount)}</p>
                  <p className="text-xs text-muted-foreground">
                    {faDate(s.periodFrom)} تا {faDate(s.periodTo)} — {faDate(s.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="chip">{SETTLEMENT_STATUS[s.status] ?? s.status}</span>
                  {s.status === "requested" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="cursor-pointer"
                      disabled={busy !== null}
                      onClick={() =>
                        void run("cancelSettle", () => cancelSettlement({ settlementId: s._id }), "درخواست لغو شد.")
                      }
                    >
                      انصراف
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* تراکنش‌ها */}
      <div className="trip-row mt-5">
        <SectionTitle icon={<WalletIcon className="size-4 text-brand-teal" />}>
          آخرین تراکنش‌ها
        </SectionTitle>
        {!wallet || data.transactions.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            هنوز تراکنشی ثبت نشده است. پس از پایان اولین سفر، درآمد اینجا نمایش داده
            می‌شود.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border/60">
            {data.transactions.map((t) => (
              <li key={t._id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {t.description || (TXN_TYPE[t.type] ?? t.type)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {faRelative(t.createdAt)} — {TXN_STATUS[t.status] ?? t.status}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 text-sm font-black",
                    t.amount >= 0 ? "text-brand-teal" : "text-brand-saffron-deep",
                  )}
                  dir="ltr"
                >
                  {t.amount >= 0 ? "+" : "−"}
                  {faDigits(Math.abs(t.amount).toLocaleString("en-US"))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* پرداخت‌ها */}
      {data.payments.length > 0 && (
        <div className="trip-row mt-4">
          <SectionTitle icon={<CreditCard className="size-4 text-brand-teal" />}>
            سوابق پرداخت
          </SectionTitle>
          <ul className="mt-3 space-y-2 text-sm">
            {data.payments.map((p) => (
              <li key={p._id} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                <span>
                  {toman(p.amount)} — {p.kind === "topup" ? "شارژ کیف پول" : p.kind === "settlement" ? "تسویه" : "کمیسیون"}
                  {" — "}
                  {p.provider === "wallet"
                    ? "از کیف پول"
                    : p.provider === "gateway"
                      ? "درگاه اینترنتی"
                      : "واریز دستی"}
                  <span className="mr-2 text-[11px] text-muted-foreground" dir="ltr">
                    {paymentTrackingCode(p._id)}
                  </span>
                </span>
                <span className="chip">
                  {p.status === "not_connected"
                    ? "درگاه متصل نیست"
                    : p.status === "confirmed"
                      ? "تأییدشده"
                      : p.status === "failed"
                        ? "ناموفق"
                        : "در انتظار"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
