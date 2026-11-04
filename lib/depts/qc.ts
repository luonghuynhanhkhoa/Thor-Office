import { fetchAll, type Ctx } from "@/lib/thorData";
import { allStaff, monthOrders, monthReviews } from "@/lib/queries";
import { BASE_RULES, type AgentLogic } from "@/lib/logicTypes";
import { monthRangeVN, vnDateKey } from "@/lib/vn";

/** PHÒNG QC — Quản lý đơn QC & điểm chấm · Vận hành QC (khối lượng chấm, khiếu nại). */

// ---------------------------------------------------------------- QC · Quản lý
type QcManage = {
  thang: string;
  soPhieu: number;
  diemTb: number | null;
  phanLoai: Record<string, number>;
  donChuaCham: number;
  donChuaCham2Ngay: number;
  theoReader: { reader: string; soPhieu: number; diemTb: number }[];
};

async function gatherQcManage(ctx: Ctx): Promise<QcManage> {
  const [reviews, orders, staff] = await Promise.all([monthReviews(ctx), monthOrders(ctx), allStaff(ctx)]);
  const nameOf = new Map(staff.map((s) => [s.id, s.name]));
  const per = new Map<string, { n: number; sum: number }>();
  const dist: Record<string, number> = {};
  let sum = 0;
  for (const r of reviews) {
    sum += r.total_score;
    dist[r.rating] = (dist[r.rating] ?? 0) + 1;
    const k = r.reader_id ?? "?";
    const p = per.get(k) ?? { n: 0, sum: 0 };
    p.n++;
    p.sum += r.total_score;
    per.set(k, p);
  }
  const reviewed = new Set(reviews.map((r) => r.order_id));
  const twoDaysAgo = vnDateKey(Date.now() - 2 * 86400000);
  const pending = orders.filter((o) => !reviewed.has(o.id));
  return {
    thang: monthRangeVN().label,
    soPhieu: reviews.length,
    diemTb: reviews.length ? Math.round((sum / reviews.length) * 100) / 100 : null,
    phanLoai: dist,
    donChuaCham: pending.length,
    donChuaCham2Ngay: pending.filter((o) => o.order_date <= twoDaysAgo).length,
    theoReader: [...per.entries()]
      .map(([id, p]) => ({ reader: nameOf.get(id) ?? "(không rõ)", soPhieu: p.n, diemTb: Math.round((p.sum / p.n) * 100) / 100 }))
      .sort((a, b) => b.diemTb - a.diemTb),
  };
}

function simQcManage(d: QcManage): string {
  const dist = Object.entries(d.phanLoai).map(([k, v]) => `${k} ${v}`).join(" · ") || "chưa có";
  return [
    `Tháng ${d.thang}: **${d.soPhieu} phiếu** đã chấm${d.diemTb !== null ? `, điểm trung bình **${d.diemTb}**` : ""} (xếp loại: ${dist}).`,
    d.donChuaCham2Ngay
      ? `- ⚠️ Đơn chưa chấm: **${d.donChuaCham}** (trong đó ${d.donChuaCham2Ngay} đơn đã quá 2 ngày chưa chấm)`
      : `- Đơn chưa chấm: ${d.donChuaCham} (không đơn nào quá 2 ngày)`,
    "Điểm trung bình theo Reader (cao → thấp):",
    ...d.theoReader.slice(0, 8).map((r) => `- ${r.reader}: ${r.diemTb} (${r.soPhieu} phiếu)`),
  ].join("\n");
}

// ---------------------------------------------------------------- QC · Vận hành
type QcOps = {
  theoQc: { qc: string; soPhieu: number; soNgayCham: number }[];
  khongChamThangNay: string[];
  khieuNaiDangMo: number;
  khieuNaiDaXuLy30Ngay: number;
  lauNhat: { khach: string; soNgay: number }[];
  nhanXetThang: { daCo: number; soReader: number };
};

async function gatherQcOps(ctx: Ctx): Promise<QcOps> {
  const [reviews, staff] = await Promise.all([monthReviews(ctx), allStaff(ctx)]);
  const days = new Map<string, Set<string>>();
  const count = new Map<string, number>();
  for (const r of reviews) {
    const k = r.qc_id ?? "?";
    count.set(k, (count.get(k) ?? 0) + 1);
    days.set(k, (days.get(k) ?? new Set()).add(r.review_date));
  }
  const qcs = staff.filter((s) => s.role === "qc" && !s.archived);

  const open = await fetchAll<{ order_id: string; created_at: string }>("qc_complaints", "select=order_id,created_at&status=eq.open&order=id.asc");
  const since = encodeURIComponent(new Date(Date.now() - 30 * 86400000).toISOString());
  const resolved = await fetchAll<{ id: string }>("qc_complaints", `select=id&status=eq.resolved&resolved_at=gte.${since}&order=id.asc`);
  let oldest: QcOps["lauNhat"] = [];
  if (open.length) {
    const top = [...open].sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(0, 4);
    const ords = await fetchAll<{ id: string; customer_name: string }>("orders", `select=id,customer_name&id=in.(${top.map((t) => t.order_id).join(",")})&order=id.asc`);
    const nm = new Map(ords.map((o) => [o.id, o.customer_name]));
    oldest = top.map((c) => ({ khach: nm.get(c.order_id) ?? "?", soNgay: Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000) }));
  }

  const monthKey = monthRangeVN().start.slice(0, 7);
  let comments = 0;
  try {
    comments = (await fetchAll<{ id: string }>("qc_monthly_reviews", `select=id&month=eq.${monthKey}&order=id.asc`)).length;
  } catch {
    comments = 0;
  }
  return {
    theoQc: qcs
      .map((q) => ({ qc: q.name, soPhieu: count.get(q.id) ?? 0, soNgayCham: days.get(q.id)?.size ?? 0 }))
      .sort((a, b) => b.soPhieu - a.soPhieu),
    khongChamThangNay: qcs.filter((q) => !count.get(q.id)).map((q) => q.name),
    khieuNaiDangMo: open.length,
    khieuNaiDaXuLy30Ngay: resolved.length,
    lauNhat: oldest,
    nhanXetThang: { daCo: comments, soReader: staff.filter((s) => s.role === "reader" && !s.archived).length },
  };
}

function simQcOps(d: QcOps): string {
  return [
    "Khối lượng chấm tháng này:",
    ...d.theoQc.map((q) => `- ${q.qc}: ${q.soPhieu} phiếu trong ${q.soNgayCham} ngày`),
    d.khongChamThangNay.length ? `- ⚠️ QC chưa chấm phiếu nào tháng này: ${d.khongChamThangNay.join(", ")}` : "- ✅ Mọi QC đều có chấm trong tháng",
    d.khieuNaiDangMo
      ? `- ⚠️ Khiếu nại đang mở: **${d.khieuNaiDangMo}** (30 ngày qua đã xử lý ${d.khieuNaiDaXuLy30Ngay}); lâu nhất: ${d.lauNhat.map((c) => `${c.khach} ${c.soNgay} ngày`).join("; ")}`
      : `- ✅ Không có khiếu nại đang mở (30 ngày qua đã xử lý ${d.khieuNaiDaXuLy30Ngay})`,
    `- Nhận xét tháng của QC: ${d.nhanXetThang.daCo} nhận xét / ${d.nhanXetThang.soReader} Reader`,
  ].join("\n");
}

export const QC_LOGIC: Record<"qc_manage" | "qc_ops", AgentLogic> = {
  qc_manage: {
    system:
      BASE_RULES +
      " NHÁNH CỦA BẠN (Phòng QC · Quản lý): quản lý đơn QC — số phiếu đã chấm, điểm trung bình, xếp loại, đơn chưa chấm, điểm theo Reader.",
    keywords: ["qc", "diem", "cham", "chat luong", "xep hang", "reader tot", "chua cham"],
    gather: gatherQcManage,
    sim: simQcManage as AgentLogic["sim"],
  },
  qc_ops: {
    system:
      BASE_RULES +
      " NHÁNH CỦA BẠN (Phòng QC · Vận hành): vận hành của QC — khối lượng chấm từng QC, khiếu nại của Reader, nhận xét tháng.",
    keywords: ["qc", "khieu nai", "phan nan", "khoi luong", "nhan xet"],
    gather: gatherQcOps,
    sim: simQcOps as AgentLogic["sim"],
  },
};
