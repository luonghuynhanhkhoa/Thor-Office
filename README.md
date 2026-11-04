# Văn phòng AI · Thor

Văn phòng 3D mở (kiểu công nghệ tương lai, logo Thỏ): **mỗi AI lo ĐÚNG MỘT nhánh việc** của Thor.
Anh gõ yêu cầu → **Chỉ huy** chia việc → các AI chuyên môn làm **song song** → **Báo cáo** gộp kết quả.
Chạy trên máy anh (port 3300), chỉ ĐỌC dữ liệu Thor — không AI nào ghi được.

## Chạy

Nhấp đúp `CHAY-VAN-PHONG-AI.bat` (hoặc `npm run dev -- -p 3300`) rồi mở http://localhost:3300.
Thử nhanh: `?hour=8` (ép giờ trong ngày) và/hoặc `?fast=1` (AI đi lại nhanh gấp 3), ví dụ `http://localhost:3300/?hour=16&fast=1`.

## Tổ chức: 7 phòng ban + Tổng hành dinh (16 AI)

| Phòng | AI Quản lý (bàn trái) | AI Vận hành (bàn phải) |
|---|---|---|
| Nhân Sự | người dùng, phân quyền | ghi nhận đăng nhập |
| Kế Toán | lương & chi tiêu | kiểm tra công thức lương |
| Sale | khách đã nhập đơn | việc tồn của Sale |
| Reader | đơn của Reader | giờ trực & lịch hẹn |
| QC | đơn QC & điểm chấm | việc của QC & khiếu nại |
| Trung Tâm Kiểm Soát | lỗi mã, bố cục, tối ưu | kiểm tra vận hành & dọn rác |
| Điều Hành | tính năng & cài đặt Admin | menu, trang, "Có gì mới" |
| Tổng Hành Dinh | Chỉ huy (phân việc) | Báo cáo (gộp kết quả) |

- Mỗi phòng là một không gian riêng: vách sau có **Tivi** hiện số liệu thật của phòng (`/api/tv`, làm mới mỗi phút; bấm Tivi để xem phóng to và giao phòng làm báo cáo chi tiết), vách kính bên trái, mở ra lối đi.
- **Cửa quẹt thẻ** ở mép nam mỗi phòng + **đèn trước cửa**: 🟢 xanh = rảnh · 🟠 cam = đang nhận việc · 🔴 đỏ nhấp nháy = đang cấu hình/chỉnh sửa (cửa kính đóng, bảng **WORK IN PROCESS**, AI trong phòng ở lại bàn). Bật/tắt bằng nút 🛠 trong bảng ghi chú, hoặc `POST /api/maintenance {"dept":"acc","on":true}` (lưu ở `data/maintenance.json`, không commit).
- Hàng dưới là 4 **phòng nghỉ**: Trà · Ăn · Gym · Nghỉ. AI rảnh tự đi lại (giờ VN: sáng cà phê/ăn sáng, trưa ăn rồi nghỉ, chiều tập gym) và về bàn ngay khi có việc.
- Bên trái có **ghi chú màu** theo phòng ban/nhiệm vụ + ý nghĩa đèn cửa; trong cảnh không có nhãn tên phòng hay nhãn từng AI cho đỡ rối. Bấm từng AI = xem việc của AI đó.

## 3 chế độ chạy AI (hiện ở góc trên-trái)

`api` (có `ANTHROPIC_API_KEY`) · `cli` (`claude -p`, cần cài Claude Code + đăng nhập) · `sim` (mặc định: AI tự tính từ dữ liệu thật của Thor, chưa nối AI).
Biến môi trường: `AI_RUNNER`, `ANTHROPIC_MODEL`, `THOR_ENV_PATH` (xem `.env.local.example`).

## Dữ liệu Thor

`lib/thorData.ts` đọc Supabase của Thor bằng khoá service (từ `../Thor/.env.local`), chỉ GET, danh sách bảng cho phép.
`lib/thorFiles.ts` đọc mã nguồn/git của các kho trong thư mục M. `lib/queries.ts` có bản chép công thức lương (`MIRROR`) — **phải đồng bộ khi Thor đổi công thức** (Kế Toán · Vận hành tự cảnh báo nếu lệch).

## Thêm AI / phòng mới

1. `lib/agentsMeta.ts`: thêm id vào `AgentId`/`DeptId` + dòng trong `AGENTS`/`DEPTS` (đặt toạ độ phòng cùng hàng); thêm id vào `VALID` ở `lib/maintenance.ts`.
2. `lib/depts/<phong>.ts`: viết `gather` (lấy dữ liệu), `sim` (kết quả tự tính), lời nhắc hệ thống; gắn vào `lib/agentLogic.ts`.
3. Số liệu Tivi: thêm dòng cho phòng trong `lib/tv.ts`.

## Kỹ thuật

Next 16 (`cacheComponents`: không dùng `export const runtime`, route GET gọi `await connection()`), React 19, three + @react-three/fiber v9 + drei (camera trực giao). Không dùng drei `<Html>` (lỗi unmount root với React 19).
Mặt bằng + đường đi của AI: `lib/layout.ts` (phòng nghỉ, chỗ ngồi/đứng, lối đi, chọn phòng theo giờ). Cảnh 3D: `components/Office3D.tsx`.
Logo: `node scripts/make-logo.cjs` (cắt từ `../Thor/logo-tho.jpg`).

## Ý định phát triển tiếp (chưa làm)

Nối AI thật (API key hoặc Claude Code) · lưu lịch sử công việc ra file (hiện mất khi khởi động lại) · cho AI hành động ghi (hiện chỉ đọc).
