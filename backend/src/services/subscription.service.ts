import axios from "axios";
import { AiModel } from "@prisma/client";
import { logExternalError } from "../lib/logger.js";
import { AppError } from "../lib/errors.js";

const PRODUCT_SLUGS: Record<AiModel, string> = {
  CHATGPT: "payment-for-gpt4",
  CLAUDE: "Claude--monthly-payment",
  GEMINI: "Gemini-pro-payment",
};

const IRANICARD_BASE =
  "https://api.iranicard.ir/api/public/modules/Onlineshopping/v1/client/showProduct";

interface PriceCondition {
  element: string;
  from: number;
  to: number;
  value: number;
  wage_type: "fixed" | "percent";
}

interface RadioPlan {
  title: string;
  value: string;
}

interface PriceForm {
  base_currency: { price: number } | null;
  related_currencies?: { symbol: string; price: number }[];
  elements: {
    items: {
      price: { radio_value_array: RadioPlan[] };
    };
    conditions: PriceCondition[];
  };
}

interface IraniCardProduct {
  data: {
    product: {
      name: string;
      form: {
        price_form: PriceForm;
      };
    };
  };
}

export interface SubscriptionPlan {
  title: string;
  usdValue: number;
  irrPrice: number;
}

export interface SubscriptionProduct {
  name: string;
  plans: SubscriptionPlan[];
}

const cache = new Map<string, { data: SubscriptionProduct; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

function calculateWage(usdValue: number, conditions: PriceCondition[]): number {
  const priceCondition = conditions.find(
    (c) => c.element === "price" && usdValue >= c.from && usdValue <= c.to,
  );
  if (!priceCondition) return 0;

  if (priceCondition.wage_type === "fixed") {
    return priceCondition.value;
  }

  return (usdValue * priceCondition.value) / 100;
}

function calculateIrrPrice(usdValue: number, exchangeRate: number, conditions: PriceCondition[]): number {
  const wage = calculateWage(usdValue, conditions);
  return Math.round((usdValue + wage) * exchangeRate);
}

function resolveExchangeRate(priceForm: PriceForm): number {
  if (priceForm.base_currency?.price) {
    return priceForm.base_currency.price;
  }

  const usdCurrency = priceForm.related_currencies?.find((c) => c.symbol === "USD");
  if (usdCurrency?.price) {
    return usdCurrency.price;
  }

  const firstCurrency = priceForm.related_currencies?.[0];
  if (firstCurrency?.price) {
    return firstCurrency.price;
  }

  throw new AppError("نرخ ارز در پاسخ API یافت نشد", 502);
}

export async function getSubscriptionPlans(aiModel: AiModel): Promise<SubscriptionProduct> {
  const slug = PRODUCT_SLUGS[aiModel];
  const cached = cache.get(slug);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  try {
    const { data } = await axios.get<IraniCardProduct>(`${IRANICARD_BASE}/${slug}`, {
      timeout: 10000,
    });

    const priceForm = data.data.product.form.price_form;
    const radioPlans = priceForm.elements?.items?.price?.radio_value_array;
    if (!radioPlans?.length) {
      throw new AppError("ساختار پاسخ API اشتراک نامعتبر است", 502);
    }

    const exchangeRate = resolveExchangeRate(priceForm);
    const conditions = priceForm.elements.conditions;

    const plans: SubscriptionPlan[] = radioPlans.map((plan) => {
      const usdValue = parseFloat(plan.value);
      return {
        title: plan.title,
        usdValue,
        irrPrice: calculateIrrPrice(usdValue, exchangeRate, conditions),
      };
    });

    const product: SubscriptionProduct = {
      name: data.data.product.name,
      plans,
    };

    cache.set(slug, { data: product, expiresAt: Date.now() + CACHE_TTL_MS });
    return product;
  } catch (error) {
    logExternalError("Failed to fetch subscription plans", { aiModel, error: String(error) });
    if (error instanceof AppError) throw error;
    throw new AppError("خطا در دریافت پلن‌های اشتراک", 502);
  }
}

export function getPlanPrice(
  product: SubscriptionProduct,
  planTitle: string,
): SubscriptionPlan | undefined {
  return product.plans.find((p) => p.title === planTitle);
}

export { calculateIrrPrice, calculateWage };
