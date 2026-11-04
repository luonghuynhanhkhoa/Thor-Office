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
  const order = [...people.keys()].sort();
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
    const offs = (h.slots ?? []).filter((x) => x.kind === "off" && !x.allDay && hhmmToMin(x.start ?? null) !== null && hhmmToMin(x.end ?? null) !== null);
    const note = offs.length ? `nghỉ ${offs.map((x) => `${x.start?.slice(0, 5)}–${x.end?.slice(0, 5)}`).join(", ")}` : undefined;
    const base = { id: p.id, name: p.name, role, idx: order.indexOf(p.id), from: h.start_time?.slice(0, 5), to: h.end_time?.slice(0, 5), note };
    if (now < s) out.push({ ...base, state: "soon" });
    else if (now >= e) out.push({ ...base, state: "done" }); // đã hết ca: chỉ hiện trên bảng ca
    else {
      const inOff = offs.some((x) => now >= (hhmmToMin(x.start ?? null) ?? 0) && now < (hhmmToMin(x.end ?? null) ?? 0));
      out.push({ ...base, state: inOff ? "break" : "on" });
    }
  }
  out.sort((a, b) => (a.from ?? "").localeCompare(b.from ?? "") || a.name.localeCompare(b.name, "vi"));
  g.__aiOfficeDuty = { at: Date.now(), data: out };
  return out;
}

/** Dữ liệu giả để xem thử giao diện khi hiện tại không có ai trực (thêm ?duty=demo vào địa chỉ). */
export async function getDutyDemo(): Promise<DutyStaff[]> {
  const staff = await fetchAll<{ id: string; name: string; role: string; archived?: boolean | null }>("staff", "select=id,name,role,archived&order=id.asc");
  const live = staff.filter((s) => !s.archived);
  const readers = live.filter((s) => s.role === "reader").slice(0, 10);
  const salers = live.filter((s) => s.role === "saler").slice(0, 5);
  const order = live.filter((s) => s.role === "reader" || s.role === "saler").map((s) => s.id).sort();
  const pick = (list: typeof live, role: "reader" | "saler"): DutyStaff[] =>
    list.map((p, i) => {
      const slot = [["08:00", "12:00"], ["09:00", "17:00"], ["13:00", "21:00"], ["14:00", "22:00"], ["06:00", "10:00"]][i % 5];
      return { id: p.id, name: p.name, role, idx: order.indexOf(p.id), state: i % 5 === 4 ? "done" : i % 3 === 2 ? "soon" : i % 7 === 6 ? "break" : "on", from: slot[0], to: slot[1], note: i % 4 === 1 ? "nghỉ 12:00–13:00" : undefined } as DutyStaff;
    });
  return [...pick(readers, "reader"), ...pick(salers, "saler")];
}
