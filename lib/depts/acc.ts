import { fetchAll, type Ctx } from "@/lib/thorData";
import { MIRROR, allStaff, computePayroll, monthOrders } from "@/lib/queries";
import { readThorFile } from "@/lib/thorFiles";
import { BASE_RULES, type AgentLogic } from "@/lib/logicTypes";
import { formatVND, monthRangeVN } from "@/lib/vn";

/** PHÒNG KẾ TOÁN — Quản lý lương · Vận hành kiểm tra công thức lương & chi tiêu. */

type Money = { staff_id?: string; amount: number };

const advances = (ctx: Ctx) =>
  ctx.get("advances", () => {
    const { start, end } = monthRangeVN();
    return fetchAll<Money>("salary_advances", `select=staff_id,amount&advance_date=gte.${start}&advance_date=lt.${end}&order=id.asc`);
  });
const bonuses = (ctx: Ctx) =>
  ctx.get("bonuses", () => {
    const { start, end } = monthRangeVN();
    return fetchAll<Money>("salary_bonuses", `select=staff_id,amount&bonus_date=gte.${start}&bonus_date=lt.${end}&order=id.asc`);
  });
const costs = (ctx: Ctx) =>
  ctx.get("costs", () => {
    const { start, end } = monthRangeVN();
    return fetchAll<Money>("operating_costs", `select=amount&cost_date=gte.${start}&cost_date=lt.${end}&order=id.asc`);
  });
const sum = (a: Money[]) => a.reduce((s, x) => s + (x.amount || 0), 0);

// -------------------------------------------------------------- KT · Quản lý
type AccManage = {
  thang: string;
  doanhThu: number;
  luong: { reader: number; saler: number; qc: number; tong: number };
  thuong: number;
  ung: number;
  chiPhiVanHanh: number;
  loiNhuanUocTinh: number;
  bienLoiNhuanPct: number | null;
  top5: { ten: string; vaiTro: string; luong: number }[];
  donTreoKhongTinhLuong: number;
};

async function gatherAccManage(ctx: Ctx): Promise<AccManage> {
  const [orders, pay, adv, bon, cost] = await Promise.all([monthOrders(ctx), computePayroll(ctx), advances(ctx), bonuses(ctx), costs(ctx)]);
  const revenue = orders.reduce((s, o) => s + o.total_price, 0);
  // Cùng công thức ô Lợi nhuận của Thor: Doanh thu − lương 3 vai − chi phí vận hành − thưởng − lương ứng.
  const profit = revenue - pay.totals.all - sum(cost) - sum(bon) - sum(adv);
  return {
    thang: monthRangeVN().label,
    doanhThu: revenue,
    luong: { reader: pay.totals.reader, saler: pay.totals.saler, qc: pay.totals.qc, tong: pay.totals.all },
    thuong: sum(bon),
    ung: sum(adv),
    chiPhiVanHanh: sum(cost),
    loiNhuanUocTinh: profit,
    bienLoiNhuanPct: revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : null,
    top5: [...pay.rows].sort((a, b) => b.salary - a.salary).slice(0, 5).map((r) => ({ ten: r.name, vaiTro: r.role, luong: Math.round(r.salary) })),
    donTreoKhongTinhLuong: pay.held,
  };
}

function simAccManage(d: AccManage): string {
  return [
    `Tháng ${d.thang} — doanh thu **${formatVND(d.doanhThu)}**.`,
    `Lương: Reader ${formatVND(d.luong.reader)} · Saler ${formatVND(d.luong.saler)} · QC ${formatVND(d.luong.qc)} → **tổng ${formatVND(d.luong.tong)}**.`,
    `Thưởng ${formatVND(d.thuong)} · Ứng ${formatVND(d.ung)} · Chi phí vận hành ${formatVND(d.chiPhiVanHanh)}.`,
    `Lợi nhuận ước tính: **${formatVND(d.loiNhuanUocTinh)}**${d.bienLoiNhuanPct !== null ? ` (biên ${d.bienLoiNhuanPct}%)` : ""}.`,
    `- Đơn đang "treo" (hẹn giờ chưa xong) chưa tính lương Reader: ${d.donTreoKhongTinhLuong}`,
    "Top lương cao nhất:",
    ...d.top5.map((t) => `- ${t.ten} (${t.vaiTro}): ${formatVND(t.luong)}`),
    "_(Số tính lại độc lập bằng bản chép công thức của Thor — dùng để đối chiếu, không phải sổ chính.)_",
  ].join("\n");
}

// -------------------------------------------------------------- KT · Vận hành
type Const = { ten: string; mirror: number; thor: number | null; khop: boolean | null };
type AccOps = {
  hangSo: Const[];
  sqlMirror: { co: boolean; thieu: string[] } | null;
  tyTrong: { readerPctDoanhThu: number | null; tongLuongPctDoanhThu: number | null };
  mucRiengLe: string[];
  ungVuotLuong: string[];
  donThieuReader: number;
};

function readConst(src: string | null, name: string): number | null {
  if (!src) return null;
  const m = src.match(new RegExp(`const\\s+${name}\\s*=\\s*([0-9.]+)`));
  return m ? Number(m[1]) : null;
}

async function gatherAccOps(ctx: Ctx): Promise<AccOps> {
  const [orders, pay, adv, bon, staff] = await Promise.all([monthOrders(ctx), computePayroll(ctx), advances(ctx), bonuses(ctx), allStaff(ctx)]);
  const src = readThorFile("lib/salary.ts");
  const hangSo: Const[] = (Object.keys(MIRROR) as (keyof typeof MIRROR)[]).map((k) => {
    const thor = readConst(src, k);
    return { ten: k, mirror: MIRROR[k], thor, khop: thor === null ? null : Math.abs(thor - MIRROR[k]) < 1e-9 };
  });

  // Khung SQL tổng hợp lương (0044) — kiểm thô: có chứa các hằng mặc định không.
  const sql = readThorFile("supabase/migrations/0044_salary_aggregation.sql");
  const sqlMirror = sql
    ? (() => {
        const want = ["0.35", "0.05", "0.03", "0.15", "0.035"];
        const thieu = want.filter((w) => !sql.includes(w));
        return { co: thieu.length === 0, thieu };
      })()
    : null;

  const revenue = orders.reduce((s, o) => s + o.total_price, 0);
  const nameOf = new Map(staff.map((s) => [s.id, s.name]));
  const salaryOf = new Map(pay.rows.map((r) => [r.id, r.salary]));
  const advBy = new Map<string, number>();
  for (const a of adv) if (a.staff_id) advBy.set(a.staff_id, (advBy.get(a.staff_id) ?? 0) + a.amount);
  const bonBy = new Map<string, number>();
  for (const b of bon) if (b.staff_id) bonBy.set(b.staff_id, (bonBy.get(b.staff_id) ?? 0) + b.amount);

  return {
    hangSo,
    sqlMirror,
    tyTrong: {
      readerPctDoanhThu: revenue > 0 ? Math.round((pay.totals.reader / revenue) * 1000) / 10 : null,
      tongLuongPctDoanhThu: revenue > 0 ? Math.round((pay.totals.all / revenue) * 1000) / 10 : null,
    },
    mucRiengLe: pay.customRates,
    ungVuotLuong: [...advBy.entries()]
      .filter(([id, a]) => a > (salaryOf.get(id) ?? 0) + (bonBy.get(id) ?? 0))
      .map(([id, a]) => `${nameOf.get(id) ?? "?"}: ứng ${formatVND(a)} > lương+thưởng ${formatVND((salaryOf.get(id) ?? 0) + (bonBy.get(id) ?? 0))}`),
    donThieuReader: orders.filter((o) => !o.reader_id).length,
  };
}

function simAccOps(d: AccOps): string {
  const bad = d.hangSo.filter((h) => h.khop === false);
  const unknown = d.hangSo.filter((h) => h.khop === null);
  const lines = [
    bad.length
      ? `- 🚨 **Công thức LỆCH so với Thor** (${bad.length}): ${bad.map((h) => `${h.ten} bản chép=${h.mirror} / Thor=${h.thor}`).join("; ")} → số của Kế Toán có thể sai, cần đồng bộ.`
      : `- ✅ Công thức lương: ${d.hangSo.length - unknown.length}/${d.hangSo.length} hằng số khớp file Thor (lib/salary.ts)${unknown.length ? `; không đọc được: ${unknown.map((h) => h.ten).join(", ")}` : ""}`,
    d.sqlMirror === null
      ? "- ℹ️ Chưa thấy file khung SQL tổng hợp lương (0044)."
      : d.sqlMirror.co
        ? "- ✅ Khung SQL 0044 có đủ các hằng mặc định (kiểm thô)"
        : `- ⚠️ Khung SQL 0044 thiếu hằng: ${d.sqlMirror.thieu.join(", ")} (nên đối chiếu lại nếu sắp kích hoạt)`,
    `- Tỷ trọng: lương Reader = ${d.tyTrong.readerPctDoanhThu ?? "?"}% doanh thu · tổng lương 3 vai = ${d.tyTrong.tongLuongPctDoanhThu ?? "?"}% doanh thu`,
  ];
  if ((d.tyTrong.tongLuongPctDoanhThu ?? 0) > 60) lines.push("- ⚠️ Tổng lương vượt 60% doanh thu — cần soát kỹ.");
  lines.push(
    d.mucRiengLe.length ? `- Mức lương riêng lẻ (khác mặc định): ${d.mucRiengLe.join("; ")}` : "- Không ai có mức lương riêng (đều dùng mặc định)",
    d.ungVuotLuong.length ? `- ⚠️ Ứng vượt lương+thưởng: ${d.ungVuotLuong.join("; ")}` : "- ✅ Không ai ứng vượt lương+thưởng",
    d.donThieuReader ? `- ⚠️ ${d.donThieuReader} đơn chưa gán Reader → chưa tính lương Saler/Reader cho các đơn này.` : "- ✅ Mọi đơn tháng này đã gán Reader"
  );
  return lines.join("\n");
}

export const ACC_LOGIC: Record<"acc_manage" | "acc_ops", AgentLogic> = {
  acc_manage: {
    system:
      BASE_RULES +
      " NHÁNH CỦA BẠN (Phòng Kế Toán · Quản lý): quản lý lương — tổng lương từng vai, thưởng, ứng, chi phí vận hành, lợi nhuận ước tính.",
    keywords: ["ke toan", "luong", "thuong", "ung", "chi phi", "loi nhuan", "thu nhap", "tra luong"],
    gather: gatherAccManage,
    sim: simAccManage as AgentLogic["sim"],
  },
  acc_ops: {
    system:
      BASE_RULES +
      " NHÁNH CỦA BẠN (Phòng Kế Toán · Vận hành): kiểm tra công thức tính lương và các khoản chi tiêu trong App — công thức có lệch không, tỷ trọng có bất thường không.",
    keywords: ["ke toan", "cong thuc", "kiem tra luong", "sai luong", "luong sai", "chi tieu", "doi chieu"],
    gather: gatherAccOps,
    sim: simAccOps as AgentLogic["sim"],
  },
};
