import { NextResponse, connection } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

export async function POST() {
  await connection();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
