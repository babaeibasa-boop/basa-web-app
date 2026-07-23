import axios, { type AxiosInstance } from "axios";
import { config } from "../lib/config.js";
import { logWalletError } from "../lib/logger.js";
import { AppError } from "../lib/errors.js";


export interface WalletResponse {
  status: string;
  data?: WalletData;
}

export interface WalletData {
  status: string;
  user_data: WalletUserInfo;
}

export interface WalletUserInfo {
  user_id: string;
  name: string;
  family: string;
  phone: string;
}

export interface InvoiceItem {
  "item_code": string,
  "item_title": string,
  "item_count": string,
  "unit_title": string,
  "item_total_amount": number
}

export interface Invoice {
  items: InvoiceItem[];
}

export interface WalletPaymentRequest {
  user_token: string;
  amount: number;
  currency: string;
  description: string;
  invoice: Invoice;
  callback_url: string;
}

export interface WalletPaymentResponse {
  status: string,
  status_det: string,
  data?: {
    status: string,
    pay_url: string,
    payment_track_id: string
  }
}

export interface WalletSettleResponse {
  status: string,
  status_det: string,
  data: { status: string }
}

export interface WalletReverseResponse {
  status: string,
  status_det: string,
  data?: { status: string }
}

class WalletService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.walletApiBaseUrl,
      headers: { PWD: config.walletApiToken },
      timeout: 15000,
    });
  }

  async getUserInfo(ut: string): Promise<WalletUserInfo> {
    try {
      const { data } = await this.client.post<WalletResponse>("", {
        "method": "getUserInfo",
        "data": {
          "user_token": `${ut}`
        },
        "api_version": "1"
      });
      if (data.status !== "OK" || !(data.data) || data.data.status !== "Done") {
        throw new AppError("خطا در احراز هویت کیف پول", 401);
      }
      return data.data.user_data;
    } catch (error) {
      logWalletError("getUserInfo failed", { error: String(error) });
      throw new AppError("خطا در احراز هویت کیف پول", 401);
    }
  }

  async requestPayment(input: WalletPaymentRequest): Promise<WalletPaymentResponse["data"]> {
    const sendingData = {
      "method": "requestPayment",
      "data": {
        "user_token": `${input.user_token}`,
        "amount": input.amount,
        "currency": "BW",
        "description": `${input.description}`,
        "invoice": input.invoice,
        "callback_url": `${input.callback_url}`,
      },
      "api_version": "1"
    }
    try {
      const { data: walletPaymentResponse } = await this.client.post<WalletPaymentResponse>(
        "",
        JSON.stringify(sendingData),
      );
      if (walletPaymentResponse.status !== "OK" || !(walletPaymentResponse.data) || walletPaymentResponse.data.status !== "OK") {
        throw new AppError("خطا در ایجاد درخواست پرداخت", 502);
      }
      return walletPaymentResponse.data;
    } catch (error) {
      logWalletError("requestPayment failed", { error: String(error) });
      throw new AppError("خطا در ایجاد درخواست پرداخت", 502);
    }
  }

  async settlePayment(
    paymentTrackId: string,
    paymentToken: string,
  ): Promise<WalletSettleResponse> {
    try {
      const { data: walletSettleResponse } = await this.client.post<WalletSettleResponse>("", {
        "method": "settlePayment",
        "data": {
          "payment_track_id": paymentTrackId,
          "payment_token": paymentToken,
        },
        "api_version": "1"
      });
      return walletSettleResponse;
    } catch (error) {
      logWalletError("settlePayment failed", { error: String(error) });
      throw new AppError("خطا در تسویه پرداخت", 502);
    }
  }

  async reversePayment(
    paymentTrackId: string,
    paymentToken: string,
    amount: number,
    type: "Total" | "Partial",
  ): Promise<WalletReverseResponse> {
    try {
      const { data: walletReverseResponse } = await this.client.post<WalletReverseResponse>("", {
        "method": "reversePayment",
        "data": {
          "payment_track_id": `${paymentTrackId}`,
          "payment_token": `${paymentToken}`,
          "reverse_type": `${type}`,
        },
        "api_version": "1"
      });
      if (walletReverseResponse.status !== "OK" || walletReverseResponse?.data?.status !== "Reversed") {
        throw new AppError("خطا در بازگشت وجه", 502);
      }
      return walletReverseResponse;
    } catch (error) {
      logWalletError("reversePayment failed", { error: String(error) });
      throw new AppError("خطا در بازگشت وجه", 502);
    }
  }
}

export const walletService = new WalletService();
