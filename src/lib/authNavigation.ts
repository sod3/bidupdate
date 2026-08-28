export function postLoginDestination(search: string) {
  const requestedNext = new URLSearchParams(search).get("next");
  if (!requestedNext || !requestedNext.startsWith("/") || requestedNext.startsWith("//")) return "/";
  if (requestedNext === "/verify-email" || requestedNext.startsWith("/verify-email?")) return "/";
  return requestedNext;
}
