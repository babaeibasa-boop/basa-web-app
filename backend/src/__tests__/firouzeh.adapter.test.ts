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

import {
  clearFirouzehTokenCache,
  firouzehCreditAdapter,
} from "../services/credit/adapters/firouzeh.adapter.js";
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
  baseUrl: "https://api.firouzeh.example/",
  authBaseUrl: "https://auth.firouzeh.example",
  clientId: "org-client",
  username: "org-user",
  password: "secret",
  pageSize: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  clearFirouzehTokenCache();
  axiosMock.post.mockResolvedValue({
    data: {
      access_token: "access-abc",
      expires_in: 300,
      refresh_token: "refresh-xyz",
      token_type: "Bearer",
    },
  });
});

describe("firouzehCreditAdapter", () => {
  it("requires nationalCode", async () => {
    await expect(
      firouzehCreditAdapter.getBalance({ ...user, nationalCode: null }, config),
    ).rejects.toMatchObject({ code: "USER_NOT_FOUND" } satisfies Partial<CreditAdapterError>);
  });

  it("authenticates with password grant then sums CREDIT wallet balances", async () => {
    axiosMock.get.mockResolvedValue({
      data: [
        {
          id: "wallet-credit",
          title: "اعتبار",
          type: "CREDIT",
          status: "ACTIVE",
          available_balance: 1_200_000,
          freeze_balance: 100_000,
          amount: 1_300_000,
        },
        {
          id: "wallet-cash",
          title: "نقدی",
          type: "CASH",
          status: "ACTIVE",
          available_balance: 50_000,
          freeze_balance: 0,
          amount: 50_000,
        },
      ],
    });

    const balance = await firouzehCreditAdapter.getBalance(user, config);

    expect(balance).toEqual({
      available: 1_200_000,
      total: 1_300_000,
      currency: "IRR",
      expiresAt: null,
    });

    expect(axiosMock.post).toHaveBeenCalledWith(
      "https://auth.firouzeh.example/realms/firouzeh/protocol/openid-connect/token",
      expect.stringContaining("grant_type=password"),
      expect.objectContaining({
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }),
    );
    expect(axiosMock.get).toHaveBeenCalledWith(
      "https://api.firouzeh.example/cf/api/v1/organization/wallet/0012345678/",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer access-abc" }),
      }),
    );
  });

  it("loads purchases for the primary CREDIT wallet and pages with cursor", async () => {
    axiosMock.get
      .mockResolvedValueOnce({
        data: [
          {
            id: "wallet-credit",
            title: "اعتبار",
            type: "CREDIT",
            status: "ACTIVE",
            available_balance: 100,
            freeze_balance: 0,
            amount: 100,
          },
        ],
      })
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              uuid: "tx-1",
              amount: 200000,
              created_at: "2026-01-01T10:00:00Z",
            },
            {
              uuid: "tx-2",
              amount: -50000,
              created_at: "2026-01-02T10:00:00Z",
            },
          ],
          metadata: { page: 1, page_size: 2, total_items: 3 },
        },
      });

    const page = await firouzehCreditAdapter.getTransactions(user, config, {});
    expect(page.items).toHaveLength(2);
    expect(page.items[0]?.type).toBe("PURCHASE");
    expect(page.items[1]?.type).toBe("REFUND");
    expect(page.nextCursor).toBe("wallet-credit:2");

    expect(axiosMock.get).toHaveBeenNthCalledWith(
      2,
      "https://api.firouzeh.example/cf/api/v1/organization/wallet/wallet-credit/purchase/",
      expect.objectContaining({
        params: { page: 1, page_size: 2 },
      }),
    );
  });

  it("rejects API installments/merchants via capabilities", () => {
    expect(firouzehCreditAdapter.capabilities.installments).toBe(false);
    expect(firouzehCreditAdapter.capabilities.merchants).toBe(false);
    expect(firouzehCreditAdapter.capabilities.launch).toBe(false);
  });

  it("normalizes host-only base URLs", async () => {
    axiosMock.get.mockResolvedValue({
      data: [
        {
          id: "w1",
          title: "اعتبار",
          type: "CREDIT",
          status: "ACTIVE",
          available_balance: 10,
          freeze_balance: 0,
          amount: 10,
        },
      ],
    });

    await firouzehCreditAdapter.getBalance(user, {
      ...config,
      baseUrl: "api.firouzeh.example",
      authBaseUrl: "auth.firouzeh.example/",
      username: "host-only-user",
    });

    expect(axiosMock.post).toHaveBeenCalledWith(
      "https://auth.firouzeh.example/realms/firouzeh/protocol/openid-connect/token",
      expect.any(String),
      expect.any(Object),
    );
    expect(axiosMock.get).toHaveBeenCalledWith(
      "https://api.firouzeh.example/cf/api/v1/organization/wallet/0012345678/",
      expect.any(Object),
    );
  });
});
