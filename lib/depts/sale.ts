import type { Ctx } from "@/lib/thorData";
import { allStaff, monthOrders, waitingAppts } from "@/lib/queries";
import { BASE_RULES, norm, type AgentLogic } from "@/lib/logicTypes";
import { formatVND, monthRangeVN, todayKey, vnDateKey } from "@/lib/vn";

/** PHÒNG SALE — Quản lý khách đã nhập đơn · Vận hành Sale. */

// ------------------------------------------------------------ Sale · Quản lý
type SaleManage = {
  thang: string;
  tongDon: number;
  khachRieng: number;
  khachQuayLai: { khach: string; soDon: number }[];
  theoSaler: { saler: string; don: number; doanhThu: number; homNay: number }[];
  theoKenh: { kenh: string; don: number }[];
};

async function gatherSaleManage(ctx: Ctx): Promise<SaleManage> {
  const [orders, staff] = await Promise.all([monthOrders(ctx), allStaff(ctx)]);
  const name = new Map(staff.map((s) => [s.id, s.name]));
  const today = todayKey();

  const by = new Map<string, { don: number; doanhThu: number; homNay: number }>();
  for (const o of orders) {
    const k = o.saler_id ? (name.get(o.saler_id) ?? "?") : "(chưa có Saler)";
    const v = by.get(k) ?? { don: 0, doanhThu: 0, homNay: 0 };
    v.don++;
    v.doanhThu += o.total_price;
    if (vnDateKey(o.created_at) === today) v.homNay++;
    by.set(k, v);
  }
  const cust = new Map<string, { ten: string; n: number }>();
  for (const o of orders) {
    const k = norm(o.customer_name);
    const c = cust.get(k) ?? { ten: o.customer_name, n: 0 };
    c.n++;
    cust.set(k, c);
  }
  const ch = new Map<string, number>();
  for (const o of orders) ch.set(o.channel ?? "?", (ch.get(o.channel ?? "?") ?? 0) + 1);

  return {
    thang: monthRangeVN().label,
    tongDon: orders.length,
    khachRieng: cust.size,
    khachQuayLai: [...cust.values()].filter((c) => c.n > 1).sort((a, b) => b.n - a.n).slice(0, 6).map((c) => ({ khach: c.ten, soDon: c.n })),
    theoSaler: [...by.entries()].map(([saler, v]) => ({ saler, ...v })).sort((a, b) => b.doanhThu - a.doanhThu),
    theoKenh: [...ch.entries()].map(([kenh, don]) => ({ kenh, don })).sort((a, b) => b.don - a.don),
  };
}

function simSaleManage(d: SaleManage): string {
  return [
    `Tháng ${d.thang}: **${d.tongDon} đơn** của **${d.khachRieng} khách** (khách quay lại: ${d.khachQuayLai.length}).`,
    "Theo Saler (doanh thu cao → thấp):",
    ...d.theoSaler.map((s) => `- ${s.saler}: ${s.don} đơn · ${formatVND(s.doanhThu)} (hôm nay nhập ${s.homNay})`),
    "Theo kênh: " + d.theoKenh.map((k) => `${k.kenh} ${k.don}`).join(" · "),
    d.khachQuayLai.length ? "Khách mua nhiều lần trong tháng: " + d.khachQuayLai.map((k) => `${k.khach} ×${k.soDon}`).join("; ") : "Chưa có khách mua lại trong tháng.",
  ].join("\n");
}

// ----------------------------------------------------------- Sale · Vận hành
type SaleOps = {
  chuaGanReader: { soLuong: number; mau: string[] };
  giaBangKhong: { soLuong: number; mau: string[] };
  nghiTrung: { soLuong: number; mau: string[] };
  lichHenQuaGio: { soLuong: number; mau: string[] };
  homNay: number;
  homQua: number;
};

async function gatherSaleOps(ctx: Ctx): Promise<SaleOps> {
  const [orders, staff, waiting] = await Promise.all([monthOrders(ctx), allStaff(ctx), waitingAppts(ctx)]);
  const name = new Map(staff.map((s) => [s.id, s.name]));
  const orderById = new Map(orders.map((o) => [o.id, o]));
  const today = todayKey();
  const yesterday = vnDateKey(Date.now() - 86400000);
  const lab = (o: (typeof orders)[number]) => `${o.customer_name} (Saler ${o.saler_id ? (name.get(o.saler_id) ?? "?") : "—"}, ${o.order_date})`;

  const noReader = orders.filter((o) => !o.reader_id).sort((a, b) => a.order_date.localeCompare(b.order_date));
  const zero = orders.filter((o) => !(o.total_price > 0));
  const seen = new Map<string, typeof orders>();
  for (const o of orders) {
    const k = `${norm(o.customer_name)}|${o.channel ?? ""}|${o.order_date}`;
    seen.set(k, [...(seen.get(k) ?? []), o]);
  }
  const dups = [...seen.values()].filter((g) => g.length > 1);
  const overdue = waiting.filter((w) => new Date(w.appointment_at).getTime() < Date.now());

  return {
    chuaGanReader: { soLuong: noReader.length, mau: noReader.slice(0, 6).map(lab) },
    giaBangKhong: { soLuong: zero.length, mau: zero.slice(0, 5).map(lab) },
    nghiTrung: { soLuong: dups.length, mau: dups.slice(0, 5).map((g) => `${g[0].customer_name} ×${g.length} (${g[0].order_date})`) },
    lichHenQuaGio: {
      soLuong: overdue.length,
      mau: overdue.slice(0, 5).map((w) => {
        const o = orderById.get(w.order_id);
        return `${o?.customer_name ?? "đơn tháng khác"} (hẹn ${vnDateKey(w.appointment_at)})`;
      }),
    },
    homNay: orders.filter((o) => vnDateKey(o.created_at) === today).length,
    homQua: orders.filter((o) => vnDateKey(o.created_at) === yesterday).length,
  };
}

function simSaleOps(d: SaleOps): string {
  const item = (label: string, x: { soLuong: number; mau: string[] }) =>
    x.soLuong === 0 ? `- ✅ ${label}: không có` : `- ⚠️ ${label}: **${x.soLuong}** — vd ${x.mau.join("; ")}`;
  return [
    `Việc tồn của Sale — nhập hôm nay ${d.homNay} đơn (hôm qua ${d.homQua}).`,
    item("Đơn chưa gán Reader (Saler cần vào Cập nhật thông tin)", d.chuaGanReader),
    item("Lịch hẹn đã quá giờ chưa xong", d.lichHenQuaGio),
    item("Đơn giá bằng 0", d.giaBangKhong),
    item("Nghi trùng (cùng khách + kênh + ngày)", d.nghiTrung),
  ].join("\n");
}

export const SALE_LOGIC: Record<"sale_manage" | "sale_ops", AgentLogic> = {
  sale_manage: {
    system:
      BASE_RULES +
      " NHÁNH CỦA BẠN (Phòng Sale · Quản lý): quản lý khách đã nhập đơn — số đơn, doanh thu theo Saler/kênh, khách quay lại.",
    keywords: ["sale", "saler", "khach", "don hang", "doanh thu", "ban hang", "chot", "kenh", "tong quan"],
    gather: gatherSaleManage,
    sim: simSaleManage as AgentLogic["sim"],
  },
  sale_ops: {
    system:
      BASE_RULES +
      " NHÁNH CỦA BẠN (Phòng Sale · Vận hành): các việc tồn của Sale — đơn chưa gán Reader, lịch hẹn quá giờ, đơn lỗi giá/trùng.",
    keywords: ["sale", "chua gan", "thieu", "trung", "loi don", "lich hen", "hen gio", "ton"],
    gather: gatherSaleOps,
    sim: simSaleOps as AgentLogic["sim"],
  },
};
