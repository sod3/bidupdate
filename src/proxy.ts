import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";

const ADMIN_GUARD_COOKIE = "neon_drift_admin_guard";

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isLogin = pathname === "/admin/login" || pathname === "/api/admin/auth/login";
  if (isLogin) return NextResponse.next();

  const token = request.cookies.get(ADMIN_GUARD_COOKIE)?.value;
  const secret = process.env.JWT_SECRET;
  let allowed = false;
  if (token && secret && secret.length >= 32) {
    try {
      await jwtVerify(token, new TextEncoder().encode(secret), {
        algorithms: ["HS256"],
        issuer: "neon-drift",
        audience: "neon-drift-admin",
      });
      allowed = true;
    } catch {
      allowed = false;
    }
  }
  if (allowed) return NextResponse.next();
  if (pathname.startsWith("/api/admin/")) {
    return NextResponse.json({ error: "Administrator authentication is required." }, { status: 401 });
  }
  const login = new URL("/admin/login", request.url);
  login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
