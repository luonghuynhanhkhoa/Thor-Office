/**
 * Danh sách AI trong văn phòng — phần AN TOÀN cho trình duyệt (tên, nhánh việc, màu,
 * vị trí bàn). Phần chạy thật (đọc dữ liệu, lời nhắc) nằm ở lib/agentLogic.ts (chỉ server).
 *
 * QUY TẮC: mỗi AI CHỈ lo ĐÚNG MỘT nhánh việc — không dồn nhiều việc cho một AI.
 * Muốn thêm AI mới: thêm 1 dòng ở đây + 1 mục tương ứng ở lib/agentLogic.ts.
 */
export type AgentId =
  | "commander"
  | "orders"
  | "data"
  | "qc"
  | "complaints"
  | "duty"
  | "reporter";

export type AgentMeta = {
  id: AgentId;
  name: string;
  /** Nhánh việc DUY NHẤT của AI này (hiện trên nhãn). */
  branch: string;
  /** Màu áo + màu nhãn. */
  color: string;
  /** Vị trí bàn trên mặt sàn [x, z]. */
  pos: [number, number];
};

export const AGENTS: AgentMeta[] = [
  { id: "commander", name: "Chỉ huy", branch: "Phân việc & điều phối", color: "#a855f7", pos: [0, -3.6] },
  { id: "orders", name: "Đơn hàng", branch: "Đơn & doanh thu", color: "#38bdf8", pos: [-4.6, 0] },
  { id: "data", name: "Kiểm tra dữ liệu", branch: "Đơn thiếu / trùng / lỗi", color: "#f59e0b", pos: [0, 0] },
  { id: "qc", name: "QC", branch: "Điểm chấm chất lượng", color: "#34d399", pos: [4.6, 0] },
  { id: "complaints", name: "Khiếu nại", branch: "Khiếu nại đang mở", color: "#fb7185", pos: [-4.6, 3.6] },
  { id: "duty", name: "Giờ trực", branch: "Ai trực hôm nay", color: "#22d3ee", pos: [0, 3.6] },
  { id: "reporter", name: "Báo cáo", branch: "Gộp kết quả thành báo cáo", color: "#f472b6", pos: [4.6, 3.6] },
];

export const AGENT_BY_ID: Record<AgentId, AgentMeta> = Object.fromEntries(
  AGENTS.map((a) => [a.id, a])
) as Record<AgentId, AgentMeta>;

export type AgentStatus = "idle" | "thinking" | "working" | "done" | "error";

export type AgentState = {
  status: AgentStatus;
  /** Việc đang/đã làm (ngắn). */
  task?: string;
  /** Kết quả (khi xong). */
  result?: string;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
};

export type JobPhase = "planning" | "working" | "composing" | "done" | "error";

export type JobLog = { t: number; agent?: AgentId; msg: string };

export type Job = {
  id: string;
  request: string;
  createdAt: number;
  phase: JobPhase;
  /** Chế độ chạy: api | cli | sim. */
  runner: string;
  agents: Record<AgentId, AgentState>;
  plan: { agent: AgentId; task: string }[];
  final?: string;
  log: JobLog[];
};
