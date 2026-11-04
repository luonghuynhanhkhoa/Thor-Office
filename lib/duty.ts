import { fetchAll } from "@/lib/thorData";
import { hhmmToMin, nowMinutesVN, todayKey } from "@/lib/vn";
import type { DutyStaff } from "@/lib/dutyTypes";

/**
 * Ai đang trong giờ trực hôm nay (Reader + Saler; cùng bảng reader_hours của Thor).
 * Chỉ trả người ĐANG trực / nghỉ giữa ca / sắp trực; người hết ca, nghỉ cả ngày hay chưa đăng ký giờ thì không hiện.
 * Nhớ 20 giây để không dồn tải lên Thor.
 */
type Slot = { kind: "work" | "off"; allDay?: boolean; start?: string | null; end?: string | null };

const g = globalThis as unknown as { __aiOfficeDuty?: { at: number; data: DutyStaff[] } };

export async function getDuty(): Promise<DutyStaff[]> {
  const hit = g.__aiOfficeDuty;
  if (hit && Date.now() - hit.at < 20_000) return hit.data;

  const today = todayKey();
  const [hours, staff] = await Promise.all([
    fetchAll<{ reader_id: string; start_time: string | null; end_time: string | null; slots: Slot[] | null }>(
      "reader_hours",
      `select=reader_id,start_time,end_time,slots&work_date=eq.${today}&order=id.asc`
    ),
    fetchAll<{ id: string; name: string; role: string; archived?: boolean | null }>("staff", "select=id,name,role,archived&order=id.asc"),
  ]);
  const people = new Map(staff.filter((s) => (s.role === "reader" || s.role === "saler") && !s.archived).map((s) => [s.id, s]));
  const now = nowMinutesVN();
  const out: DutyStaff[] = [];
  const seen = new Set<string>();
  for (const h of hours) {
    const p = people.get(h.reader_id);
    if (!p || seen.has(p.id)) continue;
    const s = hhmmToMin(h.start_time);
    const e = hhmmToMin(h.end_time);
    if (s === null || e === null) continue; // nghỉ cả ngày
    seen.add(p.id);
    const role = p.role as "reader" | "saler";
    const base = { id: p.id, name: p.name, role, from: h.start_time?.slice(0, 5), to: h.end_time?.slice(0, 5) };
    if (now < s) out.push({ ...base, state: "soon" });
    else if (now >= e) continue; // đã hết ca
    else {
      const inOff = (h.slots ?? [])
        .filter((x) => x.kind === "off" && !x.allDay)
        .some((x) => {
          const a = hhmmToMin(x.start ?? null);
          const b = hhmmToMin(x.end ?? null);
          return a !== null && b !== null && now >= a && now < b;
        });
      out.push({ ...base, state: inOff ? "break" : "on" });
    }
  }
  g.__aiOfficeDuty = { at: Date.now(), data: out };
  return out;
}

/** Dữ liệu giả để xem thử giao diện khi hiện tại không có ai trực (thêm ?duty=demo vào địa chỉ). */
export async function getDutyDemo(): Promise<DutyStaff[]> {
  const staff = await fetchAll<{ id: string; name: string; role: string; archived?: boolean | null }>("staff", "select=id,name,role,archived&order=id.asc");
  const live = staff.filter((s) => !s.archived);
  const readers = live.filter((s) => s.role === "reader").slice(0, 10);
  const salers = live.filter((s) => s.role === "saler").slice(0, 5);
  const pick = (list: typeof live, role: "reader" | "saler"): DutyStaff[] =>
    list.map((p, i) => ({ id: p.id, name: p.name, role, state: i % 3 === 2 ? "soon" : i % 7 === 6 ? "break" : "on", from: "08:00", to: "17:00" }));
  return [...pick(readers, "reader"), ...pick(salers, "saler")];
}
