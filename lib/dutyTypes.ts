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
};
