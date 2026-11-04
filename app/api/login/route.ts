import { NextResponse } from "next/server";
import { connection } from "next/server";
import { AUTH_COOKIE, gate, safeEqual, tokenFor } from "@/lib/auth";

/** GET: cho trang đăng nhập biết đang ở chế độ nào. POST: kiểm tra mật khẩu, đặt cookie. */
export async function GET() {
  await connection();
  return Response.json({ mode: gate().mode });
}

export async function POST(request: Request) {
  await connection();
  const g = gate();
  if (g.mode === "open") return Response.json({ ok: true });
  if (g.mode === "locked") return Response.json({ error: "Chưa đặt mật khẩu cho bản trên mạng (biến OFFICE_PASSWORD)." }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { password?: string } | null;
  const given = String(body?.password ?? "");
  // làm chậm mỗi lần thử để khó dò mật khẩu
  await new Promise((r) => setTimeout(r, 700));
  if (!given || !safeEqual(await tokenFor(given), await tokenFor(g.password))) {
    return Response.json({ error: "Sai mật khẩu." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, await tokenFor(g.password), {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(request.url).protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
