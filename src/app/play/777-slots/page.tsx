import type { Metadata } from "next";
import { SlotsLoader } from "@/components/slots/SlotsLoader";

export const metadata: Metadata = {
  title: "777 Slots | Play Arena",
  description: "Spin a premium server-verified five-reel Nova 777 slot machine with Play Arena virtual credits.",
};

export default function SlotsPage() {
  return <SlotsLoader />;
}
