import fs from "node:fs";
import path from "node:path";
import { fetchAll, thorRoot } from "@/lib/thorData";
import { listThorDir, readThorFile } from "@/lib/thorFiles";
import { BASE_RULES, type AgentLogic } from "@/lib/logicTypes";
import { formatVND, monthRangeVN } from "@/lib/vn";

/** PHÒNG ĐIỀU HÀNH — Quản lý tính năng & giao diện của Admin. */

// ----------------------------------------------------------- ĐH · Tính năng
type ExecFeatures = {
  mocLoiNhuan: { cam: number; xanh: number } | null;
  mocTongCa: { mot: number; hai: number } | null;
  nguongQc: Record<string, number> | null;
  bangGia: { tong: number; theoKenh: Record<string, number>; giaBangKhong: string[]; trung: string[] };
  chiPhiThang: { soKhoan: number; tong: number };
  migrationMoiNhat: string | null;
  viecTreo: string[];
};

async function gatherExecFeatures(): Promise<ExecFeatures> {
  const one = async <T>(table: string, select: string): Promise<T | null> => {
    try {
      return (await fetchAll<T>(table, `select=${select}&order=id.asc`))[0] ?? null;
    } catch {
      return null;
    }
  };
  const profit = await one<{ orange_min_pct: number; green_min_pct: number }>("profit_settings", "orange_min_pct,green_min_pct");
  const today = await one<{ orange_min: number; green_min: number }>("today_revenue_settings", "orange_min,green_min");
  const qc = await one<Record<string, number>>(
    "qc_settings",
    "excellent_threshold_pct,good_threshold_pct,pass_threshold_pct,needs_work_threshold_pct"
  );

  const prices = await fetchAll<{ channel: string; package_name: string; price: number }>(
    "package_prices",
    "select=channel,package_name,price&order=id.asc"
  );
  const byChannel: Record<string, number> = {};
  const seen = new Map<string, number>();
  for (const p of prices) {
    byChannel[p.channel] = (byChannel[p.channel] ?? 0) + 1;
    const k = `${p.channel}|${p.package_name}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const { start, end } = monthRangeVN();
  let costs: { amount: number }[] = [];
  try {
    costs = await fetchAll<{ amount: number }>("operating_costs", `select=amount&cost_date=gte.${start}&cost_date=lt.${end}&order=id.asc`);
  } catch {
    costs = [];
  }

  const migs = listThorDir("supabase/migrations")
    .map((f) => f.name)
    .filter((n) => /^\d{4}_/.test(n))
    .sort();
  const pending = [
    ...(readThorFile("TIEP-TUC.md") ?? "").split("\n").filter((l) => /Migration duy nhất chưa chạy|CHƯA chạy cho tới|CẦN CHẠY/i.test(l)),
  ]
    .slice(0, 2)
    .map((l) => l.replace(/\*\*/g, "").trim().slice(0, 170));

  return {
    mocLoiNhuan: profit ? { cam: profit.orange_min_pct, xanh: profit.green_min_pct } : null,
    mocTongCa: today ? { mot: today.orange_min, hai: today.green_min } : null,
    nguongQc: qc,
    bangGia: {
      tong: prices.length,
      theoKenh: byChannel,
      giaBangKhong: prices.filter((p) => !(p.price > 0)).slice(0, 5).map((p) => `${p.channel}: ${p.package_name}`),
      trung: [...seen.entries()].filter(([, n]) => n > 1).slice(0, 5).map(([k]) => k.replace("|", ": ")),
    },
    chiPhiThang: { soKhoan: costs.length, tong: costs.reduce((s, c) => s + c.amount, 0) },
    migrationMoiNhat: migs.length ? migs[migs.length - 1] : null,
    viecTreo: pending,
  };
}

function simExecFeatures(d: ExecFeatures): string {
  return [
    "Cài đặt tính năng Admin đang áp dụng:",
    d.mocLoiNhuan ? `- Màu ô Lợi nhuận: Cam từ ${d.mocLoiNhuan.cam}% · Xanh từ ${d.mocLoiNhuan.xanh}% biên` : "- Màu ô Lợi nhuận: chưa đọc được (dùng mặc định 0%/30%)",
    d.mocTongCa ? `- Màu "Tổng ca" hôm nay: Cam dưới ${formatVND(d.mocTongCa.mot)} · Xanh nhạt tới ${formatVND(d.mocTongCa.hai)} · Xanh đậm từ đó` : "- Màu \"Tổng ca\": chưa đọc được (mặc định 10tr/20tr)",
    d.nguongQc ? `- Ngưỡng xếp loại QC (%): ${Object.entries(d.nguongQc).map(([k, v]) => `${k.replace("_threshold_pct", "")} ${v}`).join(" · ")}` : "- Ngưỡng QC: chưa đọc được",
    `- Bảng giá: **${d.bangGia.tong} gói** (${Object.entries(d.bangGia.theoKenh).map(([k, v]) => `${k} ${v}`).join(" · ")})`,
    d.bangGia.giaBangKhong.length ? `  - ⚠️ Gói giá 0: ${d.bangGia.giaBangKhong.join("; ")}` : "  - ✅ Không gói nào giá 0",
    d.bangGia.trung.length ? `  - ⚠️ Gói trùng tên trong cùng kênh: ${d.bangGia.trung.join("; ")}` : "  - ✅ Không gói trùng",
    `- Chi phí vận hành tháng này: ${d.chiPhiThang.soKhoan} khoản · ${formatVND(d.chiPhiThang.tong)}`,
    `- Migration mới nhất trong mã: ${d.migrationMoiNhat ?? "không rõ"}`,
    d.viecTreo.length ? `- ⚠️ Việc treo ghi trong tài liệu: ${d.viecTreo.join(" | ")}` : "- ✅ Tài liệu không ghi migration nào đang treo",
  ].join("\n");
}

// ------------------------------------------------------------ ĐH · Giao diện
type ExecUi = {
  menu: { tong: number; chiAdmin: string[] };
  trangMoCoi: string[];
  menuKhongCoTrang: string[];
  coGi: { soMuc: number; moiNhat: string[]; ngayMoiNhat: string | null };
  huongDan: { soMuc: number };
  soComponent: number;
};

function gatherExecUi(): Promise<ExecUi> {
  const nav = readThorFile("components/Nav.tsx") ?? "";
  const hrefs = [...new Set([...nav.matchAll(/href:\s*"(\/[a-z0-9\-/]*)"/g)].map((m) => m[1]))];

  // Các trang thật: thư mục có page.tsx trong app/(protected) (bỏ trang động [..]).
  const root = path.join(thorRoot(), "app", "(protected)");
  const pages: string[] = [];
  const rec = (dir: string, prefix: string) => {
    let ents: fs.Dirent[] = [];
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (ents.some((e) => e.isFile() && /^page\.tsx?$/.test(e.name)) && prefix) pages.push(prefix);
    for (const e of ents) if (e.isDirectory() && !e.name.startsWith("[")) rec(path.join(dir, e.name), `${prefix}/${e.name}`);
  };
  rec(root, "");

  const isAdminOnly = (href: string) => ["/users", "/activity", "/salary", "/packages", "/qc-criteria", "/operating-costs", "/advances"].includes(href);
  const wn = readThorFile("lib/whatsNew.ts") ?? "";
  const ids = [...wn.matchAll(/^\s{4}id:\s*"([^"]+)"/gm)].map((m) => m[1]);
  const guide = readThorFile("lib/guide.ts") ?? "";
  const comp = listThorDir("components").filter((f) => !f.isDir).length;

  return Promise.resolve({
    menu: { tong: hrefs.length, chiAdmin: hrefs.filter(isAdminOnly) },
    trangMoCoi: pages.filter((p) => !hrefs.some((h) => h === p || h.startsWith(p + "/")) && !["/login"].includes(p)),
    menuKhongCoTrang: hrefs.filter((h) => !pages.includes(h) && h !== "/inbox" && !pages.some((p) => p === h)),
    coGi: { soMuc: ids.length, moiNhat: ids.slice(0, 3), ngayMoiNhat: wn.match(/date:\s*"([^"]+)"/)?.[1] ?? null },
    huongDan: { soMuc: (guide.match(/^\s{4}key:\s*"/gm) ?? []).length },
    soComponent: comp,
  });
}

function simExecUi(d: ExecUi): string {
  return [
    `Giao diện Admin: **${d.menu.tong} mục menu** (riêng Admin: ${d.menu.chiAdmin.join(", ") || "—"}), ${d.soComponent} component.`,
    d.trangMoCoi.length ? `- ⚠️ Trang có thật nhưng KHÔNG có trên menu: ${d.trangMoCoi.join(", ")} (có thể là trang phụ hoặc bị bỏ quên)` : "- ✅ Mọi trang đều có lối vào từ menu",
    d.menuKhongCoTrang.length ? `- ⚠️ Mục menu trỏ tới trang không tồn tại: ${d.menuKhongCoTrang.join(", ")}` : "- ✅ Mọi mục menu đều có trang thật",
    `- "Có gì mới": ${d.coGi.soMuc} mục, mới nhất ${d.coGi.ngayMoiNhat ?? "?"} (${d.coGi.moiNhat.join(", ")})`,
    `- "Hướng dẫn": ${d.huongDan.soMuc} mục`,
  ].join("\n");
}

export const EXEC_LOGIC: Record<"exec_features" | "exec_ui", AgentLogic> = {
  exec_features: {
    system:
      BASE_RULES +
      " NHÁNH CỦA BẠN (Phòng Điều Hành · Tính năng): quản lý tính năng và cài đặt của Admin — các mốc màu, ngưỡng QC, bảng giá, chi phí vận hành, migration.",
    keywords: ["dieu hanh", "tinh nang", "cai dat", "moc mau", "bang gia", "migration", "admin", "nguong"],
    gather: gatherExecFeatures,
    sim: simExecFeatures as AgentLogic["sim"],
  },
  exec_ui: {
    system:
      BASE_RULES +
      " NHÁNH CỦA BẠN (Phòng Điều Hành · Giao diện): quản lý giao diện của Admin — menu, các trang, mục Có gì mới và Hướng dẫn có đồng bộ không.",
    keywords: ["dieu hanh", "giao dien", "menu", "trang", "co gi moi", "huong dan", "man hinh admin"],
    gather: gatherExecUi,
    sim: simExecUi as AgentLogic["sim"],
  },
};
