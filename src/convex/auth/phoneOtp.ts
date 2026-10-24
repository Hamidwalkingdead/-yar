import { Phone } from "@convex-dev/auth/providers/Phone";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";
import axios from "axios";
import { internal } from "../_generated/api";

/**
 * احراز هویت با شماره تلفن همراه (بخش ۰۳).
 *
 * وضعیت اتصال سرویس پیامک:
 * - اگر متغیرهای محیطی سرویس پیامک روی دیپلویمنت Convex تنظیم شده باشند
 *   (`SMS_GATEWAY_URL` و `SMS_API_KEY`)، پیامک واقعی ارسال می‌شود و کد
 *   هرگز در پایگاه داده یا رابط کاربری ذخیره نمی‌شود.
 * - اگر سرویس متصل نباشد، کد در جدول `smsOutbox` با برچسب «تحویل‌نشده»
 *   ثبت می‌شود و صفحه ورود آن را با هشدار صریح «سرویس پیامک متصل نیست»
 *   نمایش می‌دهد. این حالت فقط برای آزمایش محلی است و پیامک واقعی نیست.
 *
 * قرارداد سرویس پیامک: POST به SMS_GATEWAY_URL با بدنه
 * `{ to, from, text }` و هدر `Authorization: Bearer SMS_API_KEY`.
 */

function envUrl(): string | undefined {
  return process.env.SMS_GATEWAY_URL;
}
function envKey(): string | undefined {
  return process.env.SMS_API_KEY;
}
function envFrom(): string | undefined {
  return process.env.SMS_FROM;
}

export function smsConfigured(): boolean {
  return Boolean(envUrl() && envKey());
}

export function smsProviderName(): string {
  return smsConfigured() ? "custom-sms-gateway" : "not_connected";
}

async function sendSms(phone: string, text: string): Promise<void> {
  const url = envUrl();
  const key = envKey();
  if (!url || !key) {
    throw new Error("SMS gateway is not configured");
  }
  await axios.post(
    url,
    { to: phone, from: envFrom() ?? "", text },
    {
      timeout: 12000,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
    },
  );
}

export const phoneOtp = Phone({
  id: "phone-otp",
  maxAge: 60 * 5, // کد پیامکی ۵ دقیقه معتبر است
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes: Uint8Array) {
        crypto.getRandomValues(bytes);
      },
    };
    return generateRandomString(random, "0123456789", 6);
  },
  async sendVerificationRequest({ identifier: phone, token }, ctx) {
    const expiresAt = Date.now() + 5 * 60_000;
    const text = `کد ورود سفریار: ${token}\nاین کد تا ۵ دقیقه معتبر است.`;

    if (smsConfigured()) {
      await sendSms(phone, text);
      await ctx.runMutation(internal.sms.store, {
        phone,
        code: token,
        delivered: true,
        provider: smsProviderName(),
        expiresAt,
      });
      return;
    }

    // سرویس پیامک متصل نیست: کد به‌صورت آزمایشی ذخیره می‌شود تا برنامه
    // قابل آزمایش بماند. این حالت هرگز به‌عنوان پیامک واقعی معرفی نمی‌شود.
    await ctx.runMutation(internal.sms.store, {
      phone,
      code: token,
      delivered: false,
      provider: "not_connected",
      error: "سرویس پیامک متصل نیست؛ کد به‌صورت آزمایشی نمایش داده می‌شود.",
      expiresAt,
    });
  },
});