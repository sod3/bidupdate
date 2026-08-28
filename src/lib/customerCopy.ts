export const customerCopy = {
  brand: "Play Arena",
  balance: "Balance",
  deposit: "Deposit",
  withdraw: "Withdraw",
  playNow: "Play now",
  chooseAmount: "Choose amount",
  customAmount: "Other amount",
  notEnoughBalance: "Not enough balance",
  noGames: "No games here yet.",
  noTransactions: "No transactions yet.",
  tryAgain: "Try again",
  offline: "Internet connection lost",
  home: "Home",
  games: "Games",
  wallet: "Wallet",
  menu: "Menu",
} as const;

export function formatCredits(value: number) {
  return `${Math.max(0, value).toLocaleString("en-PK", { maximumFractionDigits: 2 })} CR`;
}

