import { beforeEach, describe, expect, it, vi } from "vitest";

const { axiosMock } = vi.hoisted(() => {
  const axiosMock = {
    post: vi.fn(),
    get: vi.fn(),
  };
  return { axiosMock };
});

vi.mock("axios", () => ({
  default: axiosMock,
}));

import { barookCreditAdapter } from "../services/credit/adapters/barook.adapter.js";
import { CreditAdapterError } from "../services/credit/types.js";

const user = {
  id: "u1",
  walletId: "w1",
  phone: "09120000000",
  name: "علی",
  family: "تست",
  nationalCode: "0012345678",
};

const config = {
  baseUrl: "https://api.barook.tech/barook",
  username: "org-user",
  password: "secret",
  organizationSlug: "roozeno",
  pageSize: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  axiosMock.post.mockResolvedValue({ data: { id_token: "token-abc" } });
});

describe("barookCreditAdapter", () => {
  it("requires nationalCode", async () => {
    await expect(
      barookCreditAdapter.getBalance({ ...user, nationalCode: null }, config),
    ).rejects.toMatchObject({ code: "USER_NOT_FOUND" } satisfies Partial<CreditAdapterError>);
  });

  it("authenticates then fetches balance", async () => {
    axiosMock.get.mockResolvedValue({ data: { balance: 1_500_000 } });

    const balance = await barookCreditAdapter.getBalance(user, config);

    expect(balance).toEqual({ available: 1_500_000, currency: "IRR", expiresAt: null });
    expect(axiosMock.post).toHaveBeenCalledWith(
      "https://api.barook.tech/barook/api/authenticate",
      expect.objectContaining({ username: "org-user", password: "secret" }),
      expect.any(Object),
    );
    expect(axiosMock.get).toHaveBeenCalledWith(
      "https://api.barook.tech/barook/consumer/organization/users/roozeno/balance",
      expect.objectContaining({
        params: { nationalCode: "0012345678" },
        headers: expect.objectContaining({ Authorization: "Bearer token-abc" }),
      }),
    );
  });

  it("maps transactions and pages with cursor", async () => {
    axiosMock.get.mockResolvedValue({
      data: {
        content: [
          {
            id: 11,
            amount: 200000,
            transactionType: "برداشت",
            transactionSourceSlug: "payment",
            transactionSourceTitle: "پرداخت اعتبار",
            createdAt: "2026-01-01T10:00:00Z",
            transactionStatus: "SUCCESS",
          },
          {
            id: 12,
            amount: 50000,
            transactionType: "واریز",
            transactionSourceSlug: "refund",
            transactionSourceTitle: "بازگشت اعتبار",
            createdAt: "2026-01-02T10:00:00Z",
            transactionStatus: "PENDING",
          },
        ],
      },
    });

    const page = await barookCreditAdapter.getTransactions(user, config, {});
    expect(page.items).toHaveLength(2);
    expect(page.items[0]?.type).toBe("PURCHASE");
    expect(page.items[1]?.type).toBe("REFUND");
    expect(page.nextCursor).toBe("1");

    expect(axiosMock.get).toHaveBeenCalledWith(
      "https://api.barook.tech/barook/consumer/organization/transactions/roozeno/2/0",
      expect.objectContaining({ params: { nationalCode: "0012345678" } }),
    );
  });

  it("rejects API installments/merchants via capabilities", () => {
    expect(barookCreditAdapter.capabilities.installments).toBe(false);
    expect(barookCreditAdapter.capabilities.merchants).toBe(false);
    expect(barookCreditAdapter.capabilities.launch).toBe(false);
  });

  it("normalizes host-only baseUrl without https://", async () => {
    axiosMock.get.mockResolvedValue({ data: { balance: 10 } });

    await barookCreditAdapter.getBalance(user, {
      ...config,
      baseUrl: "api.barook.tech/barook/",
      username: "host-only-user",
    });

    expect(axiosMock.post).toHaveBeenCalledWith(
      "https://api.barook.tech/barook/api/authenticate",
      expect.objectContaining({ username: "host-only-user" }),
      expect.any(Object),
    );
    expect(axiosMock.get).toHaveBeenCalledWith(
      "https://api.barook.tech/barook/consumer/organization/users/roozeno/balance",
      expect.any(Object),
    );
  });
});
