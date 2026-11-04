/**
 * Cấu trúc văn phòng AI — phần AN TOÀN cho trình duyệt (tên, nhánh việc, màu, vị trí).
 * Phần chạy thật (đọc dữ liệu, lời nhắc) nằm ở lib/agentLogic.ts + lib/depts/* (chỉ server).
 *
 * TỔ CHỨC: 7 PHÒNG BAN + Tổng hành dinh. Mỗi phòng có 2 AI — "Quản lý" và "Vận hành" —
 * và MỖI AI CHỈ LO ĐÚNG MỘT nhánh việc (không dồn nhiều việc cho một AI).
 * Muốn thêm AI/phòng: thêm id + dòng trong AGENTS/DEPTS ở đây, rồi thêm logic ở lib/depts/*.
 */
export type DeptId =
  | "hr"
  | "acc"
  | "sale"
  | "reader"
  | "qc"
  | "ctrl"
  | "exec"
  | "hq";

export type AgentId =
  | "commander"
  | "reporter"
  | "hr_manage"
  | "hr_ops"
  | "acc_manage"
  | "acc_ops"
  | "sale_manage"
  | "sale_ops"
  | "reader_manage"
  | "reader_ops"
  | "qc_manage"
  | "qc_ops"
  | "ctrl_code"
  | "ctrl_ops"
  | "exec_features"
  | "exec_ui";

export type DeptMeta = {
  id: DeptId;
  name: string;
  /** Mô tả ngắn phạm vi phòng (hiện ở bảng bên phải). */
  scope: string;
  color: string;
  /** Tâm phòng trên mặt sàn [x, z]. */
  center: [number, number];
  /** Kích thước nền phòng [rộng, sâu]. */
  size: [number, number];
};

/**
 * MẶT BẰNG: mỗi phòng là một khu RIÊNG, cách nhau bằng lối đi/sân cây (không liền kề).
 * Hàng trên cùng: Điều Hành · (Phòng Họp ở giữa) · Trung Tâm Kiểm Soát. Giữa: Nhân Sự · Tổng Hành Dinh (đặc biệt, giữa sân) · Kế Toán.
 * Dưới: Sale · QC · Reader. Dưới cùng: quán Trà & Ăn · Gym. Phòng nghỉ + Phòng họp: xem lib/layout.ts.
 */
export const DEPTS: DeptMeta[] = [
  { id: "hr", name: "Phòng Nhân Sự", scope: "Quản lý người dùng · ghi nhận đăng nhập", color: "#38bdf8", center: [-15, -3], size: [6, 5] },
  { id: "acc", name: "Phòng Kế Toán", scope: "Quản lý lương · kiểm tra công thức & chi tiêu", color: "#facc15", center: [15, -3], size: [6, 5] },
  { id: "sale", name: "Phòng Sale", scope: "Quản lý khách đã nhập đơn · vận hành Sale", color: "#fb923c", center: [-11, 8], size: [6, 5] },
  { id: "reader", name: "Phòng Reader", scope: "Quản lý đơn Reader · vận hành Reader", color: "#34d399", center: [11, 8], size: [6, 5] },
  { id: "qc", name: "Phòng QC", scope: "Quản lý đơn QC · vận hành QC", color: "#a3e635", center: [0, 10], size: [6, 5] },
  { id: "ctrl", name: "Trung Tâm Kiểm Soát", scope: "Rà soát lỗi · bố cục · tối ưu · dọn rác", color: "#f472b6", center: [11, -12], size: [6, 5] },
  { id: "exec", name: "Phòng Điều Hành", scope: "Giao diện & tính năng của Admin", color: "#c084fc", center: [-11, -12], size: [6, 5] },
  { id: "hq", name: "Tổng Hành Dinh", scope: "Chỉ huy chia việc · Báo cáo gộp kết quả", color: "#fbbf24", center: [0, 0], size: [8, 7] },
];

export const DEPT_BY_ID: Record<DeptId, DeptMeta> = Object.fromEntries(
  DEPTS.map((d) => [d.id, d])
) as Record<DeptId, DeptMeta>;

export type AgentMeta = {
  id: AgentId;
  dept: DeptId;
  name: string;
  /** Nhánh việc DUY NHẤT của AI này. */
  branch: string;
  /** Vị trí bàn trên mặt sàn [x, z]. */
  pos: [number, number];
  /** Màu áo + màu nhãn = màu phòng. */
  color: string;
};

const seat = (dept: DeptId, side: -1 | 1): [number, number] => {
  const [cx, cz] = DEPT_BY_ID[dept].center;
  // Tổng Hành Dinh rộng hơn: bàn dời về phía sau để phía trước có chỗ cho logo Thỏ trên sàn.
  return [cx + side * 1.45, dept === "hq" ? cz - 1.1 : cz];
};

function a(id: AgentId, dept: DeptId, name: string, branch: string, side: -1 | 1): AgentMeta {
  return { id, dept, name, branch, pos: seat(dept, side), color: DEPT_BY_ID[dept].color };
}

export const AGENTS: AgentMeta[] = [
  a("commander", "hq", "Chỉ huy", "Phân việc & điều phối", -1),
  a("reporter", "hq", "Báo cáo", "Gộp kết quả thành báo cáo", 1),
  a("hr_manage", "hr", "NS · Quản lý", "Người dùng & phân quyền", -1),
  a("hr_ops", "hr", "NS · Vận hành", "Ghi nhận đăng nhập", 1),
  a("acc_manage", "acc", "KT · Quản lý", "Lương & chi tiêu", -1),
  a("acc_ops", "acc", "KT · Vận hành", "Kiểm tra công thức lương", 1),
  a("sale_manage", "sale", "Sale · Quản lý", "Khách đã nhập đơn", -1),
  a("sale_ops", "sale", "Sale · Vận hành", "Việc tồn của Sale", 1),
  a("reader_manage", "reader", "Reader · Quản lý", "Đơn của Reader", -1),
  a("reader_ops", "reader", "Reader · Vận hành", "Giờ trực & lịch hẹn", 1),
  a("qc_manage", "qc", "QC · Quản lý", "Đơn QC & điểm chấm", -1),
  a("qc_ops", "qc", "QC · Vận hành", "Việc của QC & khiếu nại", 1),
  a("ctrl_code", "ctrl", "KS · Rà soát", "Lỗi mã, bố cục, tối ưu", -1),
  a("ctrl_ops", "ctrl", "KS · Vận hành", "Kiểm tra vận hành & dọn rác", 1),
  a("exec_features", "exec", "ĐH · Tính năng", "Tính năng & cài đặt Admin", -1),
  a("exec_ui", "exec", "ĐH · Giao diện", "Menu, trang, Có gì mới", 1),
];

export const AGENT_BY_ID: Record<AgentId, AgentMeta> = Object.fromEntries(
  AGENTS.map((x) => [x.id, x])
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
