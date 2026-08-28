import type { Metadata } from "next";
import { WalletActionForm } from "@/components/wallet/WalletActionForm";

export const metadata: Metadata = { title: "Deposit | Play Arena" };

export default function DepositPage() {
  return <WalletActionForm type="TOP_UP" />;
}

