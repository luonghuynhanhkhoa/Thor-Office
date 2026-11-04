# Văn phòng AI · Thor

Văn phòng 3D: **mỗi AI lo ĐÚNG MỘT nhánh việc** của Thor (không dồn nhiều việc cho một AI).
Anh gõ yêu cầu → **Chỉ huy** chia việc → các AI chuyên môn làm **song song** → **Báo cáo** gộp kết quả.
Chạy **trên máy anh** (không đưa lên mạng). Dữ liệu Thor chỉ **ĐỌC**, không AI nào ghi được.

## Chạy
Bấm đúp **`CHAY-VAN-PHONG-AI.bat`** (tự mở trình duyệt ở http://localhost:3300), hoặc:
```bash
npm install      # lần đầu
npm run dev -- -p 3300
```

## 7 AI hiện có (mỗi AI một nhánh)
| AI | Nhánh việc duy nhất |
|---|---|
| Chỉ huy | Phân việc & điều phối |
| Đơn hàng | Số đơn, doanh thu theo kênh/ngày |
| Kiểm tra dữ liệu | Đơn thiếu Reader/Saler, giá 0, nghi trùng, lịch hẹn quá giờ |
| QC | Điểm chấm chất lượng của Reader |
| Khiếu nại | Khiếu nại đang mở |
| Giờ trực | Ai đang trực / sắp trực / hết ca hôm nay |
| Báo cáo | Gộp kết quả các AI thành 1 báo cáo |

## 3 chế độ chạy AI (tự chọn, hiện ở góc trên-trái)
1. **Claude API** — đặt `ANTHROPIC_API_KEY` trong `.env.local` (xem `.env.local.example`). Tốn phí theo lượt dùng.
2. **Claude Code** — máy có lệnh `claude` đã đăng nhập: app chạy `claude -p` (không cần khoá API). ⚠️ Nhánh này chưa thử thật vì máy anh chưa cài.
3. **Tự tính** (mặc định hiện nay) — chưa nối AI: mỗi AI tự viết kết quả từ SỐ LIỆU THOR THẬT, không tốn phí. Ép chế độ bằng `AI_RUNNER=api|cli|sim`.
Nếu gọi AI thật bị lỗi, app tự lùi về "tự tính" và ghi chú trong nhật ký công việc.

## Dữ liệu Thor
Khoá đọc lấy từ `../Thor/.env.local` (đổi bằng `THOR_ENV_PATH`). Chỉ GET, chỉ 6 bảng: `orders, staff, qc_reviews, qc_complaints, order_appointments, reader_hours` (`lib/thorData.ts`). Khoá KHÔNG gửi xuống trình duyệt, KHÔNG đưa vào lời nhắc cho AI — AI chỉ nhận số liệu đã tổng hợp.

## Thêm một AI mới
1. `lib/agentsMeta.ts`: thêm id (kiểu `AgentId`) + 1 dòng trong `AGENTS` (tên, nhánh, màu, vị trí bàn).
2. `lib/agentLogic.ts`: thêm mục trong `LOGIC` (lời nhắc riêng, từ khoá, `gather` lấy số liệu, `sim` viết kết quả).
Nhớ giữ nguyên quy tắc: **một AI = một nhánh việc**.

## Kỹ thuật
Next.js 16 (`cacheComponents` bật — route handler dùng `await connection()`, KHÔNG dùng `export const runtime`),
React 19, three + @react-three/fiber + drei (camera trực giao kiểu isometric, kéo chuột để xoay).
Nhãn trên đầu mỗi AI là HTML thường (vị trí chiếu từ 3D mỗi khung hình) — KHÔNG dùng `<Html>` của drei vì lỗi "unmount a root" với React 19.
Trạng thái công việc lưu trong bộ nhớ máy chủ dev (tắt/mở lại là mất) — đủ cho dùng cá nhân.

## Ý định phát triển tiếp (chưa làm)
- Nối AI thật (API hoặc Claude Code) và chỉnh lời nhắc từng AI.
- Thêm AI: Lương (chỉ xem tổng), Giải thích đơn, Soạn lời nhắn…
- Bấm vào AI để giao việc riêng; lưu lịch sử công việc.
