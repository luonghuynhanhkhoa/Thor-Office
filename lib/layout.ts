import { DEPT_BY_ID, type AgentMeta } from "@/lib/agentsMeta";

/**
 * Mặt bằng văn phòng (an toàn cho trình duyệt): kích thước phòng, các phòng nghỉ (trà/ăn/gym/nghỉ),
 * chỗ AI đứng/ngồi trong từng phòng, lối đi, và hàm dựng đường đi từ bàn làm việc tới chỗ nghỉ.
 *
 * Hệ trục: x sang phải, z hướng về phía camera. Hàng 1 (phòng ban) z=-5.5, hàng 2 z=5.5, hàng phòng nghỉ z=13.5.
 * Lối đi: LANE_M (z=0, giữa hai hàng phòng ban) · LANE_S (z=9.5, trước hàng phòng nghỉ) · hành lang dọc x = -7 / 0 / 7.
 */
export const ROOM_W = 6.0;
export const ROOM_D = 5.0;
export const LANE_M = 0;
export const LANE_S = 9.5;
export const CORRIDORS = [-7, 0, 7];
export const LOUNGE_Z = 13.5;

export type LoungeId = "tea" | "dining" | "gym" | "rest";
export type Pose = "sip" | "eat" | "run" | "lift" | "nap";

export type Spot = {
  /** Toạ độ so với tâm phòng. */
  x: number;
  z: number;
  /** Hướng nhìn (xoay quanh trục y; 0 = nhìn về +z). */
  face: number;
  pose: Pose;
  sit: boolean;
  /** Điểm trung gian (toạ độ phòng) để đi vòng qua đồ đạc. */
  via?: [number, number][];
};

export type LoungeMeta = {
  id: LoungeId;
  name: string;
  scope: string;
  color: string;
  center: [number, number];
  spots: Spot[];
};

const PI = Math.PI;

export const LOUNGES: LoungeMeta[] = [
  {
    id: "tea",
    name: "Phòng Trà",
    scope: "Cà phê, trà, trò chuyện",
    color: "#2dd4bf",
    center: [-10.5, LOUNGE_Z],
    spots: [
      { x: -1.8, z: -0.9, face: -PI / 2, pose: "sip", sit: false },
      { x: -1.8, z: 0.9, face: -PI / 2, pose: "sip", sit: false, via: [[-1.1, -0.2]] },
      { x: 2.0, z: -0.7, face: -PI / 2, pose: "sip", sit: true, via: [[2.0, -1.7]] },
      { x: 2.0, z: 0.9, face: -PI / 2, pose: "sip", sit: true, via: [[2.0, -1.7], [2.7, 0.1]] },
    ],
  },
  {
    id: "dining",
    name: "Phòng Ăn",
    scope: "Ăn sáng, ăn trưa",
    color: "#fb7185",
    center: [-3.5, LOUNGE_Z],
    spots: [
      { x: -0.9, z: -0.95, face: 0, pose: "eat", sit: true },
      { x: 0.9, z: -0.95, face: 0, pose: "eat", sit: true },
      { x: -0.9, z: 1.05, face: PI, pose: "eat", sit: true, via: [[-2.1, -1.5], [-2.1, 1.05]] },
      { x: 0.9, z: 1.05, face: PI, pose: "eat", sit: true, via: [[2.1, -1.5], [2.1, 1.05]] },
    ],
  },
  {
    id: "gym",
    name: "Phòng Gym",
    scope: "Chạy bộ, tập tạ",
    color: "#60a5fa",
    center: [3.5, LOUNGE_Z],
    spots: [
      { x: -2.0, z: 0.1, face: PI, pose: "run", sit: false, via: [[0.1, 1.3], [-2.0, 1.3]] },
      { x: -0.9, z: 0.1, face: PI, pose: "run", sit: false, via: [[0.1, 1.3]] },
      { x: 1.9, z: -0.8, face: PI / 2, pose: "lift", sit: false },
      { x: 1.9, z: 0.8, face: PI / 2, pose: "lift", sit: false, via: [[1.2, 0]] },
    ],
  },
  {
    id: "rest",
    name: "Phòng Nghỉ",
    scope: "Nghỉ ngơi, chợp mắt",
    color: "#818cf8",
    center: [10.5, LOUNGE_Z],
    spots: [
      { x: -2.2, z: -1.75, face: 0, pose: "nap", sit: true, via: [[-2.2, -1.0]] },
      { x: -1.5, z: -1.75, face: 0, pose: "nap", sit: true, via: [[-1.5, -1.0]] },
      { x: 1.5, z: -1.75, face: 0, pose: "nap", sit: true, via: [[1.5, -1.0]] },
      { x: 2.2, z: -1.75, face: 0, pose: "nap", sit: true, via: [[2.2, -1.0]] },
    ],
  },
];

export const LOUNGE_BY_ID = Object.fromEntries(LOUNGES.map((l) => [l.id, l])) as Record<LoungeId, LoungeMeta>;

/** Giờ hiện tại theo giờ Việt Nam (0–23, có phần lẻ). Có thể ép bằng ?hour=… để thử. */
export function vnHour(override?: number | null): number {
  if (override !== null && override !== undefined && Number.isFinite(override)) return override;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h + m / 60;
}

/** Chọn phòng nghỉ theo giờ trong ngày: sáng cà phê/ăn sáng, trưa ăn rồi nghỉ, chiều tập gym. */
export function pickLounge(hour: number, rand: () => number): LoungeId {
  const w: Record<LoungeId, number> =
    hour < 6 || hour >= 21
      ? { tea: 1, dining: 0, gym: 0, rest: 3 }
      : hour < 9
        ? { tea: 3, dining: 3, gym: 0.5, rest: 0 }
        : hour < 11
          ? { tea: 3, dining: 0.5, gym: 1, rest: 0.5 }
          : hour < 13
            ? { tea: 1, dining: 4, gym: 0, rest: 2 }
            : hour < 15
              ? { tea: 2, dining: 0.5, gym: 0, rest: 4 }
              : hour < 18
                ? { tea: 2, dining: 0, gym: 4, rest: 0.5 }
                : { tea: 1, dining: 2, gym: 2, rest: 1 };
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (const id of Object.keys(w) as LoungeId[]) {
    r -= w[id];
    if (r <= 0) return id;
  }
  return "tea";
}

export function activityText(lounge: LoungeId, hour: number): string {
  if (lounge === "tea") return hour < 11 ? "☕ cà phê" : "🍵 uống trà";
  if (lounge === "dining") return hour < 10 ? "🥐 ăn sáng" : hour < 15 ? "🍱 ăn trưa" : "🍽️ ăn nhẹ";
  if (lounge === "gym") return "🏋️ tập gym";
  return "💤 nghỉ ngơi";
}

export type Route = { pts: [number, number][]; cum: number[]; total: number };

/** Đường đi từ ghế ngồi → cửa phòng → lối đi → cửa phòng nghỉ → chỗ đứng/ngồi. */
export function buildRoute(meta: AgentMeta, lounge: LoungeMeta, spot: Spot): Route {
  const [px, pz] = meta.pos;
  const dept = DEPT_BY_ID[meta.dept];
  const row1 = dept.center[1] < 0;
  const doorZ = dept.center[1] + ROOM_D / 2 + 0.45; // cửa mở về phía nam của phòng
  const [lx, lz] = lounge.center;
  const dx = dept.center[0]; // cửa phòng nằm giữa mép nam → ai cũng đi qua giữa cửa
  const pts: [number, number][] = [
    [px, pz + 0.95],
    [px, pz + 1.9],
    [dx, pz + 1.9],
    [dx, doorZ],
  ];
  if (row1) {
    pts.push([dx, LANE_M]);
    const corr = CORRIDORS.reduce((best, c) => (Math.abs(c - lx) < Math.abs(best - lx) ? c : best), CORRIDORS[0]);
    pts.push([corr, LANE_M], [corr, LANE_S]);
  } else {
    pts.push([dx, LANE_S]);
  }
  pts.push([lx, LANE_S], [lx, lz - ROOM_D / 2 - 0.3], [lx, lz - 1.9]);
  for (const [vx, vz] of spot.via ?? []) pts.push([lx + vx, lz + vz]);
  pts.push([lx + spot.x, lz + spot.z]);

  // bỏ điểm trùng liên tiếp rồi tính độ dài cộng dồn
  const clean = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.01);
  const cum = [0];
  for (let i = 1; i < clean.length; i++) cum.push(cum[i - 1] + Math.hypot(clean[i][0] - clean[i - 1][0], clean[i][1] - clean[i - 1][1]));
  return { pts: clean, cum, total: cum[cum.length - 1] };
}

/** Điểm + hướng đi tại quãng đường s dọc theo tuyến. */
export function pointAt(route: Route, s: number): { x: number; z: number; dx: number; dz: number } {
  const { pts, cum } = route;
  const d = Math.max(0, Math.min(route.total, s));
  let i = 1;
  while (i < pts.length - 1 && cum[i] < d) i++;
  const a = pts[i - 1];
  const b = pts[i];
  const seg = cum[i] - cum[i - 1] || 1;
  const t = (d - cum[i - 1]) / seg;
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, dx: b[0] - a[0], dz: b[1] - a[1] };
}
