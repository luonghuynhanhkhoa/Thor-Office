# Đưa Văn phòng AI lên mạng (Vercel) — như app Thor

App đọc doanh thu / tên nhân viên của Thor nên bản trên mạng **luôn có mật khẩu**:
- Đặt biến `OFFICE_PASSWORD` → phải nhập mật khẩu mới vào được (nhớ 30 ngày).
- Quên đặt → app **tự khoá hẳn** (không ai vào được) chứ không bao giờ mở công khai.

## Các bước (anh làm trên web, ~5 phút)

1. **Tạo repo GitHub riêng tư (trống)**: https://github.com/new — tên `ai-office`, chọn **Private**, KHÔNG tick thêm README/.gitignore. Rồi nhắn em địa chỉ repo (dạng `https://github.com/luonghuynhanhkhoa/ai-office.git`) để em đẩy mã lên (hoặc tự chạy 2 lệnh ở cuối file này).
2. **Nhập vào Vercel**: https://vercel.com/new → chọn repo `ai-office` → Framework tự nhận **Next.js** → đừng bấm Deploy vội, mở mục **Environment Variables** và thêm 3 biến:

| Tên biến | Giá trị |
|---|---|
| `OFFICE_PASSWORD` | mật khẩu anh tự đặt (đủ dài) |
| `THOR_SUPABASE_URL` | `https://uqyrosnjgiuqspnypzyl.supabase.co` |
| `THOR_SUPABASE_SERVICE_KEY` | khoá **service_role** của Thor: https://supabase.com/dashboard/project/uqyrosnjgiuqspnypzyl/settings/api-keys (mục *service_role* → Reveal → copy). ⚠️ Khoá này rất nhạy cảm — chỉ dán vào Vercel, không gửi cho ai. |

3. Bấm **Deploy**. Xong có địa chỉ dạng `https://ai-office-xxxx.vercel.app` — vào, nhập mật khẩu.
4. (Tuỳ chọn) Đổi/gắn tên miền: Vercel → project → Settings → Domains.

Sau này mỗi lần em sửa app rồi `git push` lên `main` là Vercel tự cập nhật, giống Thor.

## Bản trên mạng khác bản trên máy anh chỗ nào

| | Trên máy anh (localhost:3300) | Trên mạng (Vercel) |
|---|---|---|
| Văn phòng 3D, nhân viên trực, tivi, bảng ca, bán hàng, đèn cửa | ✅ | ✅ |
| Giao việc cho các AI (số liệu Thor thật) | ✅ | ✅ |
| Trung Tâm Kiểm Soát (rà tsc/eslint, git, dọn rác) + Điều Hành · Giao diện (đọc mã Thor) | ✅ | ⚠️ báo "chỉ chạy trên máy anh" (cần mã nguồn Thor trên đĩa) |
| Nút 🛠 "đang chỉnh sửa" phòng | ✅ lưu bền | ⚠️ chỉ tạm (mỗi máy chủ một bản, có thể mất) |
| Nối AI thật (Claude API / Claude Code) | tuỳ chọn | chỉ API (`ANTHROPIC_API_KEY`); Claude Code CLI không có trên Vercel |

## Hai lệnh đẩy mã (nếu anh tự làm)

```bash
cd C:\Users\SsS\Desktop\M\ai-office
git remote add origin https://github.com/luonghuynhanhkhoa/ai-office.git
git push -u origin main
```
