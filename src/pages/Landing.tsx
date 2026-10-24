import { BrandMark, Wordmark } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  BadgeCheck,
  Calculator,
  Clock,
  MapPin,
  Route,
  ShieldCheck,
  Wallet,
  ArrowUpRight,
} from "lucide-react";
import { useNavigate } from "react-router";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0 },
};

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const STEPS = [
  {
    n: "۱",
    title: "ثبت‌نام با شماره موبایل",
    body: "شماره‌تان را وارد می‌کنید، کد پیامکی را تأیید می‌کنید و نقش مسافر یا راننده را انتخاب می‌کنید.",
  },
  {
    n: "۲",
    title: "ثبت درخواست و پذیرش سفر",
    body: "مسافر مبدأ و مقصد را انتخاب می‌کند، راننده قیمت و کمیسیون را قبل از پذیرش می‌بیند و سفر را می‌پذیرد.",
  },
  {
    n: "۳",
    title: "محاسبه کرایه و تسویه",
    body: "کرایه از مسافت واقعی جاده محاسبه می‌شود، کمیسیون ثبت و در کیف پول راننده تسویه می‌شود.",
  },
];

const FEATURES = [
  {
    icon: Route,
    title: "مسافت واقعی جاده",
    body: "مسافت از مسیر قابل پیمایش محاسبه می‌شود، نه فاصله مستقیم دو نقطه. سرویس نقشه قابل تعویض است.",
  },
  {
    icon: Clock,
    title: "فهرست فشرده سفرها",
    body: "جست‌وجوی مبدأ و مقصد، مرتب‌سازی بر اساس زمان، فیلتر قیمت و مسافت و نمایش درخواست‌های جدید.",
  },
  {
    icon: BadgeCheck,
    title: "پذیرش قطعی یک‌باره",
    body: "پذیرش سمت سرور کنترل می‌شود؛ هر سفر فقط یک‌بار و بدون نقض ظرفیت خودرو پذیرفته می‌شود.",
  },
  {
    icon: Calculator,
    title: "قیمت شفاف",
    body: "نرخ پایه هر کیلومتر به افزایش شرایط سفر اضافه می‌شود و قیمت پیش از تأیید نمایش داده می‌شود.",
  },
  {
    icon: Wallet,
    title: "کیف پول و کمیسیون",
    body: "درآمد ناخالص و خالص، کمیسیون پرداخت‌شده و پرداخت‌نشده، برداشت‌ها و سابقه تراکنش‌ها ثبت می‌شود.",
  },
  {
    icon: ShieldCheck,
    title: "کنترل دسترسی",
    body: "اعتبارسنجی سمت سرور، جلوگیری از پذیرش و پرداخت تکراری و ثبت رویدادهای مالی در پایگاه داده.",
  },
];

const SURCHARGES = [
  { label: "روز عادی", value: "صفر تومان" },
  { label: "شب", value: "۱٬۰۰۰ تومان" },
  { label: "بارندگی", value: "۱٬۰۰۰ تومان" },
  { label: "برف", value: "۲٬۰۰۰ تومان" },
  { label: "مسیر کوهستانی", value: "۱٬۰۰۰ تومان" },
];

export default function Landing() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();
  const goAuth = () => navigate("/auth");
  const goApp = () => navigate("/dashboard");

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* نوار بالا */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Wordmark onClick={() => navigate("/")} />
          <nav className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex">
            <a href="#how" className="transition-colors hover:text-foreground">
              چطور کار می‌کند
            </a>
            <a href="#features" className="transition-colors hover:text-foreground">
              امکانات
            </a>
            <a href="#pricing" className="transition-colors hover:text-foreground">
              نرخ کرایه
            </a>
          </nav>
          <div className="flex items-center gap-2">
            {!isLoading && isAuthenticated ? (
              <Button size="sm" className="cursor-pointer gap-1.5" onClick={goApp}>
                ورود به سفریار
                <ArrowLeft className="size-4" />
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="cursor-pointer"
                  onClick={goAuth}
                >
                  ورود
                </Button>
                <Button size="sm" className="cursor-pointer gap-1.5" onClick={goAuth}>
                  ثبت‌نام
                  <ArrowLeft className="size-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* هدر اصلی */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to left, var(--color-brand-teal) 1px, transparent 1px), linear-gradient(to bottom, var(--color-brand-teal) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage:
              "radial-gradient(ellipse 80% 60% at 70% 0%, #000 40%, transparent 100%)",
          }}
        />
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="relative mx-auto w-full max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pb-24 sm:pt-20"
        >
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <motion.div variants={fadeUp} className="text-center lg:text-right">
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-teal/25 bg-brand-teal-soft px-3 py-1 text-xs font-semibold text-brand-teal-deep">
                <BrandMark className="size-4" />
                نسخه ۱٫۰ — ارتباط مسافر و راننده
              </span>
              <h1 className="mt-5 text-4xl font-black leading-[1.25] tracking-tight sm:text-5xl lg:text-[3.4rem]">
                سفر مشترک،
                <br />
                <span className="text-brand-teal">با قیمت شفاف</span> و تسویه
                روشن.
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-base leading-8 text-muted-foreground lg:mx-0 sm:text-lg">
                سفریار مسافر و راننده را به هم متصل می‌کند: ثبت درخواست سفر،
                مشاهده فهرست سفرها، محاسبه کرایه از مسافت واقعی جاده، مدیریت
                کمیسیون و تسویه‌حساب کیف پول.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
                <Button
                  size="lg"
                  className="cursor-pointer gap-2 px-7 text-base"
                  onClick={isAuthenticated ? goApp : goAuth}
                >
                  {isAuthenticated ? "رفتن به داشبورد" : "شروع رایگان"}
                  <ArrowLeft className="size-4" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="cursor-pointer px-7 text-base"
                  onClick={() => navigate("/auth?role=driver")}
                >
                  ثبت‌نام به‌عنوان راننده
                </Button>
              </div>
              <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 text-center lg:text-right">
                {[
                  { k: "نرخ پایه هر کیلومتر", v: "۱۱٬۵۰۰ تومان" },
                  { k: "کنترل پذیرش", v: "سمت سرور" },
                  { k: "زبان و جهت", v: "فارسی، راست‌چین" },
                ].map((item) => (
                  <div key={item.k} className="rounded-xl border border-border/70 bg-card p-3">
                    <dt className="text-[11px] text-muted-foreground">{item.k}</dt>
                    <dd className="mt-1 text-sm font-bold text-foreground">{item.v}</dd>
                  </div>
                ))}
              </dl>
            </motion.div>

            {/* پیش‌نمایش کارت سفر */}
            <motion.div variants={fadeUp} className="relative mx-auto w-full max-w-md">
              <div className="rounded-2xl border border-border/70 bg-card p-5">
                <div className="flex items-center justify-between">
                  <span className="chip bg-brand-teal-soft text-brand-teal-deep">
                    در انتظار پذیرش
                  </span>
                  <span className="text-xs text-muted-foreground">فردا ساعت ۱۸:۳۰</span>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-brand-teal" />
                    <div>
                      <p className="text-sm font-semibold">تهران، میدان آزادی</p>
                      <p className="text-xs text-muted-foreground">مبدأ</p>
                    </div>
                  </div>
                  <div className="mr-1 h-6 w-px border-r border-dashed border-border" />
                  <div className="flex items-start gap-3">
                    <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-brand-saffron-deep" />
                    <div>
                      <p className="text-sm font-semibold">اصفهان، میدان نقش‌جهان</p>
                      <p className="text-xs text-muted-foreground">مقصد</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border/70 pt-4 text-center">
                  <div>
                    <p className="text-[11px] text-muted-foreground">مسافت</p>
                    <p className="text-sm font-bold">۴۵۵ کیلومتر</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">قیمت کل</p>
                    <p className="text-sm font-bold">۵٬۲۳۲٬۵۰۰ تومان</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">درآمد خالص</p>
                    <p className="text-sm font-bold text-brand-teal">۴٬۷۰۹٬۲۵۰</p>
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <Button className="flex-1 cursor-pointer">پذیرش سفر</Button>
                  <Button variant="outline" className="flex-1 cursor-pointer">
                    جزئیات
                  </Button>
                </div>
                <p className="mt-3 text-center text-[11px] text-muted-foreground">
                  نمونه نمایشی از فهرست سفرها — ارقام واقعی از تنظیمات مدیر محاسبه می‌شود.
                </p>
              </div>

              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -bottom-6 -right-4 hidden rounded-xl border border-border/70 bg-card px-4 py-3 sm:block"
              >
                <p className="text-[11px] text-muted-foreground">کمیسیون سفریار</p>
                <p className="text-sm font-bold text-brand-saffron-deep">۱۰٪ — قابل تنظیم</p>
              </motion.div>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* نحوه کار */}
      <section id="how" className="border-y border-border/60 bg-muted/40 py-16 sm:py-20">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <motion.div
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
          >
            <motion.h2
              variants={fadeUp}
              className="text-2xl font-black tracking-tight sm:text-3xl"
            >
              در سه گام
            </motion.h2>
            <motion.p variants={fadeUp} className="mt-2 max-w-2xl text-muted-foreground">
              کل مسیر از ثبت‌نام تا تسویه‌حساب، بدون واسطه و با ثبت کامل رویدادها در
              پایگاه داده.
            </motion.p>
            <div className="mt-10 grid gap-5 sm:grid-cols-3">
              {STEPS.map((step) => (
                <motion.div
                  key={step.n}
                  variants={fadeUp}
                  className="rounded-2xl border border-border/70 bg-card p-6"
                >
                  <span className="flex size-10 items-center justify-center rounded-xl bg-brand-teal text-lg font-black text-white">
                    {step.n}
                  </span>
                  <h3 className="mt-4 text-lg font-bold tracking-tight">{step.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">{step.body}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* امکانات */}
      <section id="features" className="py-16 sm:py-20">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <motion.div
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
          >
            <motion.h2
              variants={fadeUp}
              className="text-2xl font-black tracking-tight sm:text-3xl"
            >
              آنچه در نسخه ۱ ساخته شده
            </motion.h2>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <motion.div
                  key={feature.title}
                  variants={fadeUp}
                  className="trip-row hover:border-primary/40"
                >
                  <div className="flex size-10 items-center justify-center rounded-lg bg-brand-teal-soft text-brand-teal-deep">
                    <feature.icon className="size-5" />
                  </div>
                  <h3 className="mt-4 font-bold tracking-tight">{feature.title}</h3>
                  <p className="mt-1.5 text-sm leading-7 text-muted-foreground">
                    {feature.body}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* نرخ کرایه */}
      <section id="pricing" className="border-y border-border/60 bg-muted/40 py-16 sm:py-20">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <motion.div
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            className="grid gap-10 lg:grid-cols-2 lg:items-start"
          >
            <motion.div variants={fadeUp}>
              <h2 className="text-2xl font-black tracking-tight sm:text-3xl">
                قیمت‌گذاری، از مسافت واقعی
              </h2>
              <p className="mt-3 max-w-xl leading-8 text-muted-foreground">
                نرخ نهایی هر کیلومتر برابر است با نرخ پایه به‌علاوه مجموع افزایش
                شرایط سفر. قیمت کل = مسافت واقعی مسیر × نرخ نهایی هر کیلومتر.
                افزایش‌ها روی هم جمع می‌شوند و قیمت پیش از تأیید سفر نمایش داده
                می‌شود.
              </p>

              <div className="mt-6 overflow-hidden rounded-2xl border border-border/70 bg-card">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-right font-medium">شرایط</th>
                      <th className="px-4 py-3 text-left font-medium">افزایش هر کیلومتر</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SURCHARGES.map((row) => (
                      <tr key={row.label} className="border-t border-border/60">
                        <td className="px-4 py-3 font-medium">{row.label}</td>
                        <td className="px-4 py-3 text-left text-muted-foreground">
                          {row.value}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="hint-fa">
                شرایط آب‌وهوا و ارتفاع مسیر از منابع معتبر دریافت می‌شود؛ اگر داده
                معتبر در دسترس نباشد، شرط اعمال نمی‌شود و هشدار آن نمایش داده
                می‌شود.
              </p>
            </motion.div>

            <motion.div variants={fadeUp} className="rounded-2xl border border-border/70 bg-card p-6">
              <div className="flex items-center gap-2">
                <Calculator className="size-5 text-brand-teal" />
                <h3 className="font-bold tracking-tight">مثال محاسبه</h3>
              </div>
              <div className="mt-5 space-y-3 text-sm">
                {[
                  ["مسافت سفر", "۱۰۰ کیلومتر"],
                  ["نرخ پایه", "۱۱٬۵۰۰ تومان"],
                  ["افزایش شب", "۱٬۰۰۰ تومان"],
                  ["افزایش بارندگی", "۱٬۰۰۰ تومان"],
                  ["نرخ نهایی هر کیلومتر", "۱۳٬۵۰۰ تومان"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between border-b border-border/60 pb-2">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="font-semibold">{v}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-1">
                  <span className="font-semibold">قیمت کل سفر</span>
                  <span className="text-xl font-black text-brand-teal">۱٬۳۵۰٬۰۰۰ تومان</span>
                </div>
              </div>

              <div className="mt-6 rounded-xl bg-brand-teal-soft/70 p-4">
                <div className="flex items-center gap-2 text-brand-teal-deep">
                  <BadgeCheck className="size-4" />
                  <p className="text-sm font-bold">کمیسیون سفریار</p>
                </div>
                <p className="mt-2 text-sm leading-7 text-brand-teal-deep/85">
                  درصد کمیسیون از پنل مدیریت تعیین می‌شود و مثال زیر صرفاً یک نمونه
                  است: کرایه ۱٬۳۵۰٬۰۰۰ × ۱۰٪ = ۱۳۵٬۰۰۰ تومان و درآمد خالص راننده
                  ۱٬۲۱۵٬۰۰۰ تومان.
                </p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* دعوت به اقدام */}
      <section className="py-16 sm:py-20">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto w-full max-w-5xl px-4 sm:px-6"
        >
          <div className="relative overflow-hidden rounded-3xl bg-brand-teal px-6 py-12 text-center sm:px-12">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-20"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 20% 20%, var(--color-brand-saffron) 0, transparent 45%), radial-gradient(circle at 85% 70%, #ffffff 0, transparent 40%)",
              }}
            />
            <div className="relative">
              <div className="mx-auto flex justify-center">
                <BrandMark className="size-12" />
              </div>
              <h2 className="mt-5 text-2xl font-black tracking-tight text-white sm:text-3xl">
                همین حالا سفریار را شروع کنید
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-white/80 sm:text-base">
                ثبت‌نام با شماره موبایل، انتخاب نقش مسافر یا راننده، و دسترسی به
                فهرست سفرها، کیف پول و پنل مدیریت.
              </p>
              <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button
                  size="lg"
                  variant="secondary"
                  className="cursor-pointer gap-2 bg-white px-7 text-brand-teal-deep hover:bg-white/90"
                  onClick={isAuthenticated ? goApp : goAuth}
                >
                  {isAuthenticated ? "داشبورد من" : "ثبت‌نام با شماره موبایل"}
                  <ArrowUpRight className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      <footer className="border-t border-border/60 py-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <MapPin className="size-4 text-brand-teal" />
            <span className="text-sm font-semibold">سفریار — SAFARYAR نسخه ۱٫۰</span>
          </div>
          <p className="text-center text-xs leading-6 text-muted-foreground sm:text-right">
            زبان فارسی، جهت راست‌چین، قیمت‌ها به تومان — ساخته‌شده برای تلفن همراه
          </p>
        </div>
      </footer>
    </div>
  );
}
