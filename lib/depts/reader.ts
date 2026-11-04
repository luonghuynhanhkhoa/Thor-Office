import { fetchAll, type Ctx } from "@/lib/thorData";
import { allStaff, computePayroll, waitingAppts, monthOrders } from "@/lib/queries";
import { BASE_RULES, list, type AgentLogic } from "@/lib/logicTypes";
import { formatVND, hhmmToMin, nowMinutesVN, todayKey } from "@/lib/vn";

/** PHÒNG READER — Quản lý đơn của Reader · Vận hành (giờ trực, lịch hẹn). */

// ---------------------------------------------------------- Reader · Quản lý
type ReaderManage = {
  tongDonCoReader: number;
  donTreo: number;
  readers: { ten: string; don: number; doanhThu: number; upsalePct: number; thuong: string; luong: number }[];
};

async function gatherReaderManage(ctx: Ctx): Promise<ReaderManage> {
  const [pay, orders] = await Promise.all([computePayroll(ctx), monthOrders(ctx)]);
  const rows = pay.rows
    .filter((r) => r.role === "reader" && r.orderCount > 0)
    .sort((a, b) => b.orderCount - a.orderCount)
    .map((r) => ({
      ten: r.name,
      don: r.orderCount,
      doanhThu: r.revenue,
      upsalePct: Math.round((r.upsaleRate ?? 0) * 1000) / 10,
      thuong: `+${Math.round((r.bonusRate ?? 0) * 100)}%`,
      luong: Math.round(r.salary),
    }));
  return { tongDonCoReader: orders.filter((o) => o.reader_id).length, donTreo: pay.held, readers: rows };
}

function simReaderManage(d: ReaderManage): string {
  if (d.readers.length === 0) return "Tháng này chưa có đơn nào gắn Reader.";
  return [
    `**${d.tongDonCoReader} đơn** đã gắn Reader trong tháng (đơn đang treo chờ hẹn xong: ${d.donTreo}).`,
    "Theo Reader (số đơn cao → thấp) — upsale tự làm / mức thưởng:",
    ...d.readers.map((r) => `- ${r.ten}: ${r.don} đơn · ${formatVND(r.doanhThu)} · upsale ${r.upsalePct}% (${r.thuong})`),
  ].join("\n");
}

// --------------------------------------------------------- Reader · Vận hành
type Slot = { kind: "work" | "off"; allDay?: boolean; start?: string | null; end?: string | null };
type ReaderOps = {
  homNay: string;
  dangTruc: string[];
  sapTruc: string[];
  hetCa: string[];
  nghiCaNgay: string[];
  chuaDangKy: string[];
  lichDoiQuaGio: { reader: string; soLich: number }[];
  tongLichDoi: number;
};

async function gatherReaderOps(ctx: Ctx): Promise<ReaderOps> {
  const today = todayKey();
  const [hours, staff, waiting, orders] = await Promise.all([
    fetchAll<{ reader_id: string; start_time: string | null; end_time: string | null; slots: Slot[] | null }>(
      "reader_hours",
      `select=reader_id,start_time,end_time,slots&work_date=eq.${today}&order=id.asc`
    ),
    allStaff(ctx),
    waitingAppts(ctx),
    monthOrders(ctx),
  ]);
  const readers = staff.filter((s) => s.role === "reader" && !s.archived);
  const nameOf = new Map(staff.map((s) => [s.id, s.name]));
  const now = nowMinutesVN();
  const on: string[] = [];
  const soon: string[] = [];
  const done: string[] = [];
  const offAll: string[] = [];
  const registered = new Set<string>();
  for (const h of hours) {
    if (!readers.some((r) => r.id === h.reader_id)) continue;
    registered.add(h.reader_id);
    const name = nameOf.get(h.reader_id) ?? "?";
    const s = hhmmToMin(h.start_time);
    const e = hhmmToMin(h.end_time);
    if (s === null || e === null) {
      offAll.push(name);
      continue;
    }
    const inOff = (h.slots ?? [])
      .filter((x) => x.kind === "off" && !x.allDay)
      .some((x) => {
        const a = hhmmToMin(x.start ?? null);
        const b = hhmmToMin(x.end ?? null);
        return a !== null && b !== null && now >= a && now < b;
      });
    if (now < s) soon.push(`${name} (${h.start_time?.slice(0, 5)})`);
    else if (now >= e) done.push(name);
    else on.push(inOff ? `${name} (nghỉ giữa ca)` : name);
  }

  // Lịch hẹn đang đợi mà quá giờ, gom theo Reader phụ trách.
  const byOrder = new Map(orders.map((o) => [o.id, o]));
  const over = new Map<string, number>();
  for (const w of waiting) {
    if (new Date(w.appointment_at).getTime() >= Date.now()) continue;
    const o = byOrder.get(w.order_id);
    const k = o?.reader_id ? (nameOf.get(o.reader_id) ?? "?") : "(chưa gán Reader)";
    over.set(k, (over.get(k) ?? 0) + 1);
  }
  return {
    homNay: today,
    dangTruc: on,
    sapTruc: soon,
    hetCa: done,
    nghiCaNgay: offAll,
    chuaDangKy: readers.filter((r) => !registered.has(r.id)).map((r) => r.name),
    lichDoiQuaGio: [...over.entries()].map(([reader, soLich]) => ({ reader, soLich })).sort((a, b) => b.soLich - a.soLich),
    tongLichDoi: waiting.length,
  };
}

function simReaderOps(d: ReaderOps): string {
  return [
    `Vận hành Reader hôm nay ${d.homNay}:`,
    `- 🟢 Đang trực (${d.dangTruc.length}): ${list(d.dangTruc)}`,
    `- 🟡 Sắp trực (${d.sapTruc.length}): ${list(d.sapTruc)}`,
    `- ⚪ Hết ca (${d.hetCa.length}): ${list(d.hetCa)}`,
    `- 🟠 Nghỉ cả ngày (${d.nghiCaNgay.length}): ${list(d.nghiCaNgay)}`,
    d.chuaDangKy.length ? `- ⚠️ Chưa đăng ký giờ hôm nay (${d.chuaDangKy.length}): ${d.chuaDangKy.join(", ")}` : "- ✅ Mọi Reader đã đăng ký giờ hôm nay",
    d.lichDoiQuaGio.length
      ? `- ⚠️ Lịch đợi quá giờ (trên ${d.tongLichDoi} lịch đang đợi): ${d.lichDoiQuaGio.map((x) => `${x.reader} ${x.soLich}`).join("; ")}`
      : `- ✅ Không có lịch đợi quá giờ (đang đợi ${d.tongLichDoi})`,
  ].join("\n");
}

export const READER_LOGIC: Record<"reader_manage" | "reader_ops", AgentLogic> = {
  reader_manage: {
    system:
      BASE_RULES +
      " NHÁNH CỦA BẠN (Phòng Reader · Quản lý): quản lý các đơn của Reader — số đơn, doanh thu, tỷ lệ upsale tự làm và bậc thưởng.",
    keywords: ["reader", "don reader", "upsale", "thuong upsale", "luan giai"],
    gather: gatherReaderManage,
    sim: simReaderManage as AgentLogic["sim"],
  },
  reader_ops: {
    system:
      BASE_RULES +
      " NHÁNH CỦA BẠN (Phòng Reader · Vận hành): vận hành của Reader — giờ trực hôm nay (đang trực/sắp trực/hết ca/nghỉ), ai chưa đăng ký, lịch hẹn đợi quá giờ.",
    keywords: ["reader", "truc", "gio truc", "ai dang", "ca lam", "nghi", "offline", "lich doi", "danh sach doi", "hen"],
    gather: gatherReaderOps,
    sim: simReaderOps as AgentLogic["sim"],
  },
};
