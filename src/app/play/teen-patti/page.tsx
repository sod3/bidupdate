import type { Metadata } from "next";
import { TeenPattiLoader } from "@/components/teen-patti/TeenPattiLoader";

export const metadata: Metadata = {
  title: "Teen Patti | Play Arena",
  description: "Play premium three-card Teen Patti against Expert AI with server-verified virtual credits.",
};

export default function TeenPattiPage() {
  return <TeenPattiLoader />;
}
