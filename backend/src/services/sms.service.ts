import axios from "axios";
import { config } from "../lib/config.js";
import { logExternalError } from "../lib/logger.js";

class SmsService {
  private enabled: boolean;

  constructor() {
    this.enabled = Boolean(
      config.melipayamakUsername && config.melipayamakPassword && config.melipayamakFromNumber,
    );
  }

  async sendSms(to: string, text: string): Promise<void> {
    if (!this.enabled) return;

    try {
      await axios.post("https://rest.payamak-panel.com/api/SendSMS/SendSMS", {
        username: config.melipayamakUsername,
        password: config.melipayamakPassword,
        to,
        from: config.melipayamakFromNumber,
        text,
        isFlash: false,
      });
    } catch (error) {
      logExternalError("SMS send failed", { to, error: String(error) });
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
