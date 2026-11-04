/**
 * PHIÊN ĐĂNG NHẬP bằng tài khoản của Thor (Supabase Auth). Cookie `office_session` do máy chủ ký (HMAC-SHA256),
 * trình duyệt không tự làm giả được. Quyền:
 *  - admin (bang chủ): xem được mọi thứ.
 *  - Reader/Saler/QC: CHỈ thấy thông tin của chính mình; Tivi, bảng, người khác, câu hỏi về người khác/phòng khác → bị chặn.
 * Chạy trên máy anh (không Vercel) mà chưa bật đăng nhập → mở như cũ với quyền admin (chủ máy).
 */
export const SESSION_COOKIE = "office_session";
export const SESSION_TTL_S = 60 * 60 * 24 * 7;

export type Session = {
  uid: string;
  email: string;
  name: string;
  admin: boolean;
  /** Vai trò chính trong Thor (admin | reader | saler | qc). */
  role: string;
  /** Mã nhân sự (staff.id) của chính người này — 1 hoặc 2 (tài khoản kiêm 2 vai trò). */
  staffIds: string[];
  exp: number;
};

export type AuthMode = "open" | "login" | "locked";

function secretMaterial(): string | null {
  return process.env.OFFICE_SECRET || process.env.THOR_SUPABASE_SERVICE_KEY || null;
}

/** open = không cần đăng nhập (chỉ khi chạy trên máy, không đặt OFFICE_FORCE_LOGIN) · login = đăng nhập tài khoản Thor · locked = bản mạng thiếu khoá → khoá hẳn. */
export function authMode(): AuthMode {
  const forced = !!process.env.VERCEL || process.env.OFFICE_FORCE_LOGIN === "1";
  if (!forced) return "open";
  return secretMaterial() ? "login" : "locked";
}

export const LOCAL_ADMIN: Session = { uid: "local", email: "", name: "Chủ máy", admin: true, role: "admin", staffIds: [], exp: 0 };

const enc = new TextEncoder();
const b64 = (buf: ArrayBuffer | Uint8Array) => {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const c of u) s += String.fromCharCode(c);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function hmacKey(): Promise<CryptoKey | null> {
  const m = secretMaterial();
  if (!m) return null;
  const base = await crypto.subtle.digest("SHA-256", enc.encode(`ai-office-session|${m}`));
  return crypto.subtle.importKey("raw", base, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signSession(s: Omit<Session, "exp">): Promise<string> {
  const key = await hmacKey();
  if (!key) throw new Error("Chưa có khoá ký phiên");
  const payload = b64(enc.encode(JSON.stringify({ ...s, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_S })));
  const sig = b64(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
  return `${payload}.${sig}`;
}

export async function readSession(token: string | undefined | null): Promise<Session | null> {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const key = await hmacKey();
  if (!key) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", key, unb64(sig), enc.encode(payload));
    if (!ok) return null;
    const s = JSON.parse(new TextDecoder().decode(unb64(payload))) as Session;
    return s.exp > Math.floor(Date.now() / 1000) ? s : null;
  } catch {
    return null;
  }
}

/** Tên kênh chat đã băm (HMAC) — không đoán được từ mã người dùng; chỉ máy chủ biết cách tính. */
export async function chatChannel(name: string): Promise<string> {
  const key = await hmacKey();
  if (!key) return `chat-local-${name}`.slice(0, 64);
  return `c${b64(await crypto.subtle.sign("HMAC", key, enc.encode(`chat|${name}`))).slice(0, 24)}`;
}

/** Các kênh chat mà người này được nghe: thế giới + hộp thư riêng của mình (+ giám sát nếu là Admin). */
export async function chatChannelsFor(uid: string, admin: boolean): Promise<{ world: string; inbox: string; admin?: string }> {
  return {
    world: await chatChannel("world"),
    inbox: await chatChannel(`inbox:${uid}`),
    ...(admin ? { admin: await chatChannel("admin") } : {}),
  };
}

/** Mã kênh thời gian thực: khó đoán, đổi mỗi ngày, chỉ người đã đăng nhập mới biết (kênh Supabase là kênh công khai). */
export async function channelNamespace(): Promise<string> {
  const key = await hmacKey();
  if (!key) return "local";
  const day = new Date().toISOString().slice(0, 10);
  return b64(await crypto.subtle.sign("HMAC", key, enc.encode(`rt|${day}`))).slice(0, 24);
}
