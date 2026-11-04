import fs from "node:fs";
import path from "node:path";

/**
 * Đọc dữ liệu Thor — CHỈ ĐỌC (GET), chỉ vài bảng được phép. Các AI KHÔNG BAO GIỜ ghi
 * được dữ liệu Thor: không có hàm ghi nào ở đây.
 *
 * Khoá Supabase lấy từ .env.local của Thor (mặc định ../Thor/.env.local, đổi bằng biến
 * THOR_ENV_PATH). Khoá chỉ nằm trên máy chủ cục bộ, KHÔNG bao giờ gửi xuống trình duyệt
 * và KHÔNG đưa vào lời nhắc cho AI — AI chỉ nhận số liệu đã tổng hợp.
 */
const ALLOWED = new Set([
  "orders",
  "staff",
  "qc_reviews",
  "qc_complaints",
  "order_appointments",
  "reader_hours",
]);

type Env = { url: string; key: string };
let cached: Env | null | undefined;

function loadEnv(): Env | null {
  if (cached !== undefined) return cached;
  const p =
    process.env.THOR_ENV_PATH ??
    path.resolve(process.cwd(), "..", "Thor", ".env.local");
  try {
    const map: Record<string, string> = {};
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
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
    cached = url && key ? { url, key } : null;
  } catch {
    cached = null;
  }
  return cached;
}

export function thorConnected(): boolean {
  return loadEnv() !== null;
}

/** Nạp hết các dòng (phân trang) của 1 truy vấn. `query` ĐÃ gồm `order=id.asc`. */
export async function fetchAll<T>(table: string, query: string): Promise<T[]> {
  if (!ALLOWED.has(table)) throw new Error(`Bảng "${table}" không nằm trong danh sách được đọc.`);
  const env = loadEnv();
  if (!env) {
    throw new Error(
      "Chưa kết nối được dữ liệu Thor (không đọc được .env.local của Thor). Đặt biến THOR_ENV_PATH trỏ tới file đó."
    );
  }
  const out: T[] = [];
  const page = 1000;
  for (let off = 0; off <= 50000; off += page) {
    const res = await fetch(
      `${env.url}/rest/v1/${table}?${query}&limit=${page}&offset=${off}`,
      {
        headers: { apikey: env.key, Authorization: `Bearer ${env.key}` },
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

/** Bộ nhớ đệm trong 1 công việc: nhiều AI cùng cần "đơn tháng này" thì chỉ tải 1 lần. */
export class Ctx {
  private memo = new Map<string, Promise<unknown>>();
  get<T>(key: string, load: () => Promise<T>): Promise<T> {
    if (!this.memo.has(key)) this.memo.set(key, load());
    return this.memo.get(key) as Promise<T>;
  }
}
