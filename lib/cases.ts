import { fetchAll } from "@/lib/thorData";
import { nowMinutesVN, todayKey, vnDateKey } from "@/lib/vn";
import type { CasesToday, ReaderCases } from "@/lib/dutyTypes";

/**
 * Ca của Reader hôm nay: "ca" = lịch hẹn giờ do Sale gắn vào đơn (bảng order_appointments, hiện ở Danh sách đợi của Reader).
 * Mỗi Reader: các ca còn đợi (giờ), ca đang xử lý (đã tới giờ), số ca đã xong, và số đơn hôm nay Sale giao cho. Nhớ 20 giây.
 */
const TZ = "Asia/Ho_Chi_Minh";
const hhmm = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
const toMin = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};

const g = globalThis as unknown as { __aiOfficeCases?: { at: number; data: CasesToday } };

type Order = { id: string; reader_id: string | null };
type Appt = { order_id: string; appointment_at: string; status: "waiting" | "done" };

export async function getCasesToday(): Promise<CasesToday> {
  const hit = g.__aiOfficeCases;
  if (hit && Date.now() - hit.at < 20_000) return hit.data;
  const today = todayKey();
  // lấy dư 1 ngày hai đầu rồi lọc lại theo giờ Việt Nam
  const from = encodeURIComponent(new Date(Date.now() - 36 * 3600_000).toISOString());
  const to = encodeURIComponent(new Date(Date.now() + 36 * 3600_000).toISOString());
  const [orders, apptsRaw, staff] = await Promise.all([
    fetchAll<Order>("orders", `select=id,reader_id&order_date=eq.${today}&order=id.asc`),
    fetchAll<Appt>("order_appointments", `select=order_id,appointment_at,status&appointment_at=gte.${from}&appointment_at=lt.${to}&order=appointment_at.asc`),
    fetchAll<{ id: string; name: string; role: string }>("staff", "select=id,name,role&order=id.asc"),
  ]);
  const appts = apptsRaw.filter((a) => vnDateKey(a.appointment_at) === today);
  const readerOf = new Map(orders.map((o) => [o.id, o.reader_id]));
  const missing = [...new Set(appts.map((a) => a.order_id))].filter((id) => !readerOf.has(id));
  for (let i = 0; i < missing.length; i += 100) {
    const chunk = missing.slice(i, i + 100);
    for (const o of await fetchAll<Order>("orders", `select=id,reader_id&id=in.(${chunk.join(",")})&order=id.asc`)) readerOf.set(o.id, o.reader_id);
  }
  const name = new Map(staff.filter((s) => s.role === "reader").map((s) => [s.id, s.name]));
  const now = nowMinutesVN();
  const per = new Map<string, ReaderCases>();
  const get = (id: string): ReaderCases => {
    let r = per.get(id);
    if (!r) {
      r = { id, name: name.get(id) ?? "(không rõ)", ordersToday: 0, waiting: [], done: 0, handling: null };
      per.set(id, r);
    }
    return r;
  };
  for (const o of orders) if (o.reader_id && name.has(o.reader_id)) get(o.reader_id).ordersToday++;
  for (const a of appts) {
    const rid = readerOf.get(a.order_id);
    if (!rid || !name.has(rid)) continue;
    const r = get(rid);
    const t = hhmm(a.appointment_at);
    if (a.status === "done") r.done++;
    else r.waiting.push(t);
  }
  for (const r of per.values()) {
    r.waiting.sort();
    r.handling = r.waiting.find((t) => toMin(t) <= now) ?? null;
  }
  const readers = [...per.values()].sort((a, b) => b.ordersToday - a.ordersToday || b.waiting.length - a.waiting.length || a.name.localeCompare(b.name, "vi"));
  const data: CasesToday = {
    date: today,
    totalOrders: readers.reduce((s, r) => s + r.ordersToday, 0),
    totalWaiting: readers.reduce((s, r) => s + r.waiting.length, 0),
    totalDone: readers.reduce((s, r) => s + r.done, 0),
    readers,
  };
  g.__aiOfficeCases = { at: Date.now(), data };
  return data;
}

/** Số liệu giả để xem thử (?duty=demo). */
export async function getCasesDemo(): Promise<CasesToday> {
  const staff = await fetchAll<{ id: string; name: string; role: string; archived?: boolean | null }>("staff", "select=id,name,role,archived&order=id.asc");
  const list = staff.filter((s) => s.role === "reader" && !s.archived).slice(0, 8);
  const times = [["14:00", "15:30"], ["13:30"], ["16:00", "17:15", "18:30"], ["14:45"], [], ["15:00", "16:30"], ["19:00"], ["13:00", "20:00"]];
  const readers: ReaderCases[] = list.map((s, i) => ({
    id: s.id,
    name: s.name,
    ordersToday: 9 - i,
    waiting: times[i % times.length],
    done: i % 4,
    handling: i % 2 === 0 && times[i % times.length].length ? times[i % times.length][0] : null,
  }));
  return {
    date: todayKey(),
    totalOrders: readers.reduce((s, r) => s + r.ordersToday, 0),
    totalWaiting: readers.reduce((s, r) => s + r.waiting.length, 0),
    totalDone: readers.reduce((s, r) => s + r.done, 0),
    readers,
  };
}
