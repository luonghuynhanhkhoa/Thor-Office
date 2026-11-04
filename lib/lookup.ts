import { fetchAll, type Ctx } from "@/lib/thorData";
import { allStaff, computePayroll, monthOrders, monthReviews, type StaffFull } from "@/lib/queries";
import { norm } from "@/lib/logicTypes";
import { getCasesToday } from "@/lib/cases";
import { getSalesToday } from "@/lib/sales";
import { formatVND, hhmmToMin, nowMinutesVN, todayKey, vnDateKey } from "@/lib/vn";

/**
 * TRUY XUẤT MỘT NGƯỜI: khi yêu cầu nhắc tên một Reader/Saler/QC cụ thể, chỉ trả đúng thông tin của người đó
 * (và đúng chủ đề được hỏi: lương, đơn, ca trực, ca hẹn, điểm QC…) — KHÔNG trả báo cáo tổng thể của công ty.
 */
export type Topic = "gio-truc" | "ca-hen" | "don" | "luong" | "qc";

const ROLE_LABEL: Record<StaffFull["role"], string> = { reader: "Reader", saler: "Saler", qc: "QC" };
const ROLE_WORDS = new Set(["reader", "saler", "qc", "nhan", "vien", "user", "ban"]);

const tok = (s: string) => norm(s).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Tìm nhân sự được nhắc tên trong yêu cầu (nhiều người trùng tên → trả tất cả; tên ngắn phải viết hoa hoặc có chữ Reader/Saler/QC đứng trước). */
export function findPeople(request: string, roster: StaffFull[]): StaffFull[] {
  const raw = request.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  const nt = raw.map((r) => tok(r));
  const hasRole = (r: StaffFull["role"]) => nt.includes(r);
  const found: { p: StaffFull; len: number; exact: boolean }[] = [];

  for (const p of roster) {
    const parts = tok(p.name).split(" ").filter(Boolean);
    if (!parts.length) continue;
    for (let i = 0; i + parts.length <= nt.length; i++) {
      if (!parts.every((w, k) => nt[i + k] === w)) continue;
      const short = parts.join("").length <= 3;
      const capital = raw[i][0] !== raw[i][0].toLowerCase();
      const roleBefore = i > 0 && ROLE_WORDS.has(nt[i - 1]);
      if (short && !capital && !roleBefore) continue;
      // khớp ĐÚNG cả dấu (Thỏ ≠ Thơ) được ưu tiên hơn khớp bỏ dấu
      const exactParts = p.name.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
      const exact = exactParts.length === parts.length && exactParts.every((w, k) => raw[i + k].normalize("NFC").toLowerCase() === w);
      found.push({ p, len: parts.length, exact });
      break;
    }
  }
  if (!found.length) return [];
  const best = Math.max(...found.map((f) => f.len));
  let cands = found.filter((f) => f.len === best);
  if (cands.some((f) => f.exact)) cands = cands.filter((f) => f.exact);
  let top = cands.map((f) => f.p);
  // có ghi rõ vai trò (reader/saler/qc) thì ưu tiên đúng vai trò đó
  for (const r of ["reader", "saler", "qc"] as const) {
    if (hasRole(r) && top.some((p) => p.role === r)) {
      top = top.filter((p) => p.role === r);
      break;
    }
  }
  // người đang làm ưu tiên hơn người đã nghỉ
  const active = top.filter((p) => !p.archived);
  return active.length ? active : top;
}

export function detectTopics(request: string): Topic[] {
  let q = tok(request);
  const t = new Set<Topic>();
  if (/gio truc|ca truc|lich truc|dang truc|truc hom nay/.test(q)) {
    t.add("gio-truc");
    q = q.replace(/ca truc|gio truc|lich truc/g, " ");
  }
  if (/(^| )ca( |$)|lich hen|hen gio|danh sach doi|dang xu ly|ca hen/.test(q)) t.add("ca-hen");
  if (/(^| )don( |$)|don hang|khach|chot|goi|doanh thu|ban duoc/.test(q)) t.add("don");
  if (/luong|thu nhap|thuong|upsale/.test(q)) t.add("luong");
  if (/diem|cham|danh gia|khieu nai|phan nan/.test(q)) t.add("qc");
  return [...t];
}

type Slot = { kind: "work" | "off"; allDay?: boolean; start?: string | null; end?: string | null };

async function shiftSection(p: StaffFull): Promise<string[]> {
  const today = todayKey();
  const rows = await fetchAll<{ start_time: string | null; end_time: string | null; slots: Slot[] | null }>(
    "reader_hours",
    `select=start_time,end_time,slots&reader_id=eq.${p.id}&work_date=eq.${today}&order=id.asc`
  );
  const h = rows[0];
  if (!h) return ["- Hôm nay chưa đăng ký giờ trực."];
  const s = hhmmToMin(h.start_time);
  const e = hhmmToMin(h.end_time);
  if (s === null || e === null) return ["- Hôm nay **nghỉ cả ngày**."];
  const now = nowMinutesVN();
  const offs = (h.slots ?? []).filter((x) => x.kind === "off" && !x.allDay && hhmmToMin(x.start ?? null) !== null && hhmmToMin(x.end ?? null) !== null);
  const inOff = offs.some((x) => now >= (hhmmToMin(x.start ?? null) ?? 0) && now < (hhmmToMin(x.end ?? null) ?? 0));
  const state = now < s ? "⏳ chưa tới giờ trực" : now >= e ? "✓ đã hết ca" : inOff ? "☕ đang nghỉ giữa ca" : "🟢 ĐANG TRỰC";
  return [
    `- Ca hôm nay: **${h.start_time?.slice(0, 5)}–${h.end_time?.slice(0, 5)}** — ${state}`,
    ...(offs.length ? [`- Nghỉ giữa ca: ${offs.map((x) => `${x.start?.slice(0, 5)}–${x.end?.slice(0, 5)}`).join(", ")}`] : []),
  ];
}

/** Soạn thông tin của MỘT người theo các chủ đề được hỏi (không có chủ đề → đủ các mục của người đó). */
export async function lookupText(ctx: Ctx, p: StaffFull, topics: Topic[]): Promise<string> {
  const all = topics.length === 0;
  const want = (t: Topic) => all || topics.includes(t);
  const today = todayKey();
  const out: string[] = [`## ${p.name} · ${ROLE_LABEL[p.role]}${p.archived ? " (đã nghỉ)" : ""}`];

  const [orders, pay] = await Promise.all([monthOrders(ctx), computePayroll(ctx)]);
  const mine = orders.filter((o) => (p.role === "reader" ? o.reader_id === p.id : p.role === "saler" ? o.saler_id === p.id : false));
  const todayOrders = mine.filter((o) => o.order_date === today);
  const row = pay.rows.find((r) => r.id === p.id);

  if (p.role !== "qc" && want("gio-truc")) {
    out.push("### Giờ trực hôm nay", ...(await shiftSection(p)));
  }

  if (p.role === "reader" && want("ca-hen")) {
    const cases = await getCasesToday().catch(() => null);
    const r = cases?.readers.find((x) => x.id === p.id);
    out.push("### Ca đang xử lý (giờ hẹn Sale gắn)");
    if (!r) out.push("- Hôm nay chưa có ca nào được Sale giao.");
    else {
      out.push(
        r.handling ? `- ▶ Đang xử lý ca **${r.handling}**` : "- Chưa có ca nào tới giờ.",
        `- Ca đang đợi: ${r.waiting.length ? r.waiting.join(" · ") : "không có"} · đã xong hôm nay: ${r.done} ca`
      );
    }
  }

  if (p.role === "reader" && want("don")) {
    out.push(
      "### Đơn",
      `- Hôm nay Sale giao: **${todayOrders.length} đơn**${todayOrders.length ? ` (${formatVND(todayOrders.reduce((s, o) => s + o.total_price, 0))})` : ""}`,
      `- Cả tháng: **${mine.length} đơn** · ${formatVND(mine.reduce((s, o) => s + o.total_price, 0))}`
    );
    if (todayOrders.length) {
      const names = [...new Set(todayOrders.map((o) => o.customer_name))];
      out.push("- Khách hôm nay: " + names.slice(0, 8).join(", ") + (names.length > 8 ? "…" : ""));
    }
  }

  if (p.role === "saler" && want("don")) {
    const sales = await getSalesToday().catch(() => null);
    const s = sales?.salers.find((x) => x.id === p.id);
    out.push(
      "### Bán hàng",
      s
        ? `- Hôm nay: **${s.customers} khách** · ${s.orders} đơn · **${formatVND(s.revenue)}**`
        : "- Hôm nay chưa nhập đơn nào.",
      ...(s?.packages.length ? [`- Gói đã bán hôm nay: ${s.packages.map((g) => `${g.name} ×${g.count}`).join(" · ")}`] : []),
      `- Cả tháng: **${mine.length} đơn** · ${formatVND(mine.reduce((a, o) => a + o.total_price, 0))}`
    );
    const noReader = mine.filter((o) => !o.reader_id).length;
    if (noReader) out.push(`- ⚠️ ${noReader} đơn chưa gán Reader`);
  }

  if (want("luong") && row) {
    out.push("### Lương tạm tính tháng này");
    if (p.role === "reader") {
      out.push(
        `- **${formatVND(row.salary)}** trên ${row.orderCount} đơn (${formatVND(row.revenue)} doanh thu)`,
        `- Tự upsale: ${Math.round((row.upsaleRate ?? 0) * 1000) / 10}% → thưởng +${Math.round((row.bonusRate ?? 0) * 100)}%`
      );
    } else {
      out.push(`- **${formatVND(row.salary)}** trên ${row.orderCount} ${p.role === "qc" ? "phiếu chấm" : "đơn"} (${formatVND(row.revenue)} doanh thu)`);
    }
  }

  if (want("qc") && p.role !== "saler") {
    const reviews = (await monthReviews(ctx)).filter((r) => (p.role === "reader" ? r.reader_id === p.id : r.qc_id === p.id));
    out.push(p.role === "reader" ? "### Điểm QC chấm cho Reader này" : "### Việc chấm của QC này");
    if (!reviews.length) out.push("- Tháng này chưa có phiếu chấm.");
    else {
      const avg = Math.round((reviews.reduce((a, r) => a + r.total_score, 0) / reviews.length) * 100) / 100;
      const dist: Record<string, number> = {};
      for (const r of reviews) dist[r.rating] = (dist[r.rating] ?? 0) + 1;
      out.push(
        `- **${reviews.length} phiếu** · điểm trung bình **${avg}**`,
        `- Xếp loại: ${Object.entries(dist).map(([k, v]) => `${k} ${v}`).join(" · ")}`,
        ...(p.role === "qc" ? [`- Số ngày có chấm: ${new Set(reviews.map((r) => r.review_date)).size}`] : [])
      );
    }
    if (p.role === "reader") {
      const ids = new Set(mine.map((o) => o.id));
      const open = (await fetchAll<{ order_id: string }>("qc_complaints", "select=order_id&status=eq.open&order=id.asc")).filter((c) => ids.has(c.order_id));
      out.push(open.length ? `- ⚠️ Khiếu nại đang mở: **${open.length}**` : "- ✅ Không có khiếu nại đang mở");
    }
  }

  if (out.length === 1) return ""; // người này không có thông tin cho chủ đề được hỏi (vd QC trùng tên mà hỏi về bán hàng)
  out.push("", `(Dữ liệu tính đến ${new Date().toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" })} · ngày ${vnDateKey(Date.now())})`);
  return out.join("\n");
}

export async function resolvePeople(ctx: Ctx, request: string): Promise<StaffFull[]> {
  try {
    return findPeople(request, await allStaff(ctx));
  } catch {
    return [];
  }
}
