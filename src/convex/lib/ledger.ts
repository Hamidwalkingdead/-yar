/**
 * منطق خالص دفتر مالی سفریار.
 *
 * تمام توابع این فایل بدون دسترسی به شبکه یا پایگاه داده‌اند تا هم در سرور
 * (هنگام پایان سفر، شارژ کیف پول و تطبیق دفتر) و هم در آزمون‌ها استفاده شوند.
 * هیچ مبلغی از سمت کلاینت پذیرفته نمی‌شود؛ ورودی‌ها همیشه از سند سرور می‌آیند.
 */

export interface WalletAmounts {
  balance: number;
  grossEarnings: number;
  netEarnings: number;
  commissionUnpaid: number;
  commissionPaid: number;
  debt: number;
}

export type CommissionOutcome =
  /** کمیسیون از موجودی کیف پول کسر شد */
  | "deducted"
  /** موجودی کافی نبود (یا روش کسر خودکار خاموش است)؛ به‌عنوان بدهی ثبت شد */
  | "registered_as_debt"
  /** برای این سفر کمیسیونی به راننده تعلق نمی‌گیرد */
  | "no_charge";

export interface TripSettlementInput {
  /** مبلغ وصولی سفر (تعداد مسافران × کرایه هر مسافر) */
  collected: number;
  /** سهم کمیسیون سفریار که باید از راننده گرفته شود */
  chargedToDriver: number;
  /** آیا روش «کسر خودکار پس از هر سفر» فعال است؟ */
  autoDeduct: boolean;
}

export interface TripSettlementResult {
  outcome: CommissionOutcome;
  /** تغییراتی که باید روی سند کیف پول اعمال شود */
  patch: Partial<WalletAmounts> & { status?: "active" | "debt" };
  driverNet: number;
  charged: number;
}

/**
 * اعمال درآمد سفر و کسر کمیسیون روی کیف پول.
 * قواعد:
 * - کرایه را مسافر به راننده می‌پردازد؛ بنابراین کافی بودن موجودی با «موجودی
 *   پیش‌پرداخت‌شده کیف پول» (مانده پیش از همین سفر) سنجیده می‌شود، نه با خود کرایه.
 * - کمیسیون هرگز از مبلغ سفر بیشتر نمی‌شود (سقف: عایدی همان سفر).
 * - اگر موجودی کافی نباشد یا کسر خودکار خاموش باشد، مبلغ به‌عنوان بدهی ثبت می‌شود.
 */
export function settleTripInWallet(
  wallet: WalletAmounts,
  input: TripSettlementInput,
): TripSettlementResult {
  const collected = Math.max(0, Math.round(input.collected));
  const charged = Math.max(0, Math.min(Math.round(input.chargedToDriver), collected));
  const driverNet = Math.max(0, collected - charged);

  const base: Partial<WalletAmounts> = {
    balance: wallet.balance + collected,
    grossEarnings: wallet.grossEarnings + collected,
    netEarnings: wallet.netEarnings + driverNet,
  };

  if (charged === 0) {
    return { outcome: "no_charge", patch: base, driverNet, charged: 0 };
  }

  const canDeduct = input.autoDeduct && wallet.balance >= charged;
  if (canDeduct) {
    return {
      outcome: "deducted",
      patch: {
        ...base,
        balance: wallet.balance + collected - charged,
        commissionPaid: wallet.commissionPaid + charged,
      },
      driverNet,
      charged,
    };
  }

  return {
    outcome: "registered_as_debt",
    patch: {
      ...base,
      commissionUnpaid: wallet.commissionUnpaid + charged,
      debt: wallet.debt + charged,
      status: "debt",
    },
    driverNet,
    charged,
  };
}

/**
 * آیا کمیسیون این سفر باید به‌صورت خودکار از کیف پول کسر شود؟
 * هر دو روش (کسر خودکار پس از سفر و شارژ کیف پول) می‌توانند هم‌زمان فعال باشند.
 */
export function shouldAutoDeduct(input: {
  commissionMethod: string;
  autoCommissionEnabled: boolean;
  walletTopupRequired: boolean;
}): boolean {
  return (
    input.commissionMethod === "wallet" ||
    input.autoCommissionEnabled ||
    input.walletTopupRequired
  );
}

/**
 * شناسه یکتای پرداخت شارژ کیف پول؛ کلیک‌های تکراری در یک پنجره کوتاه
 * همان پرداخت قبلی را برمی‌گردانند تا رکورد تکراری ساخته نشود.
 */
export function topupIdempotencyKey(
  walletId: string,
  amount: number,
  now: number,
  windowMs = 5 * 60_000,
): string {
  return `topup:gateway:${walletId}:${amount}:${Math.floor(now / windowMs)}`;
}

/** کد پیگیری نمایش‌داده‌شده به کاربر — بدون افشای شناسه داخلی */
export function paymentTrackingCode(paymentId: string): string {
  return `SPY-${paymentId.slice(-8).toUpperCase()}`;
}

export interface LedgerRow {
  type: string;
  amount: number;
  affectsBalance: boolean;
  status: string;
}

export interface WalletTotals {
  balance: number;
  commissionPaid: number;
  commissionUnpaid: number;
}

export interface ReconciliationResult {
  computedBalance: number;
  deltaBalance: number;
  computedCommissionPaid: number;
  deltaCommissionPaid: number;
  computedUnpaid: number;
  deltaUnpaid: number;
  ok: boolean;
}

/**
 * تطبیق مانده کیف پول و کمیسیون با دفتر تراکنش‌ها.
 * قواعد دفتر:
 * - موجودی: مجموع تراکنش‌هایی که روی موجودی اثر می‌گذارند (برداشت «در انتظار»
 *   هم موجودی را کم کرده است)؛ ردشده‌ها و ناموفق‌ها حساب نمی‌شوند.
 * - کمیسیون پرداخت‌شده: مجموع کسورات قطعی کمیسیون، پرداخت‌های راننده و تسویه‌ها.
 * - کمیسیون پرداخت‌نشده: بدهی‌های ثبت‌شده منهای پرداخت/تسویه (حداقل صفر).
 *   کسر خودکار در پایان سفر هرگز بدهی ثبت نمی‌کند، پس در این معادله نمی‌آید.
 */
export function reconcileWallet(rows: LedgerRow[], wallet: WalletTotals): ReconciliationResult {
  const countedForBalance = rows.filter(
    (r) => r.affectsBalance && (r.status === "pending" || r.status === "confirmed"),
  );
  const computedBalance = countedForBalance.reduce((total, r) => total + r.amount, 0);

  const paid = rows
    .filter(
      (r) =>
        r.status === "confirmed" &&
        (r.type === "commission" || r.type === "commission_payment" || r.type === "settlement"),
    )
    .reduce((total, r) => total + Math.abs(r.amount), 0);

  const registeredDue = rows
    .filter((r) => r.type === "commission_due" && r.status !== "rejected")
    .reduce((total, r) => total + r.amount, 0);

  const clearedDue = rows
    .filter(
      (r) =>
        r.status === "confirmed" &&
        (r.type === "commission_payment" || r.type === "settlement"),
    )
    .reduce((total, r) => total + Math.abs(r.amount), 0);

  const computedUnpaid = Math.max(0, registeredDue - clearedDue);

  const deltaBalance = wallet.balance - computedBalance;
  const deltaCommissionPaid = wallet.commissionPaid - paid;
  const deltaUnpaid = wallet.commissionUnpaid - computedUnpaid;

  return {
    computedBalance,
    deltaBalance,
    computedCommissionPaid: paid,
    deltaCommissionPaid,
    computedUnpaid,
    deltaUnpaid,
    ok: deltaBalance === 0 && deltaCommissionPaid === 0 && deltaUnpaid === 0,
  };
}
