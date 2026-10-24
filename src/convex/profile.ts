import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { audit, notify, requireUser } from "./lib/server";

async function adminIdsOf(ctx: Parameters<typeof requireUser>[0]) {
  const admins = await ctx.db
    .query("users")
    .filter((q) => q.eq(q.field("role"), "admin"))
    .take(50);
  return admins.map((a) => a._id);
}

/** اطلاعات پروفایل کاربر */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const vehicle = await ctx.db
      .query("vehicles")
      .withIndex("by_driver", (q) => q.eq("driverId", user._id))
      .first();
    const documents = await ctx.db
      .query("driverDocuments")
      .withIndex("by_driver", (q) => q.eq("driverId", user._id))
      .order("desc")
      .collect();
    const stats = {
      trips: (
        await ctx.db
          .query("trips")
          .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
          .collect()
      ).length,
    };
    return { user, vehicle, documents, stats };
  },
});

/**
 * تکمیل پروفایل: انتخاب نقش مسافر/راننده و نام.
 * فقط یک‌بار قابل تغییر است تا سوءاستفاده از نقش راننده ممکن نباشد.
 */
export const onboarding = mutation({
  args: {
    accountType: v.union(v.literal("passenger"), v.literal("driver")),
    name: v.string(),
  },
  handler: async (ctx, { accountType, name }) => {
    const user = await requireUser(ctx);
    const trimmed = name.trim();
    if (trimmed.length < 3) throw new Error("نام باید حداقل ۳ حرف باشد.");
    await ctx.db.patch(user._id, {
      name: trimmed,
      accountType,
      ...(accountType === "driver" && !user.driverStatus
        ? { driverStatus: "pending" as const }
        : {}),
    });
    await audit(ctx, {
      actorId: user._id,
      action: "profile_onboarding",
      entity: "users",
      entityId: user._id,
      summary: `تکمیل پروفایل با نقش ${accountType === "driver" ? "راننده" : "مسافر"}`,
    });
    return { ok: true as const };
  },
});

/** ویرایش نام */
export const updateName = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const user = await requireUser(ctx);
    const trimmed = name.trim();
    if (trimmed.length < 3) throw new Error("نام باید حداقل ۳ حرف باشد.");
    await ctx.db.patch(user._id, { name: trimmed });
    return { ok: true as const };
  },
});

/** ثبت یا ویرایش خودروی راننده */
export const saveVehicle = mutation({
  args: {
    model: v.string(),
    plate: v.string(),
    color: v.string(),
    capacity: v.number(),
    year: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user.accountType !== "driver") {
      throw new Error("ثبت خودرو فقط برای رانندگان امکان‌پذیر است.");
    }
    const model = args.model.trim();
    const plate = args.plate.trim();
    const color = args.color.trim();
    if (model.length < 2) throw new Error("مدل خودرو را وارد کنید.");
    if (plate.length < 5) throw new Error("شماره پلاک را به‌درستی وارد کنید.");
    if (color.length < 2) throw new Error("رنگ خودرو را وارد کنید.");
    if (!Number.isFinite(args.capacity) || args.capacity < 1 || args.capacity > 8) {
      throw new Error("ظرفیت خودرو باید بین ۱ تا ۸ صندلی باشد.");
    }

    const existing = await ctx.db
      .query("vehicles")
      .withIndex("by_driver", (q) => q.eq("driverId", user._id))
      .first();
    const payload = {
      model,
      plate,
      color,
      capacity: Math.floor(args.capacity),
      year: args.year ?? undefined,
    };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
    } else {
      await ctx.db.insert("vehicles", {
        driverId: user._id,
        ...payload,
        createdAt: Date.now(),
      });
    }
    await audit(ctx, {
      actorId: user._id,
      action: "vehicle_saved",
      entity: "vehicles",
      entityId: user._id,
      summary: `ثبت خودرو ${model} — ظرفیت ${args.capacity}`,
    });
    return { ok: true as const };
  },
});

/** ثبت مدارک راننده برای بررسی مدیر */
export const submitDocument = mutation({
  args: {
    docType: v.union(
      v.literal("license"),
      v.literal("insurance"),
      v.literal("artesh"),
      v.literal("id_card"),
    ),
    description: v.string(),
  },
  handler: async (ctx, { docType, description }) => {
    const user = await requireUser(ctx);
    if (user.accountType !== "driver") {
      throw new Error("ثبت مدارک فقط برای رانندگان امکان‌پذیر است.");
    }
    const existing = await ctx.db
      .query("driverDocuments")
      .withIndex("by_driver", (q) => q.eq("driverId", user._id))
      .collect();
    const pending = existing.find((d) => d.docType === docType && d.status === "pending");
    if (pending) throw new Error("این مدرک قبلاً ثبت شده و در انتظار بررسی است.");
    const rejected = existing.find((d) => d.docType === docType && d.status === "rejected");
    if (rejected) {
      await ctx.db.patch(rejected._id, {
        status: "pending",
        description: description.trim(),
        submittedAt: Date.now(),
        notes: undefined,
      });
    } else {
      await ctx.db.insert("driverDocuments", {
        driverId: user._id,
        docType,
        description: description.trim(),
        status: "pending",
        submittedAt: Date.now(),
      });
    }

    if (user.driverStatus !== "approved") {
      await ctx.db.patch(user._id, { driverStatus: "pending" });
    }
    for (const adminId of await adminIdsOf(ctx)) {
      await notify(ctx, {
        userId: adminId,
        kind: "document_submitted",
        title: "مدرک جدید برای بررسی",
        body: `${user.name ?? user.phone ?? "راننده"} مدرکی برای بررسی ثبت کرده است.`,
        link: "/dashboard/admin?tab=documents",
      });
    }
    await audit(ctx, {
      actorId: user._id,
      action: "document_submitted",
      entity: "driverDocuments",
      entityId: user._id,
      summary: `ثبت مدرک ${docType}`,
    });
    return { ok: true as const };
  },
});