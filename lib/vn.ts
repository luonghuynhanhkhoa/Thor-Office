/** Tiện ích ngày/giờ theo múi giờ Việt Nam (Asia/Ho_Chi_Minh). */
const TZ = "Asia/Ho_Chi_Minh";

/** YYYY-MM-DD của một mốc thời gian theo giờ VN. */
export function vnDateKey(d: Date | string | number): string {
  return new Date(d).toLocaleDateString("en-CA", { timeZone: TZ });
}

export function todayKey(): string {
  return vnDateKey(Date.now());
}

/** Phút trong ngày (0–1439) hiện tại theo giờ VN. */
export function nowMinutesVN(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

/** Khoảng tháng hiện tại: start (gồm) → end (không gồm), kèm nhãn "MM/YYYY". */
export function monthRangeVN(): { start: string; end: string; label: string } {
  const [y, m] = todayKey().split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return {
    start: `${y}-${pad(m)}-01`,
    end: `${ny}-${pad(nm)}-01`,
    label: `${pad(m)}/${y}`,
  };
}

export function formatVND(n: number): string {
  return `${new Intl.NumberFormat("vi-VN").format(Math.round(n))}đ`;
}

export function hhmmToMin(s: string | null | undefined): number | null {
  if (!s) return null;
  const [h, m] = s.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}
