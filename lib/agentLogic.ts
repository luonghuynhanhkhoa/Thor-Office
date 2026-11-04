import { Ctx, fetchAll } from "@/lib/thorData";
import { formatVND, hhmmToMin, monthRangeVN, nowMinutesVN, todayKey, vnDateKey } from "@/lib/vn";
import type { AgentId } from "@/lib/agentsMeta";

/**
 * Phần CHẠY THẬT của từng AI (chỉ server). Mỗi AI có:
 *  - system : lời nhắc riêng — giới hạn ĐÚNG MỘT nhánh việc
 *  - keywords: từ khoá để Chỉ huy (chế độ tự tính) biết giao việc cho ai
 *  - gather : lấy số liệu Thor (chỉ đọc) cho nhánh của mình
 *  - sim    : viết kết quả từ số liệu — dùng khi chưa nối AI thật (chế độ "tự tính")
 */
type Order = {
  id: string;
  customer_name: string;
  channel: string | null;
  order_date: string;
  reader_id: string | null;
  saler_id: string | null;
  total_price: number;
  created_at: string;
};
type Staff = { id: string; name: string; role: string };

const monthOrders = (ctx: Ctx) =>
  ctx.get("orders-month", () => {
    const { start, end } = monthRangeVN();
    return fetchAll<Order>(
      "orders",
      `select=id,customer_name,channel,order_date,reader_id,saler_id,total_price,created_at&order_date=gte.${start}&order_date=lt.${end}&order=id.asc`
    );
  });
const allStaff = (ctx: Ctx) =>
  ctx.get("staff", () => fetchAll<Staff>("staff", "select=id,name,role&order=id.asc"));

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const BASE_RULES =
  "Bạn là MỘT AI trong văn phòng AI của Thor và CHỈ phụ trách đúng một nhánh việc ghi bên dưới — không làm việc của AI khác. " +
  "Chỉ dựa vào DỮ LIỆU được cung cấp, không bịa số. Trả lời tiếng Việt, ngắn gọn, gạch đầu dòng, nêu số cụ thể. " +
  "Nếu dữ liệu không đủ để trả lời, nói rõ là thiếu gì.";

export type AgentLogic = {
  system: string;
  keywords: string[];
  gather?: (ctx: Ctx) => Promise<unknown>;
  sim?: (data: never, task: string) => string;
};

// ---------------------------------------------------------------- Đơn hàng
type OrdersData = {
  thang: string;
  tongDon: number;
  doanhThu: number;
  donTrungBinh: number;
  theoKenh: { kenh: string; don: number; doanhThu: number }[];
  homNay: { don: number; doanhThu: number };
  ngayGanNhat: { ngay: string; don: number; doanhThu: number }[];
};

async function gatherOrders(ctx: Ctx): Promise<OrdersData> {
  const rows = await monthOrders(ctx);
  const today = todayKey();
  const byChannel = new Map<string, { don: number; doanhThu: number }>();
  const byDay = new Map<string, { don: number; doanhThu: number }>();
  let revenue = 0;
  let todayCount = 0;
  let todayRev = 0;
  for (const o of rows) {
    revenue += o.total_price;
    const ch = o.channel ?? "(chưa rõ kênh)";
    const c = byChannel.get(ch) ?? { don: 0, doanhThu: 0 };
    c.don++;
    c.doanhThu += o.total_price;
    byChannel.set(ch, c);
    const d = byDay.get(o.order_date) ?? { don: 0, doanhThu: 0 };
    d.don++;
    d.doanhThu += o.total_price;
    byDay.set(o.order_date, d);
    if (vnDateKey(o.created_at) === today) {
      todayCount++;
      todayRev += o.total_price;
    }
  }
  return {
    thang: monthRangeVN().label,
    tongDon: rows.length,
    doanhThu: revenue,
    donTrungBinh: rows.length ? Math.round(revenue / rows.length) : 0,
    theoKenh: [...byChannel.entries()]
      .map(([kenh, v]) => ({ kenh, ...v }))
      .sort((a, b) => b.doanhThu - a.doanhThu),
    homNay: { don: todayCount, doanhThu: todayRev },
    ngayGanNhat: [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, 5)
      .map(([ngay, v]) => ({ ngay, ...v })),
  };
}

function simOrders(d: OrdersData): string {
  const lines = [
    `Tháng ${d.thang}: **${d.tongDon} đơn**, doanh thu **${formatVND(d.doanhThu)}** (trung bình ${formatVND(d.donTrungBinh)}/đơn).`,
    `Hôm nay (đơn nhập hôm nay): ${d.homNay.don} đơn, ${formatVND(d.homNay.doanhThu)}.`,
    "Theo kênh:",
    ...d.theoKenh.map((k) => `- ${k.kenh}: ${k.don} đơn · ${formatVND(k.doanhThu)}`),
    "5 ngày gần nhất có đơn:",
    ...d.ngayGanNhat.map((n) => `- ${n.ngay}: ${n.don} đơn · ${formatVND(n.doanhThu)}`),
  ];
  return lines.join("\n");
}

// ---------------------------------------------------------- Kiểm tra dữ liệu
type DataCheck = {
  tongDonKiemTra: number;
  chuaGanReader: { soLuong: number; mau: string[] };
  chuaCoSaler: { soLuong: number; mau: string[] };
  giaBangKhong: { soLuong: number; mau: string[] };
  nghiTrung: { soLuong: number; mau: string[] };
  lichHenQuaGio: { soLuong: number; mau: string[] };
};

async function gatherDataCheck(ctx: Ctx): Promise<DataCheck> {
  const rows = await monthOrders(ctx);
  const sample = (list: Order[], n = 6) =>
    list.slice(0, n).map((o) => `${o.customer_name} (${o.order_date}, ${o.channel ?? "?"})`);

  const noReader = rows.filter((o) => !o.reader_id);
  const noSaler = rows.filter((o) => !o.saler_id);
  const zero = rows.filter((o) => !(o.total_price > 0));

  const seen = new Map<string, Order[]>();
  for (const o of rows) {
    const k = `${norm(o.customer_name)}|${o.channel ?? ""}|${o.order_date}`;
    seen.set(k, [...(seen.get(k) ?? []), o]);
  }
  const dups = [...seen.values()].filter((g) => g.length > 1);

  // Lịch hẹn đang đợi mà đã quá giờ hẹn.
  const nowIso = new Date().toISOString();
  const overdue = await fetchAll<{ order_id: string; appointment_at: string }>(
    "order_appointments",
    `select=order_id,appointment_at&status=eq.waiting&appointment_at=lt.${encodeURIComponent(nowIso)}&order=id.asc`
  );
  let overdueNames: string[] = [];
  if (overdue.length) {
    const ids = overdue.slice(0, 20).map((a) => a.order_id).join(",");
    const ords = await fetchAll<{ id: string; customer_name: string }>(
      "orders",
      `select=id,customer_name&id=in.(${ids})&order=id.asc`
    );
    const nameOf = new Map(ords.map((o) => [o.id, o.customer_name]));
    overdueNames = overdue
      .slice(0, 6)
      .map((a) => `${nameOf.get(a.order_id) ?? "?"} (hẹn ${vnDateKey(a.appointment_at)})`);
  }

  return {
    tongDonKiemTra: rows.length,
    chuaGanReader: { soLuong: noReader.length, mau: sample(noReader) },
    chuaCoSaler: { soLuong: noSaler.length, mau: sample(noSaler) },
    giaBangKhong: { soLuong: zero.length, mau: sample(zero) },
    nghiTrung: {
      soLuong: dups.length,
      mau: dups.slice(0, 6).map((g) => `${g[0].customer_name} ×${g.length} (${g[0].order_date}, ${g[0].channel ?? "?"})`),
    },
    lichHenQuaGio: { soLuong: overdue.length, mau: overdueNames },
  };
}

function simDataCheck(d: DataCheck): string {
  const item = (label: string, x: { soLuong: number; mau: string[] }) =>
    x.soLuong === 0
      ? `- ✅ ${label}: không có`
      : `- ⚠️ ${label}: **${x.soLuong}**${x.mau.length ? ` — vd ${x.mau.join("; ")}` : ""}`;
  return [
    `Đã kiểm tra ${d.tongDonKiemTra} đơn tháng này:`,
    item("Đơn chưa gán Reader", d.chuaGanReader),
    item("Đơn chưa có Saler", d.chuaCoSaler),
    item("Đơn giá bằng 0", d.giaBangKhong),
    item("Nghi trùng (cùng khách + kênh + ngày)", d.nghiTrung),
    item("Lịch hẹn đang đợi mà đã quá giờ", d.lichHenQuaGio),
  ].join("\n");
}

// ------------------------------------------------------------------------ QC
type QcData = {
  thang: string;
  soPhieuCham: number;
  diemTrungBinh: number | null;
  theoReader: { reader: string; soPhieu: number; diemTb: number }[];
  donChuaCham: number;
};

async function gatherQc(ctx: Ctx): Promise<QcData> {
  const { start, end, label } = monthRangeVN();
  const [reviews, staff, orders] = await Promise.all([
    fetchAll<{ order_id: string; reader_id: string | null; total_score: number; max_total: number }>(
      "qc_reviews",
      `select=order_id,reader_id,total_score,max_total&review_date=gte.${start}&review_date=lt.${end}&order=id.asc`
    ),
    allStaff(ctx),
    monthOrders(ctx),
  ]);
  const nameOf = new Map(staff.map((s) => [s.id, s.name]));
  const per = new Map<string, { n: number; sum: number }>();
  let sum = 0;
  for (const r of reviews) {
    sum += r.total_score;
    const k = r.reader_id ?? "?";
    const p = per.get(k) ?? { n: 0, sum: 0 };
    p.n++;
    p.sum += r.total_score;
    per.set(k, p);
  }
  const reviewedIds = new Set(reviews.map((r) => r.order_id));
  return {
    thang: label,
    soPhieuCham: reviews.length,
    diemTrungBinh: reviews.length ? Math.round((sum / reviews.length) * 100) / 100 : null,
    theoReader: [...per.entries()]
      .map(([id, p]) => ({
        reader: nameOf.get(id) ?? "(không rõ)",
        soPhieu: p.n,
        diemTb: Math.round((p.sum / p.n) * 100) / 100,
      }))
      .sort((a, b) => b.diemTb - a.diemTb),
    donChuaCham: orders.filter((o) => !reviewedIds.has(o.id)).length,
  };
}

function simQc(d: QcData): string {
  if (d.soPhieuCham === 0) return `Tháng ${d.thang} chưa có phiếu QC nào được chấm. Còn ${d.donChuaCham} đơn chưa chấm.`;
  return [
    `Tháng ${d.thang}: **${d.soPhieuCham} phiếu** đã chấm, điểm trung bình **${d.diemTrungBinh}**. Còn ${d.donChuaCham} đơn chưa chấm.`,
    "Điểm trung bình theo Reader (cao → thấp):",
    ...d.theoReader.slice(0, 8).map((r) => `- ${r.reader}: ${r.diemTb} (${r.soPhieu} phiếu)`),
  ].join("\n");
}

// ------------------------------------------------------------------ Khiếu nại
type ComplaintData = {
  dangMo: number;
  daXuLy30Ngay: number;
  lauNhat: { khach: string; soNgay: number }[];
};

async function gatherComplaints(): Promise<ComplaintData> {
  const open = await fetchAll<{ order_id: string; created_at: string }>(
    "qc_complaints",
    "select=order_id,created_at&status=eq.open&order=id.asc"
  );
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const resolved = await fetchAll<{ id: string }>(
    "qc_complaints",
    `select=id&status=eq.resolved&resolved_at=gte.${encodeURIComponent(since)}&order=id.asc`
  );
  let oldest: ComplaintData["lauNhat"] = [];
  if (open.length) {
    const sorted = [...open].sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(0, 5);
    const ords = await fetchAll<{ id: string; customer_name: string }>(
      "orders",
      `select=id,customer_name&id=in.(${sorted.map((o) => o.order_id).join(",")})&order=id.asc`
    );
    const nameOf = new Map(ords.map((o) => [o.id, o.customer_name]));
    oldest = sorted.map((c) => ({
      khach: nameOf.get(c.order_id) ?? "?",
      soNgay: Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000),
    }));
  }
  return { dangMo: open.length, daXuLy30Ngay: resolved.length, lauNhat: oldest };
}

function simComplaints(d: ComplaintData): string {
  if (d.dangMo === 0) return `Không có khiếu nại nào đang mở. (30 ngày qua đã xử lý ${d.daXuLy30Ngay}.)`;
  return [
    `Đang mở: **${d.dangMo} khiếu nại** (30 ngày qua đã xử lý ${d.daXuLy30Ngay}).`,
    "Lâu nhất chưa xử lý:",
    ...d.lauNhat.map((c) => `- ${c.khach}: ${c.soNgay} ngày`),
  ].join("\n");
}

// -------------------------------------------------------------------- Giờ trực
type DutyData = {
  homNay: string;
  dangTruc: string[];
  sapTruc: string[];
  hetCa: string[];
  nghiCaNgay: string[];
  chuaDangKy: number;
};

type Slot = { kind: "work" | "off"; allDay?: boolean; start?: string | null; end?: string | null };

async function gatherDuty(ctx: Ctx): Promise<DutyData> {
  const today = todayKey();
  const [hours, staff] = await Promise.all([
    fetchAll<{ reader_id: string; start_time: string | null; end_time: string | null; slots: Slot[] | null }>(
      "reader_hours",
      `select=reader_id,start_time,end_time,slots&work_date=eq.${today}&order=id.asc`
    ),
    allStaff(ctx),
  ]);
  const readers = staff.filter((s) => s.role === "reader");
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
    const offs = (h.slots ?? []).filter((x) => x.kind === "off" && !x.allDay);
    const inOff = offs.some((x) => {
      const a = hhmmToMin(x.start ?? null);
      const b = hhmmToMin(x.end ?? null);
      return a !== null && b !== null && now >= a && now < b;
    });
    if (now < s) soon.push(`${name} (${h.start_time?.slice(0, 5)})`);
    else if (now >= e) done.push(name);
    else on.push(inOff ? `${name} (đang nghỉ giữa ca)` : name);
  }
  return {
    homNay: today,
    dangTruc: on,
    sapTruc: soon,
    hetCa: done,
    nghiCaNgay: offAll,
    chuaDangKy: readers.filter((r) => !registered.has(r.id)).length,
  };
}

function simDuty(d: DutyData): string {
  const list = (a: string[]) => (a.length ? a.join(", ") : "không ai");
  return [
    `Hôm nay ${d.homNay}:`,
    `- 🟢 Đang trực (${d.dangTruc.length}): ${list(d.dangTruc)}`,
    `- 🟡 Sắp trực (${d.sapTruc.length}): ${list(d.sapTruc)}`,
    `- ⚪ Hết ca (${d.hetCa.length}): ${list(d.hetCa)}`,
    `- 🟠 Nghỉ cả ngày (${d.nghiCaNgay.length}): ${list(d.nghiCaNgay)}`,
    `- Reader chưa đăng ký giờ hôm nay: ${d.chuaDangKy}`,
  ].join("\n");
}

// ------------------------------------------------------------------ Bảng AI
export const LOGIC: Record<AgentId, AgentLogic> = {
  commander: {
    system:
      BASE_RULES +
      " NHÁNH CỦA BẠN: phân việc. Bạn nhận yêu cầu của anh Thỏ và chia cho đúng AI chuyên môn, mỗi AI một việc riêng, không dồn nhiều việc cho một AI.",
    keywords: [],
  },
  orders: {
    system: BASE_RULES + " NHÁNH CỦA BẠN: đơn hàng và doanh thu (số đơn, doanh thu theo kênh/ngày).",
    keywords: ["don", "doanh thu", "ban duoc", "kenh", "tien", "thang", "hom nay", "tong quan", "tinh hinh"],
    gather: gatherOrders,
    sim: simOrders as AgentLogic["sim"],
  },
  data: {
    system:
      BASE_RULES +
      " NHÁNH CỦA BẠN: kiểm tra chất lượng dữ liệu đơn (thiếu Reader/Saler, giá 0, nghi trùng, lịch hẹn quá giờ).",
    keywords: ["thieu", "trung", "loi", "kiem tra", "sai", "chua gan", "hen", "ra loi", "du lieu"],
    gather: gatherDataCheck,
    sim: simDataCheck as AgentLogic["sim"],
  },
  qc: {
    system: BASE_RULES + " NHÁNH CỦA BẠN: điểm chấm chất lượng (QC) của các Reader.",
    keywords: ["qc", "diem", "cham", "chat luong", "reader tot", "xep hang"],
    gather: gatherQc,
    sim: simQc as AgentLogic["sim"],
  },
  complaints: {
    system: BASE_RULES + " NHÁNH CỦA BẠN: khiếu nại của Reader về điểm QC.",
    keywords: ["khieu nai", "phan nan", "than phien"],
    gather: gatherComplaints,
    sim: simComplaints as AgentLogic["sim"],
  },
  duty: {
    system: BASE_RULES + " NHÁNH CỦA BẠN: giờ trực — ai đang trực, sắp trực, hết ca, nghỉ hôm nay.",
    keywords: ["truc", "gio truc", "ai dang", "ca lam", "nghi", "offline"],
    gather: gatherDuty,
    sim: simDuty as AgentLogic["sim"],
  },
  reporter: {
    system:
      BASE_RULES +
      " NHÁNH CỦA BẠN: gộp kết quả của các AI khác thành MỘT báo cáo ngắn gọn cho anh Thỏ: mở đầu bằng 2–3 ý quan trọng nhất, rồi liệt kê việc cần xử lý. Không tự thêm số liệu mới.",
    keywords: [],
  },
};

/** Chỉ huy (chế độ tự tính): chọn AI theo từ khoá trong yêu cầu; không khớp gì → giao tất cả. */
export function planByKeywords(request: string): AgentId[] {
  const q = norm(request);
  const pick = (Object.keys(LOGIC) as AgentId[]).filter(
    (id) => LOGIC[id].gather && LOGIC[id].keywords.some((k) => q.includes(k))
  );
  const wantsAll = /tong quan|bao cao|tat ca|toan bo|tinh hinh/.test(q);
  if (wantsAll || pick.length === 0) {
    return (Object.keys(LOGIC) as AgentId[]).filter((id) => LOGIC[id].gather);
  }
  return pick;
}
