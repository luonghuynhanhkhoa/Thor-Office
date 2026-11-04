import fs from "node:fs";
import path from "node:path";
import type { DeptId } from "@/lib/agentsMeta";

/**
 * Phòng nào đang "cấu hình · chỉnh sửa" (đèn cửa đỏ nhấp nháy + bảng Work in Process).
 * Lưu trong data/maintenance.json để còn nguyên khi khởi động lại; bật/tắt bằng nút 🛠 ở bảng ghi chú
 * hoặc gọi POST /api/maintenance {"dept":"acc","on":true}.
 */
const FILE = path.join(process.cwd(), "data", "maintenance.json");
const VALID = new Set<string>(["hr", "acc", "sale", "reader", "qc", "ctrl", "exec", "hq"]);

export type MaintMap = Partial<Record<DeptId, boolean>>;

export function readMaintenance(): MaintMap {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8")) as Record<string, unknown>;
    const out: MaintMap = {};
    for (const [k, v] of Object.entries(raw)) if (VALID.has(k) && v === true) out[k as DeptId] = true;
    return out;
  } catch {
    return {};
  }
}

export function setMaintenance(dept: string, on: boolean): MaintMap {
  if (!VALID.has(dept)) throw new Error("Phòng không hợp lệ");
  const cur = readMaintenance();
  if (on) cur[dept as DeptId] = true;
  else delete cur[dept as DeptId];
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(cur, null, 2), "utf8");
  return cur;
}
