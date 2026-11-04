/** Nhân viên thật (Reader/Saler) và tình trạng trực hôm nay — dùng chung server + trình duyệt. */
export type DutyState = "on" | "soon" | "break" | "done";

export type DutyStaff = {
  id: string;
  name: string;
  role: "reader" | "saler";
  /** on = đang trong giờ trực · break = đang trong ca nhưng nghỉ giữa ca · soon = hôm nay có ca nhưng chưa tới giờ · done = đã hết ca (chỉ hiện trên bảng ca, không có nhân vật). */
  state: DutyState;
  from?: string;
  to?: string;
  /** Giờ nghỉ giữa ca (nếu có), vd "nghỉ 12:00–13:00". */
  note?: string;
  /** Số thứ tự cố định trong toàn bộ danh sách Reader+Saler đang làm → mỗi người một màu riêng. */
  idx: number;
};

/** Kết quả bán hàng hôm nay của từng Saler (cho bảng ở phòng làm việc Saler). */
export type SalerSales = {
  id: string;
  name: string;
  /** Số khách khác nhau đã chốt hôm nay. */
  customers: number;
  orders: number;
  revenue: number;
  /** Các gói đã bán (nhiều → ít). */
  packages: { name: string; count: number }[];
};

export type SalesToday = {
  date: string;
  totalRevenue: number;
  totalCustomers: number;
  totalOrders: number;
  salers: SalerSales[];
};

/** Ca (lịch hẹn do Sale gắn) và số đơn hôm nay của từng Reader. */
export type ReaderCases = {
  id: string;
  name: string;
  /** Số đơn hôm nay Sale giao cho Reader này. */
  ordersToday: number;
  /** Giờ các ca còn đang đợi hôm nay (HH:MM, theo thứ tự). */
  waiting: string[];
  /** Số ca hôm nay đã xong. */
  done: number;
  /** Ca đang xử lý: ca đợi sớm nhất đã tới giờ (HH:MM), nếu có. */
  handling: string | null;
};

export type CasesToday = {
  date: string;
  totalOrders: number;
  totalWaiting: number;
  totalDone: number;
  readers: ReaderCases[];
};

/** Tivi/bảng ở phòng làm việc: shift = ca trực Reader · cases = ca đang xử lý của Reader · sales = bán hàng Saler. */
export type BoardKind = "shift" | "cases" | "sales";

export const formatDong = (n: number) => `${new Intl.NumberFormat("vi-VN").format(Math.round(n))}đ`;

const SKINS = ["#f1c9a5", "#e8b894", "#d9a47a", "#c68c63", "#f5d6bb"];
const HAIRS = ["#2b2118", "#4a3222", "#1a1a1a", "#6b3f1d", "#3b2a4a", "#7a4a2a", "#8a8a8a"];

/** Màu áo riêng cho từng người (góc màu vàng-kim 137,5° nên các số thứ tự gần nhau vẫn khác hẳn nhau). */
export function staffLook(idx: number): { shirt: string; skin: string; hair: string } {
  const hue = Math.round((idx * 137.508) % 360);
  const light = [50, 42, 58][idx % 3];
  return { shirt: `hsl(${hue}, 72%, ${light}%)`, skin: SKINS[idx % SKINS.length], hair: HAIRS[(idx * 3 + 1) % HAIRS.length] };
}
