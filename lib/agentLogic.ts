import type { AgentId } from "@/lib/agentsMeta";
import { AGENTS, DEPTS } from "@/lib/agentsMeta";
import { BASE_RULES, norm, type AgentLogic } from "@/lib/logicTypes";
import { HR_LOGIC } from "@/lib/depts/hr";
import { ACC_LOGIC } from "@/lib/depts/acc";
import { SALE_LOGIC } from "@/lib/depts/sale";
import { READER_LOGIC } from "@/lib/depts/reader";
import { QC_LOGIC } from "@/lib/depts/qc";
import { CTRL_LOGIC } from "@/lib/depts/ctrl";
import { EXEC_LOGIC } from "@/lib/depts/exec";

/**
 * Bảng logic của mọi AI (chỉ server). Mỗi phòng nằm ở lib/depts/<phòng>.ts:
 * gather = lấy số liệu (chỉ đọc), sim = viết kết quả khi chưa nối AI thật.
 */
export const LOGIC: Record<AgentId, AgentLogic> = {
  commander: {
    system:
      BASE_RULES +
      " NHÁNH CỦA BẠN: phân việc. Bạn nhận yêu cầu của anh Thỏ và chia cho đúng AI chuyên môn ở các phòng ban, mỗi AI một việc riêng, không dồn nhiều việc cho một AI.",
    keywords: [],
  },
  reporter: {
    system:
      BASE_RULES +
      " NHÁNH CỦA BẠN: gộp kết quả của các AI khác thành MỘT báo cáo ngắn gọn cho anh Thỏ, nhóm theo phòng ban: mở đầu bằng 2–3 ý quan trọng nhất, rồi liệt kê việc cần xử lý. Không tự thêm số liệu mới.",
    keywords: [],
  },
  ...HR_LOGIC,
  ...ACC_LOGIC,
  ...SALE_LOGIC,
  ...READER_LOGIC,
  ...QC_LOGIC,
  ...CTRL_LOGIC,
  ...EXEC_LOGIC,
};

/** Các AI làm việc thật (có số liệu để lấy) — Chỉ huy chỉ giao việc cho nhóm này. */
export const WORKERS: AgentId[] = AGENTS.filter((a) => LOGIC[a.id].gather).map((a) => a.id);

/**
 * Chỉ huy (chế độ tự tính): chọn AI theo yêu cầu.
 *  1. Có nhắc TÊN PHÒNG (vd "kế toán", "nhân sự") → giao cho CẢ 2 AI của phòng đó.
 *  2. Có từ khoá riêng của từng AI → chọn AI khớp.
 *  3. Chỉ khi nói rõ "tổng quan / tất cả / toàn công ty" mới giao mọi AI; không khớp gì → không giao (hỏi lại).
 *  (Yêu cầu nhắc TÊN một Reader/Saler/QC được xử lý riêng ở lib/lookup.ts — chỉ trả đúng người đó.)
 */
export function planByKeywords(request: string): AgentId[] {
  const q = norm(request);
  const picked = new Set<AgentId>();

  // Từ nhắc ĐÍCH DANH một phòng (đã bỏ dấu). "sale/reader/qc" đứng một mình quá chung nên cần chữ "phòng".
  const deptWords: Record<string, string[]> = {
    hr: ["nhan su"],
    acc: ["ke toan"],
    sale: ["phong sale"],
    reader: ["phong reader"],
    qc: ["phong qc"],
    ctrl: ["kiem soat"],
    exec: ["dieu hanh"],
  };
  for (const d of DEPTS) {
    const words = deptWords[d.id];
    if (words?.some((w) => q.includes(w))) {
      for (const a of AGENTS) if (a.dept === d.id && WORKERS.includes(a.id)) picked.add(a.id);
    }
  }

  for (const id of WORKERS) {
    if (LOGIC[id].keywords.some((k) => q.includes(k))) picked.add(id);
  }

  // Chỉ báo cáo TỔNG THỂ khi anh nói rõ ("tổng quan", "tất cả", "toàn công ty"…). Có chỉ đích danh phòng/việc thì chỉ làm đúng phần đó.
  if (/tong quan|tat ca|toan bo|tinh hinh|toan cong ty|bao cao chung|bao cao tong/.test(q)) return [...WORKERS];
  if (picked.size > 0) return WORKERS.filter((id) => picked.has(id));
  if (/bao cao/.test(q)) return [...WORKERS];
  return []; // không rõ yêu cầu → hỏi lại, KHÔNG tự đưa báo cáo tổng thể
}
