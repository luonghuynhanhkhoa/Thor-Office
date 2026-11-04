# Đưa Văn phòng AI lên mạng (Vercel) — như app Thor

App đọc doanh thu / tên nhân viên của Thor nên bản trên mạng **bắt buộc đăng nhập bằng tài khoản Thor** (email + mật khẩu Thor). Quên cấu hình khoá → app **tự khoá hẳn**, không bao giờ mở công khai.

## Quyền
- **Admin** (bang chủ): xem được mọi thứ (Tivi, bảng, người khác, hỏi mọi câu hỏi, bật/tắt phòng chỉnh sửa).
- **Reader / Saler / QC**: chỉ thấy thông tin chính của **chính mình**. Bấm Tivi/bảng/người khác → "🔒 Yêu Cầu Quyền Truy Cập"; hỏi về người khác/phòng khác/tổng quan → bị từ chối. Quyền do máy chủ kiểm ở từng API (không chỉ ẩn nút).
- Ai cũng dùng được: nhìn văn phòng 3D (tên + trạng thái nhân vật), chọc/đấm/gửi icon, gọi họp.

## Biến môi trường trên Vercel (project `thor-office` → Settings → Environment Variables)

| Tên biến | Bắt buộc | Giá trị |
|---|---|---|
| `THOR_SUPABASE_URL` | ✅ | `https://uqyrosnjgiuqspnypzyl.supabase.co` |
| `THOR_SUPABASE_SERVICE_KEY` | ✅ | khoá **Secret** (`sb_secret_…`) — Supabase → Settings → API Keys → *Secret keys* → default. Dùng đọc dữ liệu + ký phiên đăng nhập. |
| `THOR_SUPABASE_PUBLISHABLE_KEY` | ✅ cho gọi họp + chọc/đấm/icon | khoá **Publishable** (`sb_publishable_…`) cùng trang API Keys (khoá công khai, an toàn) |
| `OFFICE_SECRET` | tuỳ chọn | một chuỗi bí mật dài ngẫu nhiên để ký phiên (không đặt thì dùng khoá Secret ở trên). Đổi giá trị = mọi người phải đăng nhập lại. |
| ~~`OFFICE_PASSWORD`~~ | không còn dùng | (mật khẩu chung cũ — xoá được) |

Đổi biến xong phải **Redeploy** (Deployments → ⋯ → Redeploy) hoặc push một commit mới.

## Đăng nhập
Mở https://thor-office.vercel.app → nhập **email + mật khẩu tài khoản Thor** của mình. Tài khoản phải có hồ sơ trong Thor; vai trò lấy từ Thor (`profiles.role`, người kiêm 2 vai trò dùng cả 2 mã nhân sự).

## Gọi họp (audio/video) + chọc/đấm/icon
- Dùng **kênh thời gian thực của Supabase** (cùng dự án Thor, không tốn thêm dịch vụ). Tên kênh chứa mã ngẫu nhiên đổi mỗi ngày, chỉ người đã đăng nhập mới biết.
- Gọi họp là **WebRTC nối thẳng giữa các máy** (nhiều người cùng lúc, tốt nhất ≤ 4–5 người). Chỉ dùng máy chủ STUN công cộng của Google; một số mạng công ty/4G khắt khe có thể không nối được (cần máy chủ TURN — chưa gắn). Trình duyệt phải cho phép micro/camera (cần https — bản Vercel có sẵn).
- Bấm **📞 Phòng họp (gọi video)** ở góc trên trái → **Vào phòng họp**.
- Chọc/đấm/icon: bấm vào một nhân vật (hoặc Meo) → các nút 👉 Chọc · 👊 Đấm · 😝 Lêu lêu · 😄 Cười · ❤️ Thả tim; mọi người đang mở văn phòng đều thấy nhân vật phản ứng + bong bóng icon.

## Bản trên mạng khác bản trên máy anh chỗ nào

| | Trên máy anh (localhost:3300, quyền admin chủ máy) | Trên mạng (Vercel) |
|---|---|---|
| Văn phòng 3D, nhân viên trực, Tivi, bảng ca, bán hàng, đèn cửa | ✅ | ✅ (theo quyền) |
| Giao việc cho các AI (số liệu Thor thật) | ✅ | ✅ (người thường chỉ hỏi được về mình) |
| Trung Tâm Kiểm Soát (rà tsc/eslint, git, dọn rác) + Điều Hành · Giao diện (đọc mã Thor) | ✅ | ⚠️ báo "chỉ chạy trên máy anh" |
| Nút 🛠 "đang chỉnh sửa" phòng | ✅ lưu bền | ⚠️ chỉ tạm |
| Nối AI thật (Claude API / Claude Code) | tuỳ chọn | chỉ API |

Muốn thử đăng nhập kiểu người thường trên máy: đặt biến `OFFICE_FORCE_LOGIN=1` và `OFFICE_SECRET=<chuỗi bất kỳ>` rồi chạy.

## Đẩy mã
```bash
cd C:\Users\SsS\Desktop\M\ai-office
git push origin main     # Vercel tự deploy
```
