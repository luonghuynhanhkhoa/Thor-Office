import type { AgentId } from "@/lib/agentsMeta";
import { LOGIC } from "@/lib/agentLogic";
import { fetchAll, type Ctx } from "@/lib/thorData";
import { allProfiles, allStaff, authUsers, monthOrders } from "@/lib/queries";
import { getDuty } from "@/lib/duty";
import { norm } from "@/lib/logicTypes";
import { formatVND, todayKey, vnDateKey } from "@/lib/vn";

/**
 * TRẢ LỜI ĐÚNG TRỌNG TÂM: câu hỏi quen thuộc (các nút gợi ý + biến thể) được trả lời bằng ĐÚNG phần được hỏi,
 * không kèm báo cáo bao quát của cả phòng. Câu không khớp loại nào thì vẫn được lọc theo từ khoá của câu hỏi (focusLines).
 */
export type Direct = { agent: AgentId; title: string; task: string; run: (ctx: Ctx) => Promise<string> };

const q0 = (s: string) => norm(s).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Chạy AI của phòng rồi chỉ giữ những dòng khớp (bỏ dòng tiêu đề chung). */
function fromWorker(agent: AgentId, request: string, keep: RegExp): (ctx: Ctx) => Promise<string> {
  return async (ctx) => {
    const logic = LOGIC[agent];
    const data = await logic.gather!(ctx);
    const text = logic.sim!(data as never, request);
    const lines = text.split("\n").filter((l) => keep.test(l));
    return lines.length ? lines.join("\n") : "Không có mục nào khớp câu hỏi.";
  };
}

async function loginsAnswer(ctx: Ctx, q: string): Promise<string> {
  const [profiles, staff, auth] = await Promise.all([allProfiles(ctx), allStaff(ctx), authUsers(ctx)]);
  const nameOf = new Map(staff.map((s) => [s.id, s.name]));
  const profOf = new Map(profiles.map((p) => [p.id, p]));
  const label = (id: string, email: string | null) => {
    const sid = profOf.get(id)?.staff_id;
    return (sid && nameOf.get(sid)) || email || id.slice(0, 6);
  };
  const now = Date.now();
  const active = auth.filter((u) => !(u.banned_until && new Date(u.banned_until).getTime() > now));
  const today = todayKey();
  const never = active.filter((u) => !u.last_sign_in_at);
  if (/chua tung/.test(q)) {
    return never.length ? `**Chưa từng đăng nhập (${never.length}):** ${never.map((u) => label(u.id, u.email)).join(", ")}` : "✅ Mọi tài khoản đều từng đăng nhập.";
  }
  const notToday = active.filter((u) => !(u.last_sign_in_at && vnDateKey(u.last_sign_in_at) === today));
  const out = [
    `**Chưa đăng nhập hôm nay (${notToday.length}/${active.length} tài khoản):**`,
    ...notToday
      .sort((a, b) => (b.last_sign_in_at ?? "").localeCompare(a.last_sign_in_at ?? ""))
      .slice(0, 40)
      .map((u) => `- ${label(u.id, u.email)} — ${u.last_sign_in_at ? `lần cuối ${vnDateKey(u.last_sign_in_at)}` : "chưa từng đăng nhập"}`),
  ];
  if (notToday.length > 40) out.push(`- … và ${notToday.length - 40} tài khoản khác`);
  return out.join("\n");
}

async function dutyAnswer(): Promise<string> {
  const duty = await getDuty();
  const roleName = { reader: "Reader", saler: "Saler" } as const;
  const fmt = (s: (typeof duty)[number]) => `${s.name} (${s.from ?? "?"}–${s.to ?? "?"}${s.note ? `, ${s.note}` : ""})`;
  const group = (state: string, title: string) => {
    const l = duty.filter((s) => s.state === state);
    if (!l.length) return [];
    return [
      `**${title} (${l.length}):**`,
      ...(["reader", "saler"] as const)
        .map((r) => [r, l.filter((s) => s.role === r)] as const)
        .filter(([, x]) => x.length)
        .map(([r, x]) => `- ${roleName[r]}: ${x.map(fmt).join(", ")}`),
    ];
  };
  const out = [...group("on", "🟢 Đang trực"), ...group("break", "☕ Đang nghỉ giữa ca"), ...group("soon", "⏳ Sắp trực hôm nay")];
  return out.length ? out.join("\n") : "Hiện chưa có ai trong giờ trực (và hôm nay cũng không còn ca sắp tới).";
}

async function complaintsAnswer(ctx: Ctx): Promise<string> {
  const open = await fetchAll<{ order_id: string; created_at: string }>("qc_complaints", "select=order_id,created_at&status=eq.open&order=id.asc");
  if (!open.length) return "✅ Hiện không có khiếu nại nào đang mở.";
  const ids = [...new Set(open.map((c) => c.order_id))];
  const orders: { id: string; customer_name: string; reader_id: string | null }[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    orders.push(...(await fetchAll<{ id: string; customer_name: string; reader_id: string | null }>("orders", `select=id,customer_name,reader_id&id=in.(${ids.slice(i, i + 100).join(",")})&order=id.asc`)));
  }
  const byId = new Map(orders.map((o) => [o.id, o]));
  const staff = new Map((await allStaff(ctx)).map((s) => [s.id, s.name]));
  const rows = [...open].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return [
    `**${rows.length} khiếu nại đang mở** (cũ nhất trước):`,
    ...rows.slice(0, 20).map((c) => {
      const o = byId.get(c.order_id);
      const days = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000);
      return `- ${o?.customer_name ?? "đơn không rõ"} — Reader ${o?.reader_id ? (staff.get(o.reader_id) ?? "?") : "chưa gán"} · mở ${days} ngày (từ ${vnDateKey(c.created_at)})`;
    }),
    ...(rows.length > 20 ? [`- … và ${rows.length - 20} khiếu nại khác`] : []),
  ].join("\n");
}

async function revenueAnswer(ctx: Ctx): Promise<string> {
  const orders = await monthOrders(ctx);
  const today = todayKey();
  const t = orders.filter((o) => o.order_date === today);
  const sum = (l: typeof orders) => l.reduce((s, o) => s + o.total_price, 0);
  return [`- Hôm nay: **${formatVND(sum(t))}** · ${t.length} đơn`, `- Cả tháng: **${formatVND(sum(orders))}** · ${orders.length} đơn`].join("\n");
}

/** Nhận ra câu hỏi quen thuộc → trả về AI phụ trách + cách trả lời gọn. Không khớp → null. */
export function matchDirect(request: string): Direct | null {
  const q = q0(request);
  const mk = (agent: AgentId, title: string, run: Direct["run"]): Direct => ({ agent, title, task: title, run });

  if (/ra soat (app|ma|code)|loi code|tsc|eslint/.test(q)) {
    return mk("ctrl_code", "Rà soát mã nguồn App", fromWorker("ctrl_code", request, /.*/));
  }
  if (/dang nhap/.test(q)) {
    return mk("hr_ops", /chua tung/.test(q) ? "Chưa từng đăng nhập" : "Ai chưa đăng nhập hôm nay", (ctx) => loginsAnswer(ctx, q));
  }
  if (/chua dang ky gio/.test(q)) {
    return mk("reader_ops", "Ai chưa đăng ký giờ trực hôm nay", fromWorker("reader_ops", request, /Chưa đăng ký giờ|Mọi Reader đã đăng ký/));
  }
  if (/(^| )(ai|nhung ai|ai nao)( |$).*truc|dang truc|truc hom nay|ai truc/.test(q)) {
    return mk("reader_ops", "Ai đang trực", () => dutyAnswer());
  }
  if (/khieu nai|phan nan/.test(q)) {
    return mk("qc_ops", "Khiếu nại đang mở", complaintsAnswer);
  }
  if (/cong thuc/.test(q)) {
    return mk("acc_ops", "Kiểm tra công thức lương", fromWorker("acc_ops", request, /Công thức|công thức|Khung SQL/));
  }
  if (/chua gan reader|thieu reader/.test(q)) {
    return mk("sale_ops", "Đơn chưa gán Reader", fromWorker("sale_ops", request, /chưa gán Reader/));
  }
  if (/gia bang 0|gia 0|loi gia/.test(q)) {
    return mk("sale_ops", "Đơn giá bằng 0", fromWorker("sale_ops", request, /giá bằng 0/));
  }
  if (/nghi trung|don trung|trung don/.test(q)) {
    return mk("sale_ops", "Đơn nghi trùng", fromWorker("sale_ops", request, /Nghi trùng/));
  }
  if (/don (bi )?(thieu|loi)|thieu hoac loi|don thieu|don loi/.test(q)) {
    return mk("sale_ops", "Đơn bị thiếu hoặc lỗi", fromWorker("sale_ops", request, /chưa gán Reader|giá bằng 0|Nghi trùng/));
  }
  if (/lich (hen|doi).*(qua gio|tre)|qua gio/.test(q)) {
    return mk("reader_ops", "Lịch hẹn/ca đã quá giờ", fromWorker("reader_ops", request, /Lịch đợi|lịch đợi/));
  }
  if (/^(doanh thu|doanh thu (hom nay|thang nay))( |$)|doanh thu hom nay|doanh thu thang nay/.test(q)) {
    return mk("sale_manage", "Doanh thu", (ctx) => revenueAnswer(ctx));
  }
  return null;
}

const STOP = new Set(
  ("ai nao nay hom dang la co bao nhieu cua cho kiem tra xem cac nhung phong thang hien tai nhu the gi khong duoc va hoac voi o toi minh anh " +
    "nhan su ke toan sale reader qc kiem soat dieu hanh trung tam tong quan toan cong ty tat ca can mot").split(" ")
);

/** Dấu hiệu "AI này không có mục nào liên quan tới câu hỏi" (để bỏ khỏi báo cáo). */
export const NO_MATCH = "— không có mục liên quan tới câu hỏi —";

/**
 * Lọc kết quả của AI theo từ khoá của câu hỏi — chỉ giữ mục liên quan.
 *  - Câu hỏi không có từ khoá riêng (chỉ nêu tên phòng) → giữ nguyên.
 *  - Có từ khoá mà không mục nào đủ khớp → trả null (AI này không liên quan, đừng đưa vào câu trả lời).
 * "Mục" = một dòng; hoặc một dòng tiêu đề kết thúc bằng dấu ":" cùng các gạch đầu dòng bên dưới nó.
 */
export function focusLines(text: string, request: string): string | null {
  const words = q0(request).split(" ").filter((w) => w.length >= 2 && !STOP.has(w));
  if (!words.length) return text;
  const grams = new Set<string>(words);
  for (let i = 0; i + 1 < words.length; i++) grams.add(`${words[i]} ${words[i + 1]}`);
  const score = (l: string) => {
    const n = q0(l);
    let s = 0;
    for (const g of grams) if (n.includes(g)) s += g.includes(" ") ? 3 : 1;
    return s;
  };
  const lines = text.split("\n").filter((l) => l.trim());
  const items: { text: string; s: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const isBullet = l.trim().startsWith("-");
    if (!isBullet && l.trim().endsWith(":") && lines[i + 1]?.trim().startsWith("-")) {
      const block = [l];
      while (lines[i + 1]?.trim().startsWith("-")) block.push(lines[++i]);
      items.push({ text: block.join("\n"), s: Math.max(...block.map(score)) });
    } else {
      items.push({ text: l, s: score(l) });
    }
  }
  const min = words.length >= 2 ? 2 : 1;
  const best = Math.max(0, ...items.map((x) => x.s));
  if (best < min) return null;
  return items.filter((x) => x.s >= Math.max(min, Math.ceil(best / 2))).map((x) => x.text).join("\n");
}
