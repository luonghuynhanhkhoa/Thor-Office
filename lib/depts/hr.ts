import type { Ctx } from "@/lib/thorData";
import { allProfiles, allStaff, authUsers } from "@/lib/queries";
import { BASE_RULES, list, type AgentLogic } from "@/lib/logicTypes";
import { todayKey, vnDateKey } from "@/lib/vn";

/** PHÒNG NHÂN SỰ — Quản lý người dùng · Vận hành ghi nhận đăng nhập. */

// ------------------------------------------------------------ NS · Quản lý
type HrManage = {
  tongTaiKhoan: number;
  theoVaiTro: Record<string, number>;
  kiemNhiem: string[];
  chuaGanNhanSu: string[];
  nhanSuChuaCoTaiKhoan: string[];
  nhieuTaiKhoanCungNhanSu: string[];
  tamNgung: string[];
};

async function gatherHrManage(ctx: Ctx): Promise<HrManage> {
  const [profiles, staff, auth] = await Promise.all([allProfiles(ctx), allStaff(ctx), authUsers(ctx)]);
  const byRole: Record<string, number> = {};
  for (const p of profiles) byRole[p.role] = (byRole[p.role] ?? 0) + 1;

  const used = new Map<string, string[]>();
  for (const p of profiles) {
    for (const sid of [p.staff_id, p.staff_id2]) {
      if (sid) used.set(sid, [...(used.get(sid) ?? []), p.email ?? p.id.slice(0, 6)]);
    }
  }
  const nameOf = new Map(staff.map((s) => [s.id, s.name]));
  const now = Date.now();
  const banned = new Set(auth.filter((u) => u.banned_until && new Date(u.banned_until).getTime() > now).map((u) => u.id));

  return {
    tongTaiKhoan: profiles.length,
    theoVaiTro: byRole,
    kiemNhiem: profiles.filter((p) => p.role2).map((p) => `${p.email} (${p.role}+${p.role2})`),
    chuaGanNhanSu: profiles.filter((p) => p.role !== "admin" && !p.staff_id).map((p) => `${p.email} (${p.role})`),
    nhanSuChuaCoTaiKhoan: staff.filter((s) => !s.archived && !used.has(s.id)).map((s) => `${s.name} (${s.role})`),
    nhieuTaiKhoanCungNhanSu: [...used.entries()]
      .filter(([, emails]) => emails.length > 1)
      .map(([sid, emails]) => `${nameOf.get(sid) ?? "?"}: ${emails.join(", ")}`),
    tamNgung: profiles.filter((p) => banned.has(p.id)).map((p) => p.email ?? p.id),
  };
}

function simHrManage(d: HrManage): string {
  const roles = Object.entries(d.theoVaiTro).map(([r, n]) => `${r} ${n}`).join(" · ");
  const flag = (label: string, a: string[]) =>
    a.length ? `- ⚠️ ${label}: **${a.length}** — ${a.slice(0, 6).join("; ")}` : `- ✅ ${label}: không có`;
  return [
    `**${d.tongTaiKhoan} tài khoản** (${roles}).`,
    `- Tài khoản kiêm 2 vai trò: ${d.kiemNhiem.length ? d.kiemNhiem.join("; ") : "không có"}`,
    flag("Tài khoản chưa gán nhân sự (đăng nhập sẽ không thấy dữ liệu)", d.chuaGanNhanSu),
    flag("Nhân sự đang làm nhưng chưa có tài khoản", d.nhanSuChuaCoTaiKhoan),
    flag("Nhiều tài khoản trỏ cùng một nhân sự", d.nhieuTaiKhoanCungNhanSu),
    d.tamNgung.length ? `- 🔒 Đang tạm ngưng (${d.tamNgung.length}): ${d.tamNgung.join(", ")}` : "- 🔒 Không tài khoản nào bị tạm ngưng",
  ].join("\n");
}

// ------------------------------------------------------------ NS · Vận hành
type HrOps = {
  homNay: string;
  dangNhapHomNay: string[];
  dangNhap7Ngay: number;
  khongDangNhap14Ngay: string[];
  chuaTungDangNhap: string[];
};

async function gatherHrOps(ctx: Ctx): Promise<HrOps> {
  const [profiles, staff, auth] = await Promise.all([allProfiles(ctx), allStaff(ctx), authUsers(ctx)]);
  const staffName = new Map(staff.map((s) => [s.id, s.name]));
  const profOf = new Map(profiles.map((p) => [p.id, p]));
  const label = (id: string, email: string | null) => {
    const p = profOf.get(id);
    const n = p?.staff_id ? staffName.get(p.staff_id) : undefined;
    return n ? `${n}` : (email ?? id.slice(0, 6));
  };
  const today = todayKey();
  const now = Date.now();
  const day = 86400000;
  // Chỉ xét tài khoản còn hoạt động (không tạm ngưng).
  const active = auth.filter((u) => !(u.banned_until && new Date(u.banned_until).getTime() > now));
  return {
    homNay: today,
    dangNhapHomNay: active.filter((u) => u.last_sign_in_at && vnDateKey(u.last_sign_in_at) === today).map((u) => label(u.id, u.email)),
    dangNhap7Ngay: active.filter((u) => u.last_sign_in_at && now - new Date(u.last_sign_in_at).getTime() <= 7 * day).length,
    khongDangNhap14Ngay: active
      .filter((u) => u.last_sign_in_at && now - new Date(u.last_sign_in_at).getTime() > 14 * day)
      .map((u) => `${label(u.id, u.email)} (${vnDateKey(u.last_sign_in_at!)})`),
    chuaTungDangNhap: active.filter((u) => !u.last_sign_in_at).map((u) => label(u.id, u.email)),
  };
}

function simHrOps(d: HrOps): string {
  return [
    `Ghi nhận đăng nhập (tính đến ${d.homNay}):`,
    `- 🟢 Đã đăng nhập hôm nay (${d.dangNhapHomNay.length}): ${list(d.dangNhapHomNay)}`,
    `- Đăng nhập trong 7 ngày qua: **${d.dangNhap7Ngay}** tài khoản`,
    d.khongDangNhap14Ngay.length
      ? `- ⚠️ Hơn 14 ngày không đăng nhập (${d.khongDangNhap14Ngay.length}): ${d.khongDangNhap14Ngay.slice(0, 8).join("; ")}`
      : "- ✅ Không ai bỏ quá 14 ngày không đăng nhập",
    d.chuaTungDangNhap.length
      ? `- ⚠️ Chưa từng đăng nhập (${d.chuaTungDangNhap.length}): ${d.chuaTungDangNhap.join(", ")}`
      : "- ✅ Mọi tài khoản đều từng đăng nhập",
  ].join("\n");
}

export const HR_LOGIC: Record<"hr_manage" | "hr_ops", AgentLogic> = {
  hr_manage: {
    system:
      BASE_RULES +
      " NHÁNH CỦA BẠN (Phòng Nhân Sự · Quản lý): quản lý người dùng — tài khoản, vai trò, gán nhân sự, kiêm vai trò, tạm ngưng.",
    keywords: ["nhan su", "nguoi dung", "tai khoan", "vai tro", "phan quyen", "kiem nhiem", "tam ngung", "user"],
    gather: gatherHrManage,
    sim: simHrManage as AgentLogic["sim"],
  },
  hr_ops: {
    system:
      BASE_RULES +
      " NHÁNH CỦA BẠN (Phòng Nhân Sự · Vận hành): ghi nhận việc đăng nhập của nhân sự — ai đăng nhập hôm nay, ai lâu không vào, ai chưa từng vào.",
    keywords: ["nhan su", "dang nhap", "login", "lau khong vao", "chua dang nhap", "hoat dong"],
    gather: gatherHrOps,
    sim: simHrOps as AgentLogic["sim"],
  },
};
