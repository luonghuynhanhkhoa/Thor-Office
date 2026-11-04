/**
 * Chat trong văn phòng: "thế giới" (ai cũng thấy) và "riêng" (chỉ 2 người trong cuộc + Admin thấy).
 * Tin nhắn đi QUA MÁY CHỦ (không gửi thẳng từ trình duyệt) → tên người gửi do máy chủ đóng dấu, không giả mạo được;
 * kênh nhận là mã HMAC khó đoán, mỗi người chỉ biết kênh của mình (Admin biết thêm kênh "giám sát").
 * Tin không lưu lại: chỉ người đang mở văn phòng lúc đó mới nhận.
 */
export type ChatMsg = {
  id: string;
  t: number;
  /** true = chat thế giới (mọi người thấy). */
  world: boolean;
  from: { uid: string; name: string };
  /** Chat riêng: người nhận. */
  to?: { uid: string; name: string };
  text: string;
};

/** Tên 3 kênh nhận của một người (đã băm). `admin` chỉ có với Admin. */
export type ChatChannels = { world: string; inbox: string; admin?: string };

export const CHAT_MAX_TEXT = 400;
export const CHAT_EVENT = "msg";
