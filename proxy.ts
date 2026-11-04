import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, gate, safeEqual, tokenFor } from "@/lib/auth";

/** Cổng mật khẩu (xem lib/auth.ts). Chạy trên máy anh không đặt mật khẩu thì không chặn gì. */
export async function proxy(request: NextRequest) {
  const g = gate();
  if (g.mode === "open") return NextResponse.next();

  const path = request.nextUrl.pathname;
  if (path === "/login" || path === "/api/login") return NextResponse.next();

  const isApi = path.startsWith("/api/");
  if (g.mode === "locked") {
    return isApi
      ? NextResponse.json({ error: "Bản trên mạng đang khoá: chưa đặt OFFICE_PASSWORD" }, { status: 503 })
      : NextResponse.redirect(new URL("/login", request.url));
  }

  const cookie = request.cookies.get(AUTH_COOKIE)?.value ?? "";
  if (cookie && safeEqual(cookie, await tokenFor(g.password))) return NextResponse.next();
  return isApi ? NextResponse.json({ error: "Cần đăng nhập" }, { status: 401 }) : NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
