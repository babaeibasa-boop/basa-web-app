import axios from "axios";
import { config } from "../lib/config.js";
import { AppError } from "../lib/errors.js";
import { maskMobile } from "../lib/national-code.js";
import { logAuth, logExternalError } from "../lib/logger.js";

const SMS_TIMEOUT_MS = 10_000;

class SmsService {
  private enabled: boolean;

  constructor() {
    this.enabled = Boolean(
      config.melipayamakUsername && config.melipayamakPassword && config.melipayamakFromNumber,
    );
  }

  private async postSendSms(to: string, text: string): Promise<void> {
    await axios.post(
      "https://rest.payamak-panel.com/api/SendSMS/SendSMS",
      {
        username: config.melipayamakUsername,
        password: config.melipayamakPassword,
        to,
        from: config.melipayamakFromNumber,
        text,
        isFlash: false,
      },
      { timeout: SMS_TIMEOUT_MS },
    );
  }

  async sendSms(to: string, text: string): Promise<void> {
    if (!this.enabled) return;

    try {
      await this.postSendSms(to, text);
    } catch (error) {
      logExternalError("SMS send failed", { to: maskMobile(to), error: String(error) });
    }
  }

  /**
   * Send OTP SMS. Throws on failure in production when Melipayamak is configured.
   * In development without credentials, logs the OTP instead of sending.
   */
  async sendOtp(phone: string, code: string): Promise<void> {
    const text = `کد تایید ورود شما: ${code}\nاعتبار: ۹۰ ثانیه`;

    if (!this.enabled) {
      if (config.nodeEnv === "production") {
        throw new AppError("سرویس پیامک پیکربندی نشده است", 503);
      }
      logAuth("OTP SMS (dev fallback — Melipayamak not configured)", {
        phone: maskMobile(phone),
        code,
      });
      return;
    }

    try {
      await this.postSendSms(phone, text);
    } catch (error) {
      logExternalError("OTP SMS send failed", { to: maskMobile(phone), error: String(error) });
      throw new AppError("خطا در ارسال پیامک کد تایید", 502);
    }
  }

  async sendOrderCompleted(phone: string, orderId: string): Promise<void> {
    await this.sendSms(
      phone,
      `سفارش شما با شماره ${orderId} تکمیل شد. از خرید شما سپاسگزاریم.`,
    );
  }

  async sendNewInvoice(phone: string, amount: string): Promise<void> {
    await this.sendSms(
      phone,
      `فاکتور جدیدی به مبلغ ${amount} ریال برای شما صادر شد. لطفاً از پنل کاربری پرداخت کنید.`,
    );
  }

  async sendAllInvoicesPaid(phones: string[], orderId: string): Promise<void> {
    const text = `تمام فاکتورهای سفارش ${orderId} پرداخت شد. لطفاً بررسی و تکمیل کنید.`;
    await Promise.all(phones.map((phone) => this.sendSms(phone, text)));
  }
}

export const smsService = new SmsService();
