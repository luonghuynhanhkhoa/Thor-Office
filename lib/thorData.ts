import fs from "node:fs";
import path from "node:path";

/**
 * Đọc dữ liệu Thor — CHỈ ĐỌC (GET), chỉ các bảng trong danh sách cho phép. Các AI KHÔNG
 * BAO GIỜ ghi được dữ liệu Thor: không có hàm ghi nào ở đây.
 *
 * Khoá Supabase lấy từ .env.local của Thor (mặc định ../Thor/.env.local, đổi bằng biến
 * THOR_ENV_PATH). Khoá chỉ nằm trên máy chủ cục bộ, KHÔNG bao giờ gửi xuống trình duyệt
 * và KHÔNG đưa vào lời nhắc cho AI — AI chỉ nhận số liệu đã tổng hợp.
 */
const ALLOWED = new Set([
  "orders",
  "staff",
  "profiles",
  "qc_reviews",
  "qc_complaints",
  "qc_monthly_reviews",
  "qc_settings",
  "order_appointments",
  "reader_hours",
  "salary_advances",
  "salary_bonuses",
  "operating_costs",
  "package_prices",
  "profit_settings",
  "today_revenue_settings",
  "activity_log",
]);

type Env = { url: string; key: string; pub?: string };
let cached: Env | null | undefined;

function envPath(): string {
  return process.env.THOR_ENV_PATH ?? path.resolve(process.cwd(), "..", "Thor", ".env.local");
}

/** Thư mục gốc của dự án Thor (chứa .env.local) — để các AI đọc mã nguồn. */
export function thorRoot(): string {
  return path.dirname(envPath());
}

function loadEnv(): Env | null {
  if (cached !== undefined) return cached;
  // Bản chạy trên mạng (Vercel): khoá nằm trong biến môi trường, không có file .env.local của Thor.
  const envUrl = process.env.THOR_SUPABASE_URL;
  const envKey = process.env.THOR_SUPABASE_SERVICE_KEY;
  if (envUrl && envKey) {
    // Khoá "publishable" (công khai) bị luật bảo mật của Supabase chặn → đọc ra rỗng. Coi như CHƯA nối để huy hiệu báo đúng.
    cached = envKey.trim().startsWith("sb_publishable_") ? null : { url: envUrl.trim(), key: envKey.trim(), pub: process.env.THOR_SUPABASE_PUBLISHABLE_KEY?.trim() || undefined };
    return cached;
  }
  try {
    const map: Record<string, string> = {};
    for (const line of fs.readFileSync(/*turbopackIgnore: true*/ envPath(), "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      map[t.slice(0, i).trim()] = t
        .slice(i + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
    }
    const url = map.NEXT_PUBLIC_SUPABASE_URL;
    const key = map.SUPABASE_SERVICE_ROLE_KEY;
    cached = url && key ? { url, key, pub: map.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined } : null;
  } catch {
    cached = null;
  }
  return cached;
}

export function thorConnected(): boolean {
  return loadEnv() !== null;
}

/** Khoá kiểu mới (sb_secret_…) chỉ gửi qua header apikey (không phải JWT); khoá JWT kiểu cũ gửi thêm Authorization. */
function authHeaders(env: Env): Record<string, string> {
  return env.key.startsWith("sb_") ? { apikey: env.key } : { apikey: env.key, Authorization: `Bearer ${env.key}` };
}

function needEnv(): Env {
  const env = loadEnv();
  if (!env) {
    throw new Error(
      "Chưa kết nối được dữ liệu Thor (không đọc được .env.local của Thor). Đặt biến THOR_ENV_PATH trỏ tới file đó."
    );
  }
  return env;
}

/** Nạp hết các dòng (phân trang) của 1 truy vấn. `query` ĐÃ gồm `order=id.asc`. */
export async function fetchAll<T>(table: string, query: string): Promise<T[]> {
  if (!ALLOWED.has(table)) throw new Error(`Bảng "${table}" không nằm trong danh sách được đọc.`);
  const env = needEnv();
  const out: T[] = [];
  const page = 1000;
  for (let off = 0; off <= 50000; off += page) {
    const res = await fetch(
      `${env.url}/rest/v1/${table}?${query}&limit=${page}&offset=${off}`,
      {
        headers: authHeaders(env),
        cache: "no-store",
      }
    );
    if (!res.ok) throw new Error(`Đọc bảng ${table} lỗi (${res.status}).`);
    const rows = (await res.json()) as T[];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

/** Đếm số dòng của 1 bảng (không tải dữ liệu) — dùng để theo dõi dung lượng/tải. */
export async function countRows(table: string, filter = ""): Promise<number> {
  if (!ALLOWED.has(table)) throw new Error(`Bảng "${table}" không nằm trong danh sách được đọc.`);
  const env = needEnv();
  const res = await fetch(`${env.url}/rest/v1/${table}?select=id${filter ? `&${filter}` : ""}&limit=1`, {
    headers: { ...authHeaders(env), Prefer: "count=exact" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Đếm bảng ${table} lỗi (${res.status}).`);
  const range = res.headers.get("content-range") ?? "";
  const total = Number(range.split("/")[1]);
  return Number.isFinite(total) ? total : 0;
}

export type AuthUser = {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  banned_until: string | null;
};

/** Danh sách tài khoản đăng nhập (chỉ ĐỌC: email, lần đăng nhập gần nhất, tình trạng tạm ngưng). */
export async function fetchAuthUsers(): Promise<AuthUser[]> {
  const env = needEnv();
  const out: AuthUser[] = [];
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(`${env.url}/auth/v1/admin/users?page=${page}&per_page=1000`, {
      headers: authHeaders(env),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Đọc danh sách đăng nhập lỗi (${res.status}).`);
    const json = (await res.json()) as { users?: AuthUser[] };
    const users = json.users ?? [];
    out.push(...users);
    if (users.length < 1000) break;
  }
  return out;
}

/** Bộ nhớ đệm trong 1 công việc: nhiều AI cùng cần "đơn tháng này" thì chỉ tải 1 lần. */
export class Ctx {
  private memo = new Map<string, Promise<unknown>>();
  get<T>(key: string, load: () => Promise<T>): Promise<T> {
    if (!this.memo.has(key)) this.memo.set(key, load());
    return this.memo.get(key) as Promise<T>;
  }
}

/** Chẩn đoán kết nối Thor (KHÔNG lộ khoá): thử đọc 1 dòng bảng staff bằng 2 cách gửi khoá, báo mã trả về. */
export async function diagnose(): Promise<Record<string, unknown>> {
  const env = loadEnv();
  if (!env) return { connected: false, note: "Chưa có THOR_SUPABASE_URL / THOR_SUPABASE_SERVICE_KEY (hoặc file .env.local của Thor)." };
  let host = "?";
  try {
    host = new URL(env.url).host;
  } catch {
    host = `URL không hợp lệ (độ dài ${env.url.length})`;
  }
  const kind = env.key.startsWith("sb_secret_") ? "sb_secret" : env.key.startsWith("sb_publishable_") ? "sb_publishable (SAI loại khoá!)" : env.key.startsWith("eyJ") ? "jwt-legacy" : "không nhận ra";
  const hadSpace = env.key !== env.key.trim() || env.url !== env.url.trim();
  const variants: Record<string, Record<string, string>> = {
    "chi-apikey": { apikey: env.key },
    "apikey+bearer": { apikey: env.key, Authorization: `Bearer ${env.key}` },
  };
  const results: Record<string, string> = {};
  for (const [name, headers] of Object.entries(variants)) {
    try {
      const res = await fetch(`${env.url.trim()}/rest/v1/staff?select=id&limit=1`, { headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, v.trim()])), cache: "no-store" });
      const body = (await res.text()).slice(0, 160);
      results[name] = `${res.status} ${body}`;
    } catch (e) {
      results[name] = `LỖI mạng: ${(e as Error).message}`;
    }
  }
  return { connected: true, host, keyKind: kind, keyLength: env.key.length, coKhoangTrang: hadSpace, results };
}

/** Địa chỉ + khoá CÔNG KHAI (publishable) của Thor để trình duyệt nối kênh thời gian thực (gọi họp, chọc/đấm/icon). Không có → tính năng đó tắt. */
export function thorPublic(): { url: string; key: string } | null {
  const e = loadEnv();
  return e?.pub ? { url: e.url, key: e.pub } : null;
}

/** Kiểm tra email + mật khẩu bằng Supabase Auth của Thor. Chỉ lấy mã người dùng, KHÔNG giữ token. Sai → null. */
export async function passwordLogin(email: string, password: string): Promise<{ id: string; email: string } | null> {
  const env = needEnv();
  const res = await fetch(`${env.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.pub ?? env.key, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { user?: { id?: string; email?: string } };
  return j.user?.id ? { id: j.user.id, email: j.user.email ?? email } : null;
}
/** Vì sao chưa nối được Thor (chỉ nêu TÊN biến thiếu/sai, không lộ giá trị) — để trang đăng nhập báo đúng chỗ cần sửa. */
export function envProblem(): string | null {
  if (loadEnv()) return null;
  const url = process.env.THOR_SUPABASE_URL;
  const key = process.env.THOR_SUPABASE_SERVICE_KEY;
  if (url || key) {
    if (!url) return "Thiếu biến THOR_SUPABASE_URL trên Vercel.";
    if (!key) return "Thiếu biến THOR_SUPABASE_SERVICE_KEY trên Vercel.";
    if (key.trim().startsWith("sb_publishable_")) return "Biến THOR_SUPABASE_SERVICE_KEY đang là khoá PUBLISHABLE — phải là khoá SECRET (sb_secret_…). Khoá publishable chỉ dán vào THOR_SUPABASE_PUBLISHABLE_KEY.";
  }
  return "Chưa có THOR_SUPABASE_URL / THOR_SUPABASE_SERVICE_KEY.";
}
