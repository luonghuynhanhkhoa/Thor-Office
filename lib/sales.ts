import { fetchAll } from "@/lib/thorData";
import { todayKey } from "@/lib/vn";
import type { SalerSales, SalesToday } from "@/lib/dutyTypes";

/** Bán hàng hôm nay: mỗi Saler đã chốt bao nhiêu khách, những gói nào, bao nhiêu tiền; tổng doanh thu cả ngày. Nhớ 20 giây. */
type Order = {
  saler_id: string | null;
  customer_name: string | null;
  total_price: number | null;
  package_1: string | null;
  package_2: string | null;
  package_3: string | null;
  package_4: string | null;
  package_5: string | null;
};

const g = globalThis as unknown as { __aiOfficeSales?: { at: number; data: SalesToday } };

export async function getSalesToday(): Promise<SalesToday> {
  const hit = g.__aiOfficeSales;
  if (hit && Date.now() - hit.at < 20_000) return hit.data;
  const today = todayKey();
  const [orders, staff] = await Promise.all([
    fetchAll<Order>(
      "orders",
      `select=saler_id,customer_name,total_price,package_1,package_2,package_3,package_4,package_5&order_date=eq.${today}&order=id.asc`
    ),
    fetchAll<{ id: string; name: string; role: string }>("staff", "select=id,name,role&order=id.asc"),
  ]);
  const nameOf = new Map(staff.map((s) => [s.id, s.name]));
  const per = new Map<string, { cust: Set<string>; orders: number; revenue: number; pk: Map<string, number> }>();
  const allCust = new Set<string>();
  let total = 0;
  for (const o of orders) {
    total += o.total_price ?? 0;
    const cust = (o.customer_name ?? "").trim().toLowerCase();
    if (cust) allCust.add(cust);
    if (!o.saler_id) continue;
    const e = per.get(o.saler_id) ?? { cust: new Set<string>(), orders: 0, revenue: 0, pk: new Map<string, number>() };
    e.orders++;
    e.revenue += o.total_price ?? 0;
    if (cust) e.cust.add(cust);
    for (const p of [o.package_1, o.package_2, o.package_3, o.package_4, o.package_5]) {
      const n = (p ?? "").trim();
      if (n) e.pk.set(n, (e.pk.get(n) ?? 0) + 1);
    }
    per.set(o.saler_id, e);
  }
  const salers: SalerSales[] = [...per.entries()]
    .map(([id, e]) => ({
      id,
      name: nameOf.get(id) ?? "(không rõ)",
      customers: e.cust.size,
      orders: e.orders,
      revenue: e.revenue,
      packages: [...e.pk.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.revenue - a.revenue);
  const data: SalesToday = { date: today, totalRevenue: total, totalCustomers: allCust.size, totalOrders: orders.length, salers };
  g.__aiOfficeSales = { at: Date.now(), data };
  return data;
}

/** Số liệu giả để xem thử (?duty=demo). */
export async function getSalesDemo(): Promise<SalesToday> {
  const staff = await fetchAll<{ id: string; name: string; role: string; archived?: boolean | null }>("staff", "select=id,name,role,archived&order=id.asc");
  const salers = staff.filter((s) => s.role === "saler" && !s.archived).slice(0, 5);
  const pk = ["Tử vi 199K", "Bài Tarot 99K", "Chỉ tay 149K", "Kinh Dịch 209K", "Tử vi tổng quan 399K"];
  const list: SalerSales[] = salers.map((s, i) => ({
    id: s.id,
    name: s.name,
    customers: 6 - i,
    orders: 7 - i,
    revenue: (7 - i) * 215000,
    packages: [
      { name: pk[i % 5], count: 3 + (i % 2) },
      { name: pk[(i + 2) % 5], count: 2 },
      { name: pk[(i + 4) % 5], count: 1 },
    ],
  }));
  return {
    date: new Date().toISOString().slice(0, 10),
    totalRevenue: list.reduce((a, s) => a + s.revenue, 0),
    totalCustomers: list.reduce((a, s) => a + s.customers, 0),
    totalOrders: list.reduce((a, s) => a + s.orders, 0),
    salers: list,
  };
}
