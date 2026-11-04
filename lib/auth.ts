/**
 * Cổng mật khẩu cho bản chạy TRÊN MẠNG. App đọc doanh thu / tên nhân viên của Thor nên KHÔNG BAO GIỜ để mở công khai:
 *  - Có biến OFFICE_PASSWORD  → phải nhập đúng mật khẩu (nhớ bằng cookie 30 ngày).
 *  - Đang ở Vercel mà chưa đặt OFFICE_PASSWORD → KHOÁ HẲN (không ai vào được) cho tới khi đặt.
 *  - Chạy trên máy anh (không có Vercel, không có mật khẩu) → mở như cũ.
 */
export const AUTH_COOKIE = "office_auth";

export type Gate = { mode: "open" } | { mode: "locked" } | { mode: "password"; password: string };

export function gate(): Gate {
  const password = process.env.OFFICE_PASSWORD;
  if (password) return { mode: "password", password };
  return process.env.VERCEL ? { mode: "locked" } : { mode: "open" };
}

/** Mã đặt trong cookie = SHA-256 của mật khẩu + muối (đổi mật khẩu là mọi phiên cũ hết hiệu lực). */
export async function tokenFor(password: string): Promise<string> {
  const data = new TextEncoder().encode(`ai-office|${password}|${process.env.OFFICE_SECRET ?? ""}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** So sánh chuỗi không lộ thời gian (tránh dò từng ký tự). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
