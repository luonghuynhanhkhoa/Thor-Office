import type { Ctx } from "@/lib/thorData";

/**
 * Khuôn chung của logic từng AI (chỉ server):
 *  - system   : lời nhắc riêng — giới hạn ĐÚNG MỘT nhánh việc
 *  - keywords : từ khoá (đã bỏ dấu, chữ thường) để Chỉ huy ở chế độ tự tính biết giao việc cho ai
 *  - gather   : lấy số liệu (Thor/mã nguồn) cho nhánh của mình — chỉ đọc
 *  - sim      : viết kết quả từ số liệu — dùng khi chưa nối AI thật (chế độ "tự tính")
 */
export type AgentLogic = {
  system: string;
  keywords: string[];
  gather?: (ctx: Ctx) => Promise<unknown>;
  sim?: (data: never, task: string) => string;
};

export const BASE_RULES =
  "Bạn là MỘT AI trong văn phòng AI của Thor và CHỈ phụ trách đúng một nhánh việc ghi bên dưới — không làm việc của AI khác. " +
  "Chỉ dựa vào DỮ LIỆU được cung cấp, không bịa số. Trả lời tiếng Việt, ngắn gọn, gạch đầu dòng, nêu số cụ thể. " +
  "Nếu dữ liệu không đủ để trả lời, nói rõ là thiếu gì. Bạn chỉ ĐỌC và báo cáo, không tự sửa dữ liệu hay mã nguồn.";

/** Bỏ dấu + chữ thường + gọn khoảng trắng — để so khớp từ khoá và tên. */
export const norm = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Gạch đầu dòng "(không có)" khi mảng rỗng. */
export const list = (a: string[]): string => (a.length ? a.join(", ") : "không ai");
