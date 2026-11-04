import { NextResponse, connection } from "next/server";
import { envProblem, fetchAll, passwordLogin, thorConnected } from "@/lib/thorData";
import { SESSION_COOKIE, SESSION_TTL_S, authMode, signSession } from "@/lib/session";

/** GET: cho trang đăng nhập biết chế độ. POST: đăng nhập bằng email + mật khẩu CỦA TÀI KHOẢN THOR, rồi cấp phiên đã ký. */
export async function GET() {
  await connection();
  return Response.json({ mode: authMode(), problem: envProblem() });
}

export async function POST(request: Request) {
  await connection();
  const mode = authMode();
  if (mode === "open") return Response.json({ ok: true });
  if (mode === "locked" || !thorConnected()) {
    return Response.json({ error: envProblem() ?? "Bản trên mạng chưa được cấu hình đủ (thiếu khoá Thor)." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { email?: string; password?: string } | null;
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  await new Promise((r) => setTimeout(r, 700)); // làm chậm mỗi lần thử để khó dò mật khẩu
  if (!email || !password) return Response.json({ error: "Nhập email và mật khẩu." }, { status: 400 });

  try {
    const user = await passwordLogin(email, password);
    if (!user) return Response.json({ error: "Sai email hoặc mật khẩu." }, { status: 401 });
    const prof = (
      await fetchAll<{ id: string; email: string | null; role: string; role2: string | null; staff_id: string | null; staff_id2: string | null }>(
        "profiles",
        `select=id,email,role,role2,staff_id,staff_id2&id=eq.${user.id}&order=id.asc`
      )
    )[0];
    if (!prof) return Response.json({ error: "Tài khoản này chưa có hồ sơ trong Thor." }, { status: 403 });
    const staffIds = [prof.staff_id, prof.staff_id2].filter((x): x is string => !!x);
    let name = (prof.email ?? email).split("@")[0];
    if (staffIds[0]) {
      const s = (await fetchAll<{ id: string; name: string }>("staff", `select=id,name&id=eq.${staffIds[0]}&order=id.asc`))[0];
      if (s) name = s.name;
    }
    const token = await signSession({ uid: user.id, email: user.email, name, admin: prof.role === "admin" || prof.role2 === "admin", role: prof.role, staffIds });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: new URL(request.url).protocol === "https:", path: "/", maxAge: SESSION_TTL_S });
    return res;
  } catch {
    return Response.json({ error: "Không đăng nhập được lúc này, thử lại sau." }, { status: 500 });
  }
}
