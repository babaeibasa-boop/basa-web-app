import { beforeEach, describe, expect, it, vi } from "vitest";

const { axiosMock } = vi.hoisted(() => {
  const axiosMock = {
    get: vi.fn(),
  };
  return { axiosMock };
});

vi.mock("axios", () => ({
  default: axiosMock,
}));

import { pinketCreditAdapter } from "../services/credit/adapters/pinket.adapter.js";
import { CreditAdapterError } from "../services/credit/types.js";

const user = {
  id: "u1",
  walletId: "w1",
  phone: "989123456789",
  name: "علی",
  family: "تست",
  nationalCode: null,
};

const config = {
  baseUrl: "https://pinket.com/api/v1/organization/members",
  apiKey: "org-key",
  amountInToman: true,
  pageSize: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("pinketCreditAdapter", () => {
  it("requires an Iranian mobile number", async () => {
    await expect(
      pinketCreditAdapter.getBalance({ ...user, phone: "123" }, config),
    ).rejects.toMatchObject({ code: "USER_NOT_FOUND" } satisfies Partial<CreditAdapterError>);
    expect(axiosMock.get).not.toHaveBeenCalled();
  });

  it("sums wallet balances and converts Toman to Rial", async () => {
    axiosMock.get.mockResolvedValue({
      data: [
        {
          uid: "wallet-1",
          orgCreditUid: "credit-1",
          tag: "Welfare",
          balance: 150000,
          expendableBalance: 120000,
          expireDate: 1795996800000,
          loanUid: null,
        },
        {
          uid: "wallet-2",
          balance: 50000,
          expendableBalance: 10000,
          expireDate: null,
          loanUid: "loan-1",
        },
      ],
    });

    const balance = await pinketCreditAdapter.getBalance(user, config);

    expect(balance).toEqual({
      available: 1_300_000,
      total: 2_000_000,
      currency: "IRR",
      expiresAt: new Date(1795996800000).toISOString(),
    });
    expect(axiosMock.get).toHaveBeenCalledWith(
      "https://pinket.com/api/v1/organization/members/wallets",
      expect.objectContaining({
        params: { phoneNumber: "09123456789" },
        headers: expect.objectContaining({
          "X-Organization-Api-Key": "org-key",
          Accept: "application/json",
        }),
      }),
    );
  });

  it("returns zero when the member has no wallets", async () => {
    axiosMock.get.mockResolvedValue({ data: [] });
    const balance = await pinketCreditAdapter.getBalance(user, config);
    expect(balance).toEqual({ available: 0, total: 0, currency: "IRR", expiresAt: null });
  });

  it("keeps Rial amounts when amountInToman is false", async () => {
    axiosMock.get.mockResolvedValue({
      data: [{ uid: "wallet-1", balance: 1500, expendableBalance: 1000, expireDate: null }],
    });
    const balance = await pinketCreditAdapter.getBalance(user, { ...config, amountInToman: false });
    expect(balance.available).toBe(1000);
    expect(balance.total).toBe(1500);
  });

  it("maps 404 to USER_NOT_FOUND and 401 to UNAUTHORIZED", async () => {
    axiosMock.get.mockRejectedValueOnce({ response: { status: 404, data: {} }, message: "missing" });
    await expect(pinketCreditAdapter.getBalance(user, config)).rejects.toMatchObject({
      code: "USER_NOT_FOUND",
    } satisfies Partial<CreditAdapterError>);

    axiosMock.get.mockRejectedValueOnce({ response: { status: 401, data: {} }, message: "bad key" });
    await expect(pinketCreditAdapter.getBalance(user, config)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    } satisfies Partial<CreditAdapterError>);
  });

  it("maps transactions and pages with start/len", async () => {
    axiosMock.get.mockResolvedValue({
      data: {
        items: [
          {
            timeStamp: 1795996800000,
            type: "OrderRegistration",
            amount: -25000,
            walletUid: "wallet-uuid",
          },
          {
            timeStamp: 1795900000000,
            type: "Refund",
            amount: 5000,
            walletUid: "wallet-uuid",
          },
        ],
        totalCount: 5,
      },
    });

    const page = await pinketCreditAdapter.getTransactions(user, config, { cursor: "2" });

    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({
      amount: 250_000,
      type: "PURCHASE",
      status: "SUCCESS",
      description: "ثبت سفارش",
      occurredAt: new Date(1795996800000).toISOString(),
    });
    expect(page.items[1]?.type).toBe("REFUND");
    expect(page.items[1]?.amount).toBe(50_000);
    expect(page.nextCursor).toBe("4");
    expect(axiosMock.get).toHaveBeenCalledWith(
      "https://pinket.com/api/v1/organization/members/transactions",
      expect.objectContaining({
        params: { phoneNumber: "09123456789", start: 2, len: 2 },
      }),
    );
  });

  it("maps installment status from notPaid dates and payable total", async () => {
    const now = Date.now();
    axiosMock.get.mockResolvedValue({
      data: [
        {
          uid: "upcoming",
          status: "notPaid",
          number: 1,
          amount: 100000,
          commission: 10000,
          totalAmount: 115000,
          penalty: 5000,
          dueDate: now + 10 * 86_400_000,
          deadlineDate: now + 20 * 86_400_000,
        },
        {
          uid: "due",
          status: "notPaid",
          number: 2,
          amount: 100000,
          totalAmount: 100000,
          dueDate: now - 2 * 86_400_000,
          deadlineDate: now + 5 * 86_400_000,
        },
        {
          uid: "overdue",
          status: "notPaid",
          number: 3,
          amount: 80000,
          totalAmount: 80000,
          dueDate: now - 20 * 86_400_000,
          deadlineDate: now - 86_400_000,
        },
        {
          uid: "paid",
          status: "paid",
          number: 4,
          amount: 90000,
          totalAmount: 90000,
          dueDate: now - 40 * 86_400_000,
          deadlineDate: now - 30 * 86_400_000,
        },
      ],
    });

    const items = await pinketCreditAdapter.getInstallments!(user, config);

    expect(items.map((item) => ({ id: item.id, status: item.status, amount: item.amount, label: item.label }))).toEqual([
      { id: "upcoming", status: "UPCOMING", amount: 1_150_000, label: "قسط 1" },
      { id: "due", status: "DUE", amount: 1_000_000, label: "قسط 2" },
      { id: "overdue", status: "OVERDUE", amount: 800_000, label: "قسط 3" },
      { id: "paid", status: "PAID", amount: 900_000, label: "قسط 4" },
    ]);
    expect(axiosMock.get).toHaveBeenCalledWith(
      "https://pinket.com/api/v1/organization/members/installments",
      expect.objectContaining({ params: { phoneNumber: "09123456789" } }),
    );
  });

  it("exposes installments and not merchants or launch", () => {
    expect(pinketCreditAdapter.capabilities).toEqual({
      installments: true,
      merchants: false,
      launch: false,
    });
  });

  it("normalizes a host-only baseUrl", async () => {
    axiosMock.get.mockResolvedValue({ data: [] });
    await pinketCreditAdapter.getBalance(user, {
      ...config,
      baseUrl: "pinket.com/api/v1/organization/members/",
    });
    expect(axiosMock.get).toHaveBeenCalledWith(
      "https://pinket.com/api/v1/organization/members/wallets",
      expect.any(Object),
    );
  });
});
