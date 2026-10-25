import { BrandMark } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { faRelative, toman } from "@/lib/fa";
import { cn } from "@/lib/utils";
import {
  Bell,
  LayoutList,
  Loader2,
  LogOut,
  MapPinPlus,
  ShieldCheck,
  UserRound,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { useMutation, useQuery } from "convex/react";

const NAV = [
  { to: "/dashboard", label: "سفر‌ها", icon: LayoutList, end: true },
  { to: "/dashboard/new", label: "ثبت سفر", icon: MapPinPlus },
  { to: "/dashboard/wallet", label: "کیف پول", icon: Wallet },
  { to: "/dashboard/profile", label: "پروفایل", icon: UserRound },
] as const;

function NotificationsBell() {
  const data = useQuery(api.notifications.list);
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const unread = data?.unread ?? 0;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative flex size-9 items-center justify-center rounded-lg border border-border/70 bg-card text-muted-foreground transition-colors hover:text-foreground"
          aria-label={`اعلان‌ها${unread ? ` (${unread} خوانده‌نشده)` : ""}`}
        >
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute -top-1.5 -left-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-saffron-deep px-1 text-[10px] font-bold text-white">
              {unread > 9 ? "۹+" : unread.toLocaleString("fa-IR")}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80 max-w-[calc(100vw-2rem)]">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>اعلان‌ها</span>
          {unread > 0 && (
            <button
              type="button"
              className="cursor-pointer text-xs font-normal text-brand-teal hover:underline"
              onClick={() => void markAllRead()}
            >
              همه خوانده شد
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!data || data.notifications.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            اعلانی ثبت نشده است.
          </p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {data.notifications.map((n) => (
              <button
                key={n._id}
                type="button"
                className={cn(
                  "block w-full cursor-pointer px-3 py-2.5 text-right transition-colors hover:bg-muted",
                  n.readAt === undefined && "bg-brand-teal-soft/40",
                )}
                onClick={() => {
                  void markRead({ notificationId: n._id });
                  setOpen(false);
                  if (n.link && n.link.startsWith("/")) navigate(n.link);
                }}
              >
                <span className="flex items-start gap-2">
                  <span
                    className={cn(
                      "mt-1.5 size-1.5 shrink-0 rounded-full",
                      n.readAt === undefined ? "bg-brand-teal" : "bg-border",
                    )}
                  />
                  <span className="flex-1">
                    <span className="block text-sm leading-6">{n.body}</span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {faRelative(n.createdAt)}
                    </span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * پوسته برنامه: نوار بالا (دسکتاپ) و نوار پایین (تلفن همراه)، زنگ اعلان‌ها،
 * و دروازه تکمیل پروفایل که پیش از هر صفحه نمایش داده می‌شود.
 */
export function AppShell() {
  const { user, signOut, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const onboarding = useMutation(api.profile.onboarding);
  const [name, setName] = useState("");
  const [role, setRole] = useState<"passenger" | "driver">(() => {
    // نقشی که کاربر پیش از ورود انتخاب کرده پیش‌فرض همین دروازه است
    try {
      return sessionStorage.getItem("safaryar:role") === "driver"
        ? "driver"
        : "passenger";
    } catch {
      return "passenger";
    }
  });
  const [saving, setSaving] = useState(false);
  const [onboardError, setOnboardError] = useState<string | null>(null);

  const needsOnboarding =
    !isLoading && !!user && (!user.accountType || !user.name || user.name.trim().length < 3);

  const submitOnboarding = async () => {
    setSaving(true);
    setOnboardError(null);
    try {
      await onboarding({ accountType: role, name: name.trim() });
      try {
        sessionStorage.removeItem("safaryar:role");
      } catch {
        // بدون حافظهٔ session هم جریان عادی ادامه پیدا می‌کند
      }
    } catch (err) {
      setOnboardError(err instanceof Error ? err.message : "ثبت اطلاعات ممکن نشد.");
    } finally {
      setSaving(false);
    }
  };

  const isAdmin = user?.role === "admin";
  const nav = [...NAV, ...(isAdmin ? [{ to: "/dashboard/admin", label: "مدیریت", icon: ShieldCheck }] : [])];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* نوار بالا */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-3 sm:px-6">
          <button
            type="button"
            className="flex cursor-pointer items-center gap-2"
            onClick={() => navigate("/dashboard")}
          >
            <BrandMark className="size-8" />
            <span className="flex flex-col items-start leading-none">
              <span className="text-base font-black tracking-tight">سفریار</span>
              <span className="text-[10px] text-muted-foreground">
                {user?.accountType === "driver" ? "پنل راننده" : "پنل مسافر"}
              </span>
            </span>
          </button>

          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={"end" in item ? item.end : false}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-brand-teal-soft text-brand-teal-deep"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )
                }
              >
                <item.icon className="size-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <NotificationsBell />
            <Button
              size="sm"
              variant="ghost"
              className="hidden cursor-pointer gap-1.5 text-muted-foreground sm:flex"
              onClick={() => void signOut()}
            >
              <LogOut className="size-4" />
              خروج
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 pb-24 md:pb-8">
        <Outlet />
      </main>

      {/* نوار پایین برای تلفن همراه */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur-md md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={"end" in item ? item.end : false}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                  isActive ? "text-brand-teal" : "text-muted-foreground",
                )
              }
            >
              <item.icon className="size-5" />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* دروازه تکمیل پروفایل */}
      {needsOnboarding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border/70 bg-card p-6 shadow-xl">
            <div className="flex items-center gap-2">
              <BrandMark className="size-9" />
              <div>
                <h2 className="text-lg font-black tracking-tight">خوش آمدید</h2>
                <p className="text-xs text-muted-foreground">
                  برای شروع، چند اطلاعات وارد کنید
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div className="space-y-2">
                <label htmlFor="onboard-name" className="label-fa">
                  نام و نام خانوادگی
                </label>
                <input
                  id="onboard-name"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثلاً علی رضایی"
                  dir="rtl"
                />
              </div>

              <fieldset className="space-y-2">
                <legend className="label-fa">نقش شما</legend>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: "passenger", label: "مسافر", hint: "درخواست سفر" },
                      { id: "driver", label: "راننده", hint: "ثبت و پذیرش سفر" },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setRole(item.id)}
                      className={`cursor-pointer rounded-xl border p-3 text-right transition-colors ${
                        role === item.id
                          ? "border-brand-teal bg-brand-teal-soft"
                          : "border-border bg-background hover:border-primary/40"
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
                  نقش پس از ثبت فقط یک‌بار قابل تغییر است؛ راننده پس از تأیید مدیر
                  فعال می‌شود.
                </p>
              </fieldset>

              {onboardError && <p className="alert-error">{onboardError}</p>}

              <Button
                className="w-full cursor-pointer gap-1.5"
                disabled={saving || name.trim().length < 3}
                onClick={() => void submitOnboarding()}
              >
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    در حال ثبت…
                  </>
                ) : (
                  "شروع کار با سفریار"
                )}
              </Button>

              <button
                type="button"
                className="w-full cursor-pointer text-center text-xs text-muted-foreground hover:text-foreground"
                onClick={() => void signOut()}
              >
                خروج از حساب (تغییر شماره)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** نوار کناری وضعیت فعلی مسیر — برای صفحات خالی */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  const location = useLocation();
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-black tracking-tight sm:text-2xl">{title}</h1>
        {description && (
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
      <span className="sr-only">{location.pathname}</span>
    </div>
  );
}

/** خلاصه مالی کوچک — در چند صفحه استفاده می‌شود */
export function MoneyStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "warn";
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-sm font-black",
          tone === "positive" && "text-brand-teal",
          tone === "warn" && "text-brand-saffron-deep",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export { toman };
