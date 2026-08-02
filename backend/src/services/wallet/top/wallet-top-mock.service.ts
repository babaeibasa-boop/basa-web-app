import {
  MOCK_TRACK_ID,
  MOCK_WALLETS,
  type MockWallet,
} from "../../../data/wallet/top/wallet-top-mock.js";

export interface CreatePurchaseInput {
  WalletCode: string;
  Amount: number;
  MerchantBrandName: string;
  MerchantClientCode: string;
  ReferenceCode: string;
}

export interface ReverseTransactionInput {
  ReferenceCode: string;
}

export interface ReverseTransactionPartialInput {
  ReferenceCode: string;
  Amount: number;
}

export async function checkUserExists(_mobileNumber: string): Promise<{ clientExist: boolean }> {
  return { clientExist: true };
}

export async function getUserWallets(_mobileNumber: string): Promise<{ Wallets: MockWallet[] }> {
  return { Wallets: MOCK_WALLETS };
}

export async function getWallet(walletCode: string): Promise<MockWallet | undefined> {
  const wallet = MOCK_WALLETS.find((w) => w.WalletCode === walletCode);
  if (!wallet) {
    return;
  }
  return wallet;
}

export async function createPurchase(
  input: CreatePurchaseInput,
): Promise<{
  success: boolean;
  message: string;
  track_id: string;
  referenceCode: string;
}> {
  return {
    success: true,
    message: "success",
    track_id: MOCK_TRACK_ID,
    referenceCode: input.ReferenceCode,
  };
}

export async function reverseTransaction(
  input: ReverseTransactionInput,
): Promise<{
  success: boolean;
  message: string;
  referenceCode: string;
}> {
  return {
    success: true,
    message: "success",
    referenceCode: input.ReferenceCode,
  };
}

export async function reverseTransactionPartial(
  input: ReverseTransactionPartialInput,
): Promise<{
  success: boolean;
  message: string;
  refundAmount: number;
  referenceCode: string;
}> {
  return {
    success: true,
    message: "success",
    refundAmount: input.Amount,
    referenceCode: input.ReferenceCode,
  };
}

export async function inquiry(
  referenceCode: string | undefined,
): Promise<{
  success: boolean;
  message: string;
  track_id: string;
  referenceCode: string;
} | undefined> {
  if (!referenceCode) {
    return
  }
  return {
    success: true,
    message: "success",
    track_id: MOCK_TRACK_ID,
    referenceCode,
  };
}
