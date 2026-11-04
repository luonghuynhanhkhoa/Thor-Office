/** Nhân viên thật (Reader/Saler) và tình trạng trực hôm nay — dùng chung server + trình duyệt. */
export type DutyState = "on" | "soon" | "break";

export type DutyStaff = {
  id: string;
  name: string;
  role: "reader" | "saler";
  /** on = đang trong giờ trực · break = đang trong ca nhưng nghỉ giữa ca · soon = hôm nay có ca nhưng chưa tới giờ. */
  state: DutyState;
  from?: string;
  to?: string;
  /** Số thứ tự cố định trong toàn bộ danh sách Reader+Saler đang làm → mỗi người một màu riêng. */
  idx: number;
};

const SKINS = ["#f1c9a5", "#e8b894", "#d9a47a", "#c68c63", "#f5d6bb"];
const HAIRS = ["#2b2118", "#4a3222", "#1a1a1a", "#6b3f1d", "#3b2a4a", "#7a4a2a", "#8a8a8a"];

/** Màu áo riêng cho từng người (góc màu vàng-kim 137,5° nên các số thứ tự gần nhau vẫn khác hẳn nhau). */
export function staffLook(idx: number): { shirt: string; skin: string; hair: string } {
  const hue = Math.round((idx * 137.508) % 360);
  const light = [50, 42, 58][idx % 3];
  return { shirt: `hsl(${hue}, 72%, ${light}%)`, skin: SKINS[idx % SKINS.length], hair: HAIRS[(idx * 3 + 1) % HAIRS.length] };
}
