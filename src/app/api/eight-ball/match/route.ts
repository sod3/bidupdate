import { noStoreJson } from "@/lib/api";

// Retired: client-originated winner claims cannot settle pool matches.
export async function POST() {
  return noStoreJson({ error: "Use the authoritative 8 Ball table protocol." }, { status: 410 });
}
