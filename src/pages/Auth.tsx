import { BrandMark, Wordmark } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { toFaDigits } from "@/lib/fa";
import { useQuery } from "convex/react";
import { ArrowLeft, Loader2, Smartphone, TriangleAlert } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(returnTo: string | null, fallback = "/dashboard") {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

/** فرمت شماره ایران برای نمایش: ۰۹۱۲ ۳۴۵ ۶۷۸۹ */
function formatFaPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 4) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 11)}`;
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );
  const presetRole = searchParams.get("role") === "driver" ? "driver" : "passenger";

  const [step, setStep] = useState<"phone" | { phone: string }>("phone");
  const [role, setRole] = useState<"passenger" | "driver">(presetRole);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // وضعیت سرویس پیامک برای شماره‌ای که کد برایش ارسال شده
  const otpPhone = typeof step === "object" ? step.phone : null;
  const smsStatus = useQuery(
    api.sms.status,
    otpPhone ? { phone: otpPhone } : "skip",
  );
  const otpInfo =
    otpPhone && smsStatus?.code
      ? `سرویس پیامک متصل نیست — کد آزمایشی: ${toFaDigits(smsStatus.code)}`
      : null;

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

  const normalized = phone.replace(/\D/g, "");
  const phoneValid = /^09\d{9}$/.test(normalized);

  const sendOtp = async (target: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("phone", target);
      await signIn("phone-otp", formData);
      setStep({ phone: target });
    } catch (err) {
      console.error("phone sign-in error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "ارسال کد پیامکی ممکن نشد. دوباره تلاش کنید.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handlePhoneSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!phoneValid || isLoading) return;
    void sendOtp(normalized);
  };

  const handleResend = () => {
    if (typeof step !== "object" || isLoading) return;
    void sendOtp(step.phone);
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (otp.length !== 6 || isLoading || typeof step !== "object") return;
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("phone", step.phone);
      formData.set("code", otp);
      await signIn("phone-otp", formData);
      // نقش انتخاب‌شده در این صفحه به دروازه تکمیل پروفایل منتقل می‌شود
      // تا کاربر دوباره مجبور به انتخاب نشود.
      try {
        sessionStorage.setItem("safaryar:role", role);
      } catch {
        // حافظه در دسترس نیست — دروازه بعداً خودش نقش را می‌پرسد
      }
      navigate(redirect);
    } catch (err) {
      console.error("OTP verification error:", err);
      setError("کد واردشده نادرست یا منقضی شده است.");
      setOtp("");
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
          <Wordmark onClick={() => navigate("/")} />
          <Button
            variant="ghost"
            size="sm"
            className="cursor-pointer gap-1.5 text-muted-foreground"
            onClick={() => navigate("/")}
          >
            بازگشت به صفحه اصلی
            <ArrowLeft className="size-4" />
          </Button>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md shadow-lg">
          {step === "phone" ? (
            <>
              <CardHeader className="text-center">
                <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-brand-teal text-white">
                  <Smartphone className="size-6" />
                </div>
                <CardTitle className="mt-4 text-xl font-black tracking-tight">
                  ورود و ثبت‌نام با شماره موبایل
                </CardTitle>
                <CardDescription className="leading-7">
                  شماره‌تان را وارد کنید، کد شش‌رقمی پیامکی برایتان ارسال می‌شود.
                </CardDescription>
              </CardHeader>
              <form onSubmit={handlePhoneSubmit}>
                <CardContent className="space-y-5">
                  <fieldset className="space-y-2">
                    <legend className="mb-2 text-sm font-semibold">نقش شما</legend>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          { id: "passenger", label: "مسافر", hint: "جست‌وجو و درخواست سفر" },
                          { id: "driver", label: "راننده", hint: "ثبت سفر و پذیرش" },
                        ] as const
                      ).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          disabled={isLoading}
                          onClick={() => setRole(item.id)}
                          className={`cursor-pointer rounded-xl border p-3 text-right transition-colors ${
                            role === item.id
                              ? "border-brand-teal bg-brand-teal-soft"
                              : "border-border bg-card hover:border-primary/40"
                          }`}
                        >
                          <span className="block text-sm font-bold">{item.label}</span>
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            {item.hint}
                          </span>
                        </button>
                      ))}
                    </div>
                    <p className="hint-fa">
                      نقش پس از اولین ورود یک‌بار ثبت می‌شود؛ راننده پس از تأیید
                      مدیر می‌تواند سفر ثبت کند.
                    </p>
                  </fieldset>

                  <div className="space-y-2">
                    <label htmlFor="phone" className="text-sm font-semibold">
                      شماره موبایل
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1" dir="ltr">
                        <Input
                          id="phone"
                          name="phone"
                          inputMode="numeric"
                          autoComplete="tel"
                          placeholder="09123456789"
                          className="text-left"
                          value={formatFaPhone(phone)}
                          onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                          disabled={isLoading}
                          required
                        />
                      </div>
                      <Button
                        type="submit"
                        className="cursor-pointer gap-1.5"
                        disabled={isLoading || !phoneValid}
                      >
                        {isLoading ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <>
                            ارسال کد
                            <ArrowLeft className="size-4" />
                          </>
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      شماره باید با ۰۹ شروع شود و ۱۱ رقم باشد ({toFaDigits("09123456789")}).
                    </p>
                  </div>

                  {error && (
                    <p className="alert-error">
                      <TriangleAlert className="size-4 shrink-0" />
                      {error}
                    </p>
                  )}
                </CardContent>
              </form>
            </>
          ) : (
            <>
              <CardHeader className="text-center">
                <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-brand-teal-soft text-brand-teal-deep">
                  <Smartphone className="size-6" />
                </div>
                <CardTitle className="mt-4 text-xl font-black tracking-tight">
                  کد تأیید را وارد کنید
                </CardTitle>
                <CardDescription className="leading-7">
                  کد شش‌رقمی به شماره{" "}
                  <span className="font-semibold text-foreground" dir="ltr">
                    {toFaDigits(step.phone)}
                  </span>{" "}
                  پیامک شد.
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleOtpSubmit}>
                <CardContent className="space-y-4">
                  <input type="hidden" name="phone" value={step.phone} />
                  <input type="hidden" name="code" value={otp} />

                  <div className="flex justify-center" dir="ltr">
                    <InputOTP
                      value={otp}
                      onChange={setOtp}
                      maxLength={6}
                      disabled={isLoading}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && otp.length === 6 && !isLoading) {
                          const form = (e.target as HTMLElement).closest("form");
                          if (form) form.requestSubmit();
                        }
                      }}
                    >
                      <InputOTPGroup>
                        {Array.from({ length: 6 }).map((_, index) => (
                          <InputOTPSlot key={index} index={index} />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>

                  {otpInfo && <p className="alert-warn">{otpInfo}</p>}
                  {error && (
                    <p className="alert-error">
                      <TriangleAlert className="size-4 shrink-0" />
                      {error}
                    </p>
                  )}
                </CardContent>
                <CardFooter className="flex-col gap-2">
                  <Button
                    type="submit"
                    className="w-full cursor-pointer gap-1.5"
                    disabled={isLoading || otp.length !== 6}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        در حال تأیید…
                      </>
                    ) : (
                      <>
                        تأیید و ورود
                        <ArrowLeft className="size-4" />
                      </>
                    )}
                  </Button>
                  <div className="flex w-full items-center justify-between text-xs">
                    <button
                      type="button"
                      className="cursor-pointer text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                      onClick={() => {
                        setStep("phone");
                        setOtp("");
                        setError(null);
                      }}
                      disabled={isLoading}
                    >
                      تغییر شماره
                    </button>
                    <button
                      type="button"
                      className="cursor-pointer text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                      onClick={handleResend}
                      disabled={isLoading}
                    >
                      ارسال دوباره کد
                    </button>
                  </div>
                </CardFooter>
              </form>
            </>
          )}

          <div className="flex items-center justify-center gap-2 rounded-b-xl border-t border-border/60 bg-muted/50 px-6 py-3 text-[11px] text-muted-foreground">
            <BrandMark className="size-3.5" />
            سفریار — احراز هویت با شماره موبایل
          </div>
        </Card>
      </main>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
