import fs from "node:fs";
import path from "node:path";
import { countRows, thorRoot, type Ctx } from "@/lib/thorData";
import { monthOrders } from "@/lib/queries";
import { gitStatus, repos, runEslint, runTsc, walk } from "@/lib/thorFiles";
import { BASE_RULES, type AgentLogic } from "@/lib/logicTypes";

/**
 * TRUNG TÂM KIỂM SOÁT — Rà soát lỗi · bố cục · tối ưu · vận hành · dọn rác.
 * Chỉ ĐỌC/CHẠY KIỂM TRA (tsc, eslint, git status, quét file) — không sửa, không xoá gì.
 */

const SRC_DIRS = ["app", "components", "lib"];
const isSrc = (rel: string) => /\.(ts|tsx)$/.test(rel);

// ------------------------------------------------------- KS · Rà soát (mã nguồn)
type CtrlCode = {
  tsc: { ok: boolean; errors: number; sample: string[] };
  eslint: { errors: number; warnings: number; files: number; topRules: [string, number][]; sample: string[] };
  tepLon: { tep: string; dong: number }[];
  todo: number;
  consoleLog: number;
  kieuAny: number;
  trangRongNgang: string[];
  taiDuLieu: { donThang: number; tongDon: number; tongPhieuQc: number; tongNhatKy: number };
};

async function gatherCtrlCode(ctx: Ctx): Promise<CtrlCode> {
  const [tsc, eslint] = await Promise.all([runTsc(), runEslint()]);
  const big: { tep: string; dong: number }[] = [];
  let todo = 0;
  let consoleLog = 0;
  let anyCount = 0;
  const wide: string[] = [];
  for (const d of SRC_DIRS) {
    walk(d, (rel, abs) => {
      if (!isSrc(rel)) return;
      let text = "";
      try {
        text = fs.readFileSync(abs, "utf8");
      } catch {
        return;
      }
      const lines = text.split("\n").length;
      if (lines > 500) big.push({ tep: rel, dong: lines });
      todo += (text.match(/\b(TODO|FIXME|HACK)\b/g) ?? []).length;
      consoleLog += (text.match(/console\.log\(/g) ?? []).length;
      anyCount += (text.match(/:\s*any\b|\bas any\b/g) ?? []).length;
      // Bố cục: có min-w rất rộng (≥ 640px) mà file không có vùng cuộn ngang → dễ tràn khung điện thoại.
      const widest = Math.max(0, ...[...text.matchAll(/min-w-\[(\d+)px\]/g)].map((m) => Number(m[1])));
      if (widest >= 640 && !/overflow-(x-)?(auto|scroll)/.test(text)) wide.push(`${rel} (min-w ${widest}px)`);
    });
  }
  let tongDon = 0;
  let tongQc = 0;
  let tongLog = 0;
  try {
    [tongDon, tongQc, tongLog] = await Promise.all([countRows("orders"), countRows("qc_reviews"), countRows("activity_log")]);
  } catch {
    /* không đếm được thì để 0 */
  }
  return {
    tsc,
    eslint,
    tepLon: big.sort((a, b) => b.dong - a.dong).slice(0, 5),
    todo,
    consoleLog,
    kieuAny: anyCount,
    trangRongNgang: wide.slice(0, 6),
    taiDuLieu: { donThang: (await monthOrders(ctx)).length, tongDon, tongPhieuQc: tongQc, tongNhatKy: tongLog },
  };
}

function simCtrlCode(d: CtrlCode): string {
  const lines: string[] = [];
  lines.push(
    d.tsc.errors < 0
      ? `- ℹ️ Không chạy được kiểm tra kiểu (tsc): ${d.tsc.sample[0] ?? ""}`
      : d.tsc.ok
        ? "- ✅ **tsc** (kiểm tra kiểu): sạch, 0 lỗi"
        : `- 🚨 **tsc**: ${d.tsc.errors} lỗi — vd ${d.tsc.sample.slice(0, 2).join(" | ")}`
  );
  lines.push(
    d.eslint.errors < 0
      ? `- ℹ️ Không chạy được ESLint: ${d.eslint.sample[0] ?? ""}`
      : `- ${d.eslint.errors === 0 ? "✅" : "⚠️"} **ESLint**: ${d.eslint.errors} lỗi · ${d.eslint.warnings} cảnh báo (trên ${d.eslint.files} file)${
          d.eslint.topRules.length ? ` — nhiều nhất: ${d.eslint.topRules.map(([r, n]) => `${r} ×${n}`).join(", ")}` : ""
        }`
  );
  lines.push(
    d.tepLon.length ? `- Tệp mã dài (>500 dòng, khó bảo trì): ${d.tepLon.map((t) => `${t.tep} (${t.dong})`).join("; ")}` : "- ✅ Không tệp mã nào quá 500 dòng",
    `- Dấu vết tồn: TODO/FIXME ${d.todo} · console.log ${d.consoleLog} · kiểu any ${d.kieuAny}`,
    d.trangRongNgang.length
      ? `- ⚠️ Bố cục: tệp có bảng rộng ≥640px mà không có vùng cuộn ngang (dễ tràn màn hình điện thoại): ${d.trangRongNgang.join("; ")}`
      : "- ✅ Bố cục: mọi tệp có bảng rộng đều có vùng cuộn ngang"
  );
  const t = d.taiDuLieu;
  lines.push(
    `- Tối ưu/tải: đơn tháng này **${t.donThang}** (ngưỡng mượt ~1.000/tháng${t.donThang > 800 ? " ⚠️ sắp chạm" : ""}); tổng đơn ${t.tongDon}; phiếu QC ${t.tongPhieuQc}${t.tongPhieuQc > 4000 ? " ⚠️ gần trần 5.000 dòng nếu có truy vấn không phân trang" : ""}; nhật ký ${t.tongNhatKy}`
  );
  if (t.donThang > 1000) lines.push("- 🚨 Đơn tháng đã vượt 1.000 → cân nhắc kích hoạt khung SQL tổng hợp lương (0044) khi Dashboard/Lương nạp chậm.");
  return lines.join("\n");
}

// ------------------------------------------------------ KS · Vận hành & dọn rác
type CtrlOps = {
  kho: { ten: string; nhanh: string; chuaLuu: number; chuaDay: number; chuaKeVe: number; mau: string[] }[];
  tepRac: string[];
  tepNang: { tep: string; mb: number }[];
  tepNhayCam: string[];
  taiLieu: { handoffTre: number | null; tiepTucTre: number | null };
};

async function gatherCtrlOps(): Promise<CtrlOps> {
  const rs = repos();
  const kho = await Promise.all(
    rs.map(async (r) => {
      const g = await gitStatus(r.dir);
      return { ten: r.name, nhanh: g.branch, chuaLuu: g.dirty.length, chuaDay: g.ahead, chuaKeVe: g.behind, mau: g.dirty.slice(0, 4) };
    })
  );

  const junk: string[] = [];
  const heavy: { tep: string; mb: number }[] = [];
  const sensitive: string[] = [];
  let newestSrc = 0;
  walk(".", (rel, _abs, size, mtime) => {
    if (/(^|\/)_[^/]*\.(cjs|mjs|js)$/.test(rel) && /^scripts\//.test(rel)) junk.push(rel);
    else if (/\.(log|tmp|bak|orig)$/i.test(rel) || /tsbuildinfo$/.test(rel)) junk.push(rel);
    if (size > 3 * 1024 * 1024) heavy.push({ tep: rel, mb: Math.round((size / 1048576) * 10) / 10 });
    if (/keys?\.txt$|secret|password|credential/i.test(path.basename(rel))) sensitive.push(rel);
    if (/^(app|components|lib)\//.test(rel) && isSrc(rel)) newestSrc = Math.max(newestSrc, mtime);
  });

  const root = thorRoot();
  const docAge = (f: string) => {
    try {
      const m = fs.statSync(path.join(root, f)).mtimeMs;
      return Math.round(((newestSrc - m) / 86400000) * 10) / 10;
    } catch {
      return null;
    }
  };
  return {
    kho,
    tepRac: junk.slice(0, 8),
    tepNang: heavy.sort((a, b) => b.mb - a.mb).slice(0, 4),
    tepNhayCam: sensitive.slice(0, 4),
    taiLieu: { handoffTre: docAge("HANDOFF.md"), tiepTucTre: docAge("TIEP-TUC.md") },
  };
}

function simCtrlOps(d: CtrlOps): string {
  const lines = ["Kiểm tra vận hành các kho mã (mỗi kho = một dự án):"];
  for (const k of d.kho) {
    const state =
      k.chuaLuu === 0 && k.chuaDay === 0 && k.chuaKeVe === 0
        ? "✅ sạch, khớp GitHub"
        : [k.chuaLuu ? `⚠️ ${k.chuaLuu} thay đổi chưa commit` : "", k.chuaDay ? `${k.chuaDay} commit chưa đẩy` : "", k.chuaKeVe ? `${k.chuaKeVe} commit mới trên GitHub chưa kéo về` : ""]
            .filter(Boolean)
            .join(" · ");
    lines.push(`- ${k.ten} (${k.nhanh}): ${state}${k.mau.length ? ` — vd ${k.mau.join(", ")}` : ""}`);
  }
  lines.push(
    d.tepRac.length ? `- 🧹 File rác nên dọn (Thor): ${d.tepRac.join("; ")}` : "- ✅ Thor: không thấy file rác (script tạm, .log, .tmp, .bak)",
    d.tepNang.length ? `- File nặng (>3MB) trong Thor: ${d.tepNang.map((t) => `${t.tep} ${t.mb}MB`).join("; ")}` : "- ✅ Không có file nặng bất thường trong Thor",
    d.tepNhayCam.length ? `- 🚨 File có tên nhạy cảm (khoá/mật khẩu): ${d.tepNhayCam.join("; ")} — kiểm tra có bị đưa lên git không` : "- ✅ Không thấy file khoá/mật khẩu nằm trong Thor"
  );
  const old = (v: number | null) => (v !== null && v > 3 ? `⚠️ tài liệu cũ hơn mã ${v} ngày` : v === null ? "không đọc được" : "cập nhật kịp");
  lines.push(`- Tài liệu bàn giao: HANDOFF.md ${old(d.taiLieu.handoffTre)} · TIEP-TUC.md ${old(d.taiLieu.tiepTucTre)}`);
  return lines.join("\n");
}

export const CTRL_LOGIC: Record<"ctrl_code" | "ctrl_ops", AgentLogic> = {
  ctrl_code: {
    system:
      BASE_RULES +
      " NHÁNH CỦA BẠN (Trung Tâm Kiểm Soát · Rà soát): rà soát lỗi của App — kiểm tra kiểu, ESLint, tệp quá dài, bố cục màn hình (tràn ngang), tải dữ liệu/tối ưu.",
    keywords: ["kiem soat", "loi app", "ra soat", "tsc", "eslint", "bo cuc", "man hinh", "toi uu", "cham", "tai", "hieu nang", "bug"],
    gather: gatherCtrlCode,
    sim: simCtrlCode as AgentLogic["sim"],
  },
  ctrl_ops: {
    system:
      BASE_RULES +
      " NHÁNH CỦA BẠN (Trung Tâm Kiểm Soát · Vận hành): kiểm tra vận hành — trạng thái các kho mã (commit/đẩy/kéo), file rác cần dọn, file nặng, file nhạy cảm, tài liệu bàn giao có cũ không.",
    keywords: ["kiem soat", "van hanh", "don rac", "file rac", "git", "commit", "luu phien", "tai lieu", "ban giao", "don dep"],
    gather: gatherCtrlOps,
    sim: simCtrlOps as AgentLogic["sim"],
  },
};
