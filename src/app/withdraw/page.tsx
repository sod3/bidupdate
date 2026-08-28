import type { Metadata } from "next";
import { WalletActionForm } from "@/components/wallet/WalletActionForm";

export const metadata: Metadata = { title: "Withdraw | Play Arena" };

export default function WithdrawPage() {
  return <WalletActionForm type="WITHDRAWAL" />;
}
