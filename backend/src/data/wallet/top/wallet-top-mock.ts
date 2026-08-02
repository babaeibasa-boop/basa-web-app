/** Hardcoded fixtures for the wallet/top mock API (integration testing only). */

export interface MockWallet {
  WalletCode: string;
  WalletTitle: string;
  Balance: number;
  WalletType: string;
}

export const MOCK_WALLET: MockWallet = {
  WalletCode: "6722bfc822a6e10d6cf21344:MST",
  WalletTitle: "معیشتی باسا",
  Balance: 26000,
  WalletType: "MST",
};

export const MOCK_WALLETS: MockWallet[] = [MOCK_WALLET];

export const MOCK_TRACK_ID = "476546";
