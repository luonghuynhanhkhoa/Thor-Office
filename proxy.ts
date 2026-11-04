import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authMode, readSession } from "@/lib/session";

/**
 * Cổng đăng nhập: chạy trên máy anh (không Vercel) thì mở như cũ; bản trên mạng bắt buộc có phiên hợp lệ
 * (đăng nhập bằng tài khoản Thor). Quyền chi tiết (ai xem được gì) do từng API kiểm tra lại ở máy chủ.
 */
export async function proxy(request: NextRequest) {
  const mode = authMode();
  if (mode === "open") return NextResponse.next();

  const path = request.nextUrl.pathname;
  if (path === "/login" || path === "/api/login" || path === "/api/logout") return NextResponse.next();

  const isApi = path.startsWith("/api/");
  if (mode === "locked") {
    return isApi ? NextResponse.json({ error: "Bản trên mạng đang khoá: chưa cấu hình khoá Thor" }, { status: 503 }) : NextResponse.redirect(new URL("/login", request.url));
  }
  const s = await readSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (s) return NextResponse.next();
  return isApi ? NextResponse.json({ error: "Cần đăng nhập" }, { status: 401 }) : NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
