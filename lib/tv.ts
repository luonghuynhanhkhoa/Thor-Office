import { Ctx, countRows, fetchAll, fetchAuthUsers } from "@/lib/thorData";
import { allStaff, computePayroll, monthOrders, monthReviews, waitingAppts } from "@/lib/queries";
import { gitStatus, listThorDir, repos } from "@/lib/thorFiles";
import { formatVND, todayKey, vnDateKey } from "@/lib/vn";
import type { DeptId } from "@/lib/agentsMeta";

/** Số liệu NHANH (không chạy tsc/eslint) cho Tivi từng phòng. Nhớ 60 giây để không dồn tải lên Thor. */
export type TvLine = { k: string; v: string; warn?: boolean };
export type TvData = Record<DeptId, TvLine[]> & { updatedAt: number };

const g = globalThis as unknown as { __aiOfficeTv?: { at: number; data: TvData } };

async function safe(load: () => Promise<TvLine[]>): Promise<TvLine[]> {
  try {
    return await load();
  } catch {
    return [{ k: "Chưa đọc được dữ liệu", v: "—", warn: true }];
  }
}

export async function getTvData(): Promise<TvData> {
  const hit = g.__aiOfficeTv;
  if (hit && Date.now() - hit.at < 60_000) return hit.data;

  const ctx = new Ctx();
  const today = todayKey();
  const now = Date.now();

  const [hr, acc, sale, reader, qc, ctrl, exec, hq] = await Promise.all([
    safe(async () => {
      const users = await fetchAuthUsers();
      const active = users.filter((u) => !u.banned_until || new Date(u.banned_until).getTime() < now);
      return [
        { k: "Tài khoản đang dùng", v: String(active.length) },
        { k: "Đăng nhập hôm nay", v: String(active.filter((u) => u.last_sign_in_at && vnDateKey(u.last_sign_in_at) === today).length) },
        { k: "Đăng nhập 7 ngày qua", v: String(active.filter((u) => u.last_sign_in_at && now - new Date(u.last_sign_in_at).getTime() <= 7 * 86400000).length) },
        { k: "Chưa từng đăng nhập", v: String(active.filter((u) => !u.last_sign_in_at).length) },
      ];
    }),
    safe(async () => {
      const pay = await computePayroll(ctx);
      return [
        { k: "Lương tạm tính tháng", v: formatVND(pay.totals.all) },
        { k: "Reader", v: formatVND(pay.totals.reader) },
        { k: "Saler", v: formatVND(pay.totals.saler) },
        { k: "QC", v: formatVND(pay.totals.qc) },
      ];
    }),
    safe(async () => {
      const orders = await monthOrders(ctx);
      const noReader = orders.filter((o) => !o.reader_id).length;
      return [
        { k: "Đơn trong tháng", v: String(orders.length) },
        { k: "Doanh thu tháng", v: formatVND(orders.reduce((s, o) => s + o.total_price, 0)) },
        { k: "Khách khác nhau", v: String(new Set(orders.map((o) => o.customer_name.trim().toLowerCase())).size) },
        { k: "Đơn chưa gán Reader", v: String(noReader), warn: noReader > 0 },
      ];
    }),
    safe(async () => {
      const [waiting, hours, staff] = await Promise.all([
        waitingAppts(ctx),
        fetchAll<{ reader_id: string }>("reader_hours", `select=reader_id&work_date=eq.${today}&order=id.asc`),
        allStaff(ctx),
      ]);
      const over = waiting.filter((w) => new Date(w.appointment_at).getTime() < now).length;
      return [
        { k: "Reader đang làm việc", v: String(staff.filter((s) => s.role === "reader" && !s.archived).length) },
        { k: "Đã đăng ký giờ hôm nay", v: String(new Set(hours.map((h) => h.reader_id)).size) },
        { k: "Lịch hẹn đang đợi", v: String(waiting.length) },
        { k: "Lịch đợi quá giờ", v: String(over), warn: over > 0 },
      ];
    }),
    safe(async () => {
      const [reviews, orders, open] = await Promise.all([
        monthReviews(ctx),
        monthOrders(ctx),
        countRows("qc_complaints", "status=eq.open"),
      ]);
      const avg = reviews.length ? Math.round((reviews.reduce((s, r) => s + r.total_score, 0) / reviews.length) * 100) / 100 : null;
      const reviewed = new Set(reviews.map((r) => r.order_id));
      return [
        { k: "Phiếu đã chấm tháng này", v: String(reviews.length) },
        { k: "Điểm trung bình", v: avg === null ? "—" : String(avg) },
        { k: "Đơn chưa chấm", v: String(orders.filter((o) => !reviewed.has(o.id)).length) },
        { k: "Khiếu nại đang mở", v: String(open), warn: open > 0 },
      ];
    }),
    safe(async () => {
      const rs = repos();
      const sts = await Promise.all(rs.map((r) => gitStatus(r.dir).catch(() => null)));
      const dirty = sts.filter((s) => s && s.dirty.length > 0).length;
      const orders = await monthOrders(ctx);
      return [
        { k: "Kho mã đang theo dõi", v: String(rs.length) },
        { k: "Kho có thay đổi chưa lưu", v: String(dirty), warn: dirty > 0 },
        { k: "Đơn tháng / trần 1000", v: `${orders.length}`, warn: orders.length > 800 },
        { k: "Rà tsc + eslint", v: "bấm biển phòng" },
      ];
    }),
    safe(async () => {
      const migs = listThorDir("supabase/migrations").filter((f) => /^\d{4}_/.test(f.name)).map((f) => f.name).sort();
      const staff = await allStaff(ctx);
      return [
        { k: "Số bản nâng cấp CSDL", v: String(migs.length) },
        { k: "Bản mới nhất", v: migs.length ? migs[migs.length - 1].slice(0, 22) : "—" },
        { k: "Nhân sự đang làm", v: String(staff.filter((s) => !s.archived).length) },
        { k: "Tháng", v: today.slice(0, 7) },
      ];
    }),
    safe(async () => {
      const orders = await monthOrders(ctx);
      const pay = await computePayroll(ctx);
      return [
        { k: "Đơn trong tháng", v: String(orders.length) },
        { k: "Doanh thu tháng", v: formatVND(orders.reduce((s, o) => s + o.total_price, 0)) },
        { k: "Lương tạm tính", v: formatVND(pay.totals.all) },
        { k: "Ngày", v: today },
      ];
    }),
  ]);

  const data = { hr, acc, sale, reader, qc, ctrl, exec, hq, updatedAt: now } as TvData;
  g.__aiOfficeTv = { at: now, data };
  return data;
}
