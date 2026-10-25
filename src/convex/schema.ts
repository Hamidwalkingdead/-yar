import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

/** مسافر یا راننده — نقش انتخاب‌شده هنگام ثبت‌نام */
export const accountTypeValidator = v.union(
  v.literal("passenger"),
  v.literal("driver"),
);
export type AccountType = Infer<typeof accountTypeValidator>;

export const driverStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
);
export type DriverStatus = Infer<typeof driverStatusValidator>;

/** شرایط سفر که بر نرخ هر کیلومتر اثر می‌گذارند */
export const tripConditionValidator = v.union(
  v.literal("night"),
  v.literal("rain"),
  v.literal("snow"),
  v.literal("mountain"),
);
export type TripCondition = Infer<typeof tripConditionValidator>;

export const tripStatusValidator = v.union(
  v.literal("open"), // در انتظار پذیرش راننده
  v.literal("accepted"), // پذیرفته شده، در انتظار شروع
  v.literal("arrived"), // راننده به مبدأ رسیده
  v.literal("in_progress"), // سفر در حال انجام
  v.literal("completed"), // پایان‌یافته و تسویه‌شده
  v.literal("cancelled"), // لغوشده
  v.literal("expired"), // منقضی‌شده
);
export type TripStatus = Infer<typeof tripStatusValidator>;

export const requestStatusValidator = v.union(
  v.literal("pending"),
  v.literal("accepted"),
  v.literal("rejected"),
  v.literal("cancelled"),
);
export type RequestStatus = Infer<typeof requestStatusValidator>;

export const locationValidator = v.object({
  label: v.string(),
  lat: v.number(),
  lng: v.number(),
});
export type TripLocation = Infer<typeof locationValidator>;

export const commissionMethodValidator = v.union(
  v.literal("wallet"), // کسر از کیف پول راننده
  v.literal("gateway"), // پرداخت از طریق درگاه
  v.literal("periodic"), // تسویه دوره‌ای
  v.literal("debt"), // ثبت بدهی و پرداخت در آینده
);
export type CommissionMethod = Infer<typeof commissionMethodValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      phone: v.optional(v.string()), // شماره موبایل (ثبت‌نام با شماره تلفن)
      phoneVerificationTime: v.optional(v.number()), // تأیید شماره تلفن

      role: v.optional(roleValidator), // role of the user. do not remove
      accountType: v.optional(accountTypeValidator), // مسافر یا راننده
      driverStatus: v.optional(driverStatusValidator), // وضعیت تأیید مدارک راننده
      defaultRating: v.optional(v.number()), // میانگین امتیاز دریافتی
      ratingCount: v.optional(v.number()),
      active: v.optional(v.boolean()), // غیرفعال‌سازی توسط مدیر
    })
      .index("email", ["email"]) // do not remove or modify
      .index("phone", ["phone"]),

    /** اطلاعات خودروی راننده */
    vehicles: defineTable({
      driverId: v.id("users"),
      model: v.string(),
      plate: v.string(),
      color: v.string(),
      capacity: v.number(),
      year: v.optional(v.number()),
      createdAt: v.number(),
    }).index("by_driver", ["driverId"]),

    /** مدارک راننده و نتیجه بررسی */
    driverDocuments: defineTable({
      driverId: v.id("users"),
      docType: v.union(
        v.literal("license"),
        v.literal("insurance"),
        v.literal("artesh"),
        v.literal("id_card"),
      ),
      description: v.optional(v.string()),
      status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
      notes: v.optional(v.string()),
      submittedAt: v.number(),
      reviewedAt: v.optional(v.number()),
      reviewerId: v.optional(v.id("users")),
    })
      .index("by_driver", ["driverId"])
      .index("by_status", ["status"]),

    /**
     * سفر: یا توسط مسافر ساخته می‌شود (در انتظار راننده) یا توسط راننده
     * (در انتظار مسافر). تمام ارقام مالی در لحظه ثبت ذخیره می‌شوند.
     */
    trips: defineTable({
      ownerId: v.id("users"),
      ownerRole: v.union(v.literal("passenger"), v.literal("driver")),
      origin: locationValidator,
      destination: locationValidator,
      /** هندس مسیر قابل پیمایش (مسیر جاده‌ای)، به‌صورت زوج‌های lat,lng */
      route: v.optional(v.array(v.number())),
      distanceKm: v.number(),
      durationMin: v.number(),
      departureAt: v.number(),
      conditions: v.array(tripConditionValidator),
      conditionSources: v.optional(
        v.object({
          night: v.union(v.literal("time_rule"), v.literal("none")),
          weather: v.union(v.literal("open_meteo"), v.literal("unavailable")),
          mountain: v.union(v.literal("open_meteo_elevation"), v.literal("unavailable")),
        }),
      ),
      baseRatePerKm: v.number(),
      surchargePerKm: v.number(),
      ratePerKm: v.number(),
      /** ریز نرخ در لحظهٔ ثبت: نرخ پایه و هر افزایش شرایط (شب/باران/برف/کوهستان) */
      breakdown: v.optional(
        v.array(
          v.object({
            condition: v.string(),
            label: v.string(),
            amountPerKm: v.number(),
          }),
        ),
      ),
      priceTotal: v.number(),
      /** قیمت هر مسافر در صورت تقسیم هزینه بین صندلی‌ها */
      pricePerPassenger: v.number(),
      seats: v.number(),
      seatsBooked: v.number(),
      commissionPercent: v.number(),
      commissionFixed: v.number(),
      commissionBasis: v.union(v.literal("fare_total"), v.literal("driver_share")),
      commissionPayer: v.union(v.literal("driver"), v.literal("platform")),
      commissionMethod: commissionMethodValidator,
      commissionAmount: v.number(),
      driverShare: v.number(),
      driverNet: v.number(),
      status: tripStatusValidator,
      driverId: v.optional(v.id("users")),
      acceptedAt: v.optional(v.number()),
      arrivedAt: v.optional(v.number()),
      startedAt: v.optional(v.number()),
      completedAt: v.optional(v.number()),
      cancelledAt: v.optional(v.number()),
      cancelledBy: v.optional(v.id("users")),
      /** آیا مالیات این سفر انجام شده (فقط یک‌بار) */
      settled: v.optional(v.boolean()),
      settledAt: v.optional(v.number()),
      rating: v.optional(v.number()),
      review: v.optional(v.string()),
      note: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_status_departure", ["status", "departureAt"])
      .index("by_owner", ["ownerId"])
      .index("by_driver", ["driverId"])
      .index("by_departure", ["departureAt"]),

    /** درخواست‌ها: درخواست مسافر برای سفر راننده یا پذیرش راننده برای سفر مسافر */
    tripRequests: defineTable({
      tripId: v.id("trips"),
      requesterId: v.id("users"),
      requesterRole: v.union(v.literal("passenger"), v.literal("driver")),
      seats: v.number(),
      note: v.optional(v.string()),
      status: requestStatusValidator,
      createdAt: v.number(),
      respondedAt: v.optional(v.number()),
      respondedBy: v.optional(v.id("users")),
      cancelReason: v.optional(v.string()),
    })
      .index("by_trip", ["tripId", "status"])
      .index("by_requester", ["requesterId", "status"]),

    /** کیف پول راننده — تغییرات فقط از طریق تراکنش ثبت می‌شود */
    wallets: defineTable({
      driverId: v.id("users"),
      balance: v.number(),
      grossEarnings: v.number(),
      netEarnings: v.number(),
      commissionUnpaid: v.number(),
      commissionPaid: v.number(),
      totalWithdrawn: v.number(),
      totalDeposited: v.number(),
      debt: v.number(),
      status: v.union(v.literal("active"), v.literal("debt"), v.literal("suspended")),
      updatedAt: v.number(),
    }).index("by_driver", ["driverId"]),

    /** دفتر تراکنش‌ها — append-only، هر ردیف یک رویداد مالی */
    transactions: defineTable({
      walletId: v.id("wallets"),
      driverId: v.id("users"),
      tripId: v.optional(v.id("trips")),
      settlementId: v.optional(v.id("settlements")),
      type: v.union(
        v.literal("earning"), // درآمد ناخالص سفر
        v.literal("commission"), // کمیسیون کسرشده از کیف پول
        v.literal("commission_due"), // کمیسیون ثبت‌شده به‌عنوان بدهی
        v.literal("commission_payment"), // پرداخت بدهی کمیسیون
        v.literal("withdrawal"), // برداشت
        v.literal("deposit"), // واریز
        v.literal("settlement"), // تسویه دوره‌ای
        v.literal("adjustment"), // اصلاح مالی توسط مدیر
      ),
      amount: v.number(),
      affectsBalance: v.boolean(),
      status: v.union(
        v.literal("pending"),
        v.literal("confirmed"),
        v.literal("failed"),
        v.literal("rejected"),
      ),
      description: v.string(),
      reference: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("by_wallet", ["walletId", "createdAt"])
      .index("by_driver", ["driverId"])
      .index("by_trip", ["tripId"]),

    /** پرداخت‌ها — بدون تأیید سرویس پرداخت، هرگز موفق نمی‌شوند */
    payments: defineTable({
      payerId: v.id("users"),
      tripId: v.optional(v.id("trips")),
      settlementId: v.optional(v.id("settlements")),
      kind: v.union(v.literal("commission"), v.literal("settlement"), v.literal("topup")),
      amount: v.number(),
      provider: v.union(v.literal("wallet"), v.literal("gateway"), v.literal("manual")),
      status: v.union(
        v.literal("pending"),
        v.literal("confirmed"),
        v.literal("failed"),
        v.literal("not_connected"),
      ),
      idempotencyKey: v.string(),
      failureReason: v.optional(v.string()),
      createdAt: v.number(),
      confirmedAt: v.optional(v.number()),
    })
      .index("by_payer", ["payerId"])
      .index("by_idempotency", ["idempotencyKey"])
      .index("by_status", ["status"]),

    /** تسویه‌حساب دوره‌ای کمیسیون */
    settlements: defineTable({
      driverId: v.id("users"),
      walletId: v.id("wallets"),
      amount: v.number(),
      periodFrom: v.number(),
      periodTo: v.number(),
      status: v.union(
        v.literal("requested"),
        v.literal("approved"),
        v.literal("paid"),
        v.literal("rejected"),
      ),
      method: commissionMethodValidator,
      note: v.optional(v.string()),
      createdAt: v.number(),
      paidAt: v.optional(v.number()),
    })
      .index("by_driver", ["driverId"])
      .index("by_status", ["status"]),

    /** اعلان درون برنامه‌ای */
    notifications: defineTable({
      userId: v.id("users"),
      kind: v.string(),
      title: v.string(),
      body: v.string(),
      link: v.optional(v.string()),
      readAt: v.optional(v.number()),
      createdAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_user_unread", ["userId", "readAt"]),

    /** تنظیمات سراسری (تک‌سند) */
    settings: defineTable({
      key: v.string(),
      baseRatePerKm: v.number(),
      surchargeNight: v.number(),
      surchargeRain: v.number(),
      surchargeSnow: v.number(),
      surchargeMountain: v.number(),
      nightStartHour: v.number(),
      nightEndHour: v.number(),
      mountainGainM: v.number(),
      commissionPercent: v.number(),
      commissionFixed: v.number(),
      commissionBasis: v.union(v.literal("fare_total"), v.literal("driver_share")),
      commissionPayer: v.union(v.literal("driver"), v.literal("platform")),
      commissionMethod: commissionMethodValidator,
      blockAcceptanceWhenInDebt: v.boolean(),
      requireSettlementBeforeWithdraw: v.boolean(),
      tripExpiryMinutes: v.number(),
      mapProvider: v.string(),
      smsProvider: v.string(),
      paymentProvider: v.string(),
      /** منطقه زمانی نمایش تاریخ و ساعت */
      timezone: v.string(),
      updatedAt: v.number(),
      updatedBy: v.optional(v.id("users")),
    }).index("by_key", ["key"]),

    /** سوابق تغییرات */
    auditLog: defineTable({
      actorId: v.optional(v.id("users")),
      action: v.string(),
      entity: v.string(),
      entityId: v.optional(v.string()),
      summary: v.string(),
      createdAt: v.number(),
    })
      .index("by_actor", ["actorId"])
      .index("by_entity", ["entity", "entityId"]),

    /**
     * خروجی سرویس پیامک. اگر سرویس پیامک متصل نباشد، کد آزمایشی اینجا
     * ثبت می‌شود و فقط زمانی قابل خواندن است که سرویس پیامک وصل نیست.
     */
    smsOutbox: defineTable({
      phone: v.string(),
      code: v.string(),
      delivered: v.boolean(),
      provider: v.string(),
      error: v.optional(v.string()),
      expiresAt: v.number(),
      createdAt: v.number(),
    }).index("by_phone", ["phone", "createdAt"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
