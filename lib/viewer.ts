import { cookies } from "next/headers";
import { LOCAL_ADMIN, SESSION_COOKIE, authMode, readSession, type Session } from "@/lib/session";

/** Người đang dùng (đọc từ cookie đã ký). Chế độ mở (chạy trên máy) → chủ máy, quyền admin. Chưa đăng nhập → null. */
export async function getViewer(): Promise<Session | null> {
  const mode = authMode();
  if (mode === "open") return LOCAL_ADMIN;
  if (mode === "locked") return null;
  const jar = await cookies();
  return readSession(jar.get(SESSION_COOKIE)?.value);
}

export const deny = (status = 403, error = "Yêu Cầu Quyền Truy Cập") => Response.json({ error, denied: true }, { status });

/** Dùng đầu mỗi route chỉ dành cho admin: trả về [viewer, null] hoặc [null, Response chặn]. */
export async function adminOnly(): Promise<[Session, null] | [null, Response]> {
  const v = await getViewer();
  if (!v) return [null, deny(401, "Cần đăng nhập")];
  if (!v.admin) return [null, deny()];
  return [v, null];
}
