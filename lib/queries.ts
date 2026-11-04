import { Ctx, fetchAll, fetchAuthUsers, type AuthUser } from "@/lib/thorData";
import { monthRangeVN } from "@/lib/vn";

/** Các truy vấn DÙNG CHUNG (nhớ trong 1 công việc nhờ Ctx) + bản chép công thức lương của Thor. */

export type OrderFull = {
  id: string;
  customer_name: string;
  channel: string | null;
  order_date: string;
  reader_id: string | null;
  upsale_reader_id: string | null;
  saler_id: string | null;
  total_price: number;
  price_1: number;
  price_2: number;
  price_3: number;
  price_4: number;
  price_5: number;
  package_1_upsale: boolean;
  package_2_upsale: boolean;
  package_3_upsale: boolean;
  package_4_upsale: boolean;
  package_5_upsale: boolean;
  created_at: string;
};

export type StaffFull = {
  id: string;
  name: string;
  role: "reader" | "saler" | "qc";
  reader_rate: number | null;
  saler_rate: number | null;
  qc_rate: number | null;
  archived?: boolean | null;
};

export type ProfileRow = {
  id: string;
  email: string | null;
  role: string;
  role2: string | null;
  staff_id: string | null;
  staff_id2: string | null;
};

export type ReviewRow = {
  order_id: string;
  qc_id: string | null;
  reader_id: string | null;
  total_score: number;
  max_total: number;
  rating: string;
  review_date: string;
};

const COLS =
  "id,customer_name,channel,order_date,reader_id,upsale_reader_id,saler_id,total_price,price_1,price_2,price_3,price_4,price_5,package_1_upsale,package_2_upsale,package_3_upsale,package_4_upsale,package_5_upsale,created_at";

export const monthOrders = (ctx: Ctx) =>
  ctx.get("orders-month", () => {
    const { start, end } = monthRangeVN();
    return fetchAll<OrderFull>("orders", `select=${COLS}&order_date=gte.${start}&order_date=lt.${end}&order=id.asc`);
  });

export const allStaff = (ctx: Ctx) =>
  ctx.get("staff", () =>
    fetchAll<StaffFull>("staff", "select=id,name,role,reader_rate,saler_rate,qc_rate,archived&order=id.asc")
  );

export const allProfiles = (ctx: Ctx) =>
  ctx.get("profiles", () =>
    fetchAll<ProfileRow>("profiles", "select=id,email,role,role2,staff_id,staff_id2&order=id.asc")
  );

export const authUsers = (ctx: Ctx): Promise<AuthUser[]> => ctx.get("auth-users", () => fetchAuthUsers());

export const waitingAppts = (ctx: Ctx) =>
  ctx.get("appts-waiting", () =>
    fetchAll<{ order_id: string; appointment_at: string }>(
      "order_appointments",
      "select=order_id,appointment_at&status=eq.waiting&order=id.asc"
    )
  );

export const monthReviews = (ctx: Ctx) =>
  ctx.get("reviews-month", () => {
    const { start, end } = monthRangeVN();
    return fetchAll<ReviewRow>(
      "qc_reviews",
      `select=order_id,qc_id,reader_id,total_score,max_total,rating,review_date&review_date=gte.${start}&review_date=lt.${end}&order=id.asc`
    );
  });

export const nameMap = async (ctx: Ctx): Promise<Map<string, string>> =>
  new Map((await allStaff(ctx)).map((s) => [s.id, s.name]));

// ======================================================================================
// BẢN CHÉP công thức lương của Thor (Thor/lib/salary.ts). ⚠️ PHẢI ĐỒNG BỘ khi Thor đổi.
// Phòng Kế Toán · Vận hành tự so các hằng số này với file thật của Thor để phát hiện lệch.
// ======================================================================================
export const MIRROR = {
  SALER_BASE_RATE: 0.05,
  SALER_UPSALE_RATE: 0.03,
  READER_BASE_RATE: 0.35,
  READER_UPSALE_THRESHOLD: 0.15,
  READER_UPSALE_HIGH_BONUS: 0.1,
  READER_UPSALE_LOW_BONUS: 0.05,
  QC_RATE: 0.035,
} as const;

function salerOrderAmount(o: OrderFull, base?: number | null): number {
  const b = base ?? MIRROR.SALER_BASE_RATE;
  const prices = [o.price_1, o.price_2, o.price_3, o.price_4, o.price_5];
  const ups = [o.package_1_upsale, o.package_2_upsale, o.package_3_upsale, o.package_4_upsale, o.package_5_upsale];
  return prices.reduce((s, p, i) => s + (p || 0) * (ups[i] ? MIRROR.SALER_UPSALE_RATE : b), 0);
}

export type SalaryRow = {
  id: string;
  name: string;
  role: "reader" | "saler" | "qc";
  orderCount: number;
  revenue: number;
  salary: number;
  /** Chỉ Reader: tỷ lệ tự-upsale + mức thưởng. */
  upsaleRate?: number;
  bonusRate?: number;
};

export type Payroll = {
  rows: SalaryRow[];
  held: number;
  customRates: string[];
  totals: { reader: number; saler: number; qc: number; all: number };
};

/** Tính lương tháng hiện tại cho mọi nhân sự đang làm — cùng quy tắc với Thor. */
export async function computePayroll(ctx: Ctx): Promise<Payroll> {
  return ctx.get("payroll", async () => {
    const [orders, staff, waiting, reviews] = await Promise.all([
      monthOrders(ctx),
      allStaff(ctx),
      waitingAppts(ctx),
      monthReviews(ctx),
    ]);
    const heldIds = new Set(waiting.map((w) => w.order_id));
    const rows: SalaryRow[] = [];
    const customRates: string[] = [];

    for (const s of staff.filter((x) => !x.archived)) {
      if (s.role === "saler") {
        const mine = orders.filter((o) => o.saler_id === s.id && o.reader_id);
        rows.push({
          id: s.id,
          name: s.name,
          role: "saler",
          orderCount: mine.length,
          revenue: mine.reduce((a, o) => a + o.total_price, 0),
          salary: mine.reduce((a, o) => a + salerOrderAmount(o, s.saler_rate), 0),
        });
        if (s.saler_rate != null) customRates.push(`${s.name} (Saler ${Math.round(s.saler_rate * 1000) / 10}%)`);
      } else if (s.role === "reader") {
        const mine = orders.filter((o) => o.reader_id === s.id && !heldIds.has(o.id));
        const self = mine.filter((o) => o.upsale_reader_id === s.id).length;
        const rate = mine.length ? self / mine.length : 0;
        const bonus = rate >= MIRROR.READER_UPSALE_THRESHOLD ? MIRROR.READER_UPSALE_HIGH_BONUS : MIRROR.READER_UPSALE_LOW_BONUS;
        const base = s.reader_rate ?? MIRROR.READER_BASE_RATE;
        rows.push({
          id: s.id,
          name: s.name,
          role: "reader",
          orderCount: mine.length,
          revenue: mine.reduce((a, o) => a + o.total_price, 0),
          salary: mine.reduce((a, o) => a + o.total_price * (base + (o.upsale_reader_id === s.id ? bonus : 0)), 0),
          upsaleRate: rate,
          bonusRate: bonus,
        });
        if (s.reader_rate != null) customRates.push(`${s.name} (Reader nền ${Math.round(s.reader_rate * 1000) / 10}%)`);
      }
    }

    // Lương QC theo THÁNG CHẤM: cần giá của đơn đã chấm (có thể là đơn tháng trước).
    const price = new Map(orders.map((o) => [o.id, o.total_price]));
    const missing = [...new Set(reviews.map((r) => r.order_id))].filter((id) => !price.has(id));
    for (let i = 0; i < missing.length; i += 100) {
      const chunk = missing.slice(i, i + 100);
      const rows2 = await fetchAll<{ id: string; total_price: number }>(
        "orders",
        `select=id,total_price&id=in.(${chunk.join(",")})&order=id.asc`
      );
      for (const r of rows2) price.set(r.id, r.total_price);
    }
    for (const s of staff.filter((x) => x.role === "qc" && !x.archived)) {
      const mine = reviews.filter((r) => r.qc_id === s.id);
      const revenue = mine.reduce((a, r) => a + (price.get(r.order_id) ?? 0), 0);
      rows.push({
        id: s.id,
        name: s.name,
        role: "qc",
        orderCount: mine.length,
        revenue,
        salary: revenue * (s.qc_rate ?? MIRROR.QC_RATE),
      });
      if (s.qc_rate != null) customRates.push(`${s.name} (QC ${Math.round(s.qc_rate * 1000) / 10}%)`);
    }

    const sum = (r: SalaryRow["role"]) => rows.filter((x) => x.role === r).reduce((a, x) => a + x.salary, 0);
    return {
      rows,
      held: heldIds.size,
      customRates,
      totals: { reader: sum("reader"), saler: sum("saler"), qc: sum("qc"), all: sum("reader") + sum("saler") + sum("qc") },
    };
  });
}
