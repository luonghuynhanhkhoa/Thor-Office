import { DEPTS, DEPT_BY_ID, type AgentMeta } from "@/lib/agentsMeta";

/**
 * Mặt bằng văn phòng (an toàn cho trình duyệt): các khu/phòng nghỉ, chỗ AI đứng/ngồi, đường đi.
 * Hệ trục: x sang phải, z hướng về phía camera (z nhỏ = "phía trên" màn hình).
 * Mỗi khu là một công trình RIÊNG; AI đi giữa các khu bằng đường tự tìm (A*) quanh các công trình.
 */
export const WORLD = { x0: -26.5, x1: 31.5, z0: -17, z1: 25 };

export type LoungeId = "tea" | "dining" | "gym" | "rest" | "meeting";
export type Pose = "sip" | "eat" | "run" | "lift" | "nap" | "meet" | "stretch" | "box" | "type";

export type Spot = {
  /** Toạ độ so với tâm khu. */
  x: number;
  z: number;
  /** Hướng nhìn (xoay quanh trục y; 0 = nhìn về +z). */
  face: number;
  pose: Pose;
  sit: boolean;
  /** Điểm trung gian (toạ độ so với tâm khu) để đi vòng qua đồ đạc. */
  via?: [number, number][];
};

export type LoungeMeta = {
  id: LoungeId;
  name: string;
  scope: string;
  color: string;
  /** Tâm khu dùng để tính chỗ ngồi/đứng (Trà và Ăn dùng chung 1 quán nhưng mỗi khu một tâm). */
  center: [number, number];
  /** Điểm ngoài cửa (nối với đường đi chung) và các điểm bên trong cửa (toạ độ thế giới). */
  mouth: [number, number];
  inside: [number, number][];
  spots: Spot[];
};

const PI = Math.PI;

export const LOUNGES: LoungeMeta[] = [
  {
    id: "tea",
    name: "Quán Trà · Cà phê",
    scope: "Quầy bar cà phê, trà, trò chuyện",
    color: "#2dd4bf",
    center: [-5.5, 19.5],
    mouth: [-10, 15.2],
    inside: [[-10, 17.2]],
    spots: [
      { x: -1.0, z: -1.7, face: PI, pose: "sip", sit: true },
      { x: 1.0, z: -1.7, face: PI, pose: "sip", sit: true },
      { x: -0.85, z: 0.8, face: PI / 2, pose: "sip", sit: true, via: [[-1.5, -0.6]] },
      { x: 0.85, z: 0.8, face: -PI / 2, pose: "sip", sit: true, via: [[0, -0.6]] },
    ],
  },
  {
    id: "dining",
    name: "Quán Ăn",
    scope: "Ăn sáng, ăn trưa",
    color: "#fb7185",
    center: [-14, 19.5],
    mouth: [-10, 15.2],
    inside: [[-10, 17.2]],
    spots: [
      { x: -1.2, z: -1.1, face: 0, pose: "eat", sit: true },
      { x: 1.4, z: -1.1, face: 0, pose: "eat", sit: true },
      { x: -1.2, z: 0.5, face: PI, pose: "eat", sit: true, via: [[0.1, -1.1], [0.1, 0.5]] },
      { x: 1.4, z: 0.5, face: PI, pose: "eat", sit: true, via: [[0.1, -1.1], [0.1, 0.5]] },
    ],
  },
  {
    id: "gym",
    name: "Phòng Gym",
    scope: "Chạy bộ, tập tạ, đấm bốc, yoga",
    color: "#60a5fa",
    center: [10, 19.5],
    mouth: [10, 15.2],
    inside: [[10, 17.2]],
    spots: [
      { x: -5.4, z: -0.2, face: PI, pose: "run", sit: false, via: [[-0.5, 0.9], [-5.4, 0.9]] },
      { x: -4.2, z: -0.2, face: PI, pose: "run", sit: false, via: [[-0.5, 0.9], [-4.2, 0.9]] },
      { x: -3.0, z: -0.2, face: PI, pose: "run", sit: false, via: [[-0.5, 0.9], [-3.0, 0.9]] },
      { x: -1.8, z: -0.2, face: PI, pose: "run", sit: false, via: [[-0.5, 0.9], [-1.8, 0.9]] },
      { x: 2.4, z: -2.0, face: PI, pose: "lift", sit: false },
      { x: 3.9, z: -2.0, face: PI, pose: "lift", sit: false },
      { x: -4.8, z: 1.6, face: 0, pose: "box", sit: false, via: [[-0.5, 0.9], [-4.8, 0.9]] },
      { x: 1.5, z: 1.9, face: 0, pose: "stretch", sit: false, via: [[-0.5, 0.9]] },
    ],
  },
  {
    id: "rest",
    name: "Phòng Nghỉ",
    scope: "Nghỉ ngơi, chợp mắt",
    color: "#818cf8",
    center: [21, 8],
    mouth: [17.2, 8],
    inside: [[19.0, 8]],
    spots: [
      { x: -1.5, z: -1.75, face: 0, pose: "nap", sit: true, via: [[-1.5, -0.8]] },
      { x: -0.5, z: -1.75, face: 0, pose: "nap", sit: true, via: [[-0.5, -0.8]] },
      { x: 1.2, z: -1.75, face: 0, pose: "nap", sit: true, via: [[1.2, -0.8]] },
      { x: 2.2, z: -1.75, face: 0, pose: "nap", sit: true, via: [[2.2, -0.8]] },
    ],
  },
  {
    id: "meeting",
    name: "Phòng Họp",
    scope: "Họp nhóm (máy chiếu, tivi, đồ ăn thức uống)",
    color: "#f59e0b",
    center: [0, -12],
    mouth: [0, -8.2],
    inside: [[0, -9.9]],
    spots: [
      { x: -1.5, z: 1.5, face: PI, pose: "meet", sit: true },
      { x: 0, z: 1.5, face: PI, pose: "meet", sit: true },
      { x: 1.5, z: 1.5, face: PI, pose: "meet", sit: true },
      { x: -1.5, z: -1.3, face: 0, pose: "meet", sit: true, via: [[-3.2, 2.1], [-3.2, -1.3]] },
      { x: 0, z: -1.3, face: 0, pose: "meet", sit: true, via: [[-3.2, 2.1], [-3.2, -1.3]] },
      { x: 1.5, z: -1.3, face: 0, pose: "meet", sit: true, via: [[3.2, 2.1], [3.2, -1.3]] },
      { x: -2.8, z: 0.1, face: PI / 2, pose: "meet", sit: true, via: [[-3.2, 2.1]] },
      { x: 2.8, z: 0.1, face: -PI / 2, pose: "meet", sit: true, via: [[3.2, 2.1]] },
    ],
  },
];

export const LOUNGE_BY_ID = Object.fromEntries(LOUNGES.map((l) => [l.id, l])) as Record<LoungeId, LoungeMeta>;
export const LOUNGE_IDS = LOUNGES.map((l) => l.id);

// ------------------------------------------------------------------ phòng làm việc của Reader / Saler (người thật)
export type StaffRole = "reader" | "saler";
export type Desk = { x: number; z: number; row: 0 | 1 };
export type WorkRoom = {
  id: StaffRole;
  name: string;
  color: string;
  center: [number, number];
  size: [number, number];
  desks: Desk[];
  /** z của lối đi giữa 2 hàng bàn, z đứng lên của hàng bàn dưới. */
  aisleZ: number;
  standZ: number;
};

function makeWorkRoom(id: StaffRole, name: string, color: string, center: [number, number], size: [number, number], cols: number[], rowZ: [number, number], aisle: number, stand: number): WorkRoom {
  const [, cz] = center;
  const desks: Desk[] = [];
  ([0, 1] as const).forEach((row) => cols.forEach((cx) => desks.push({ x: center[0] + cx, z: cz + rowZ[row], row })));
  return { id, name, color, center, size, desks, aisleZ: cz + aisle, standZ: cz + stand };
}

export const WORKROOMS: WorkRoom[] = [
  makeWorkRoom("reader", "Phòng làm việc Reader", "#34d399", [24.8, -12], [12.8, 7], [-5.2, -3.3, -1.4, 1.4, 3.3, 5.2], [-1.7, 1.3], 0.2, 2.95),
  makeWorkRoom("saler", "Phòng làm việc Saler", "#fb923c", [-21, 8], [8.4, 6], [-2.9, -1.0, 1.0, 2.9], [-1.2, 1.4], 0.45, 2.8),
];
export const WORKROOM_BY_ID = Object.fromEntries(WORKROOMS.map((r) => [r.id, r])) as Record<StaffRole, WorkRoom>;

/** Các điểm ngoài trời để nhân viên chưa tới giờ trực đi dạo quanh công ty. */
export const WANDER_POINTS: [number, number][] = [
  [-6, -7.5], [6, -7.5], [-18, -7.5], [20, -6], [0, 5.8], [-6, 2], [6, 2], [-6, 11], [6, 11], [-19, 2],
  [18.5, 2.5], [27, 3], [-6, 14.5], [6, 14.5], [-17, 14.5], [18, 14.5], [27, 14], [-24, -4], [-17.5, -12], [16.2, -12],
];

/** Các công trình (tâm x, tâm z, rộng, sâu) — chướng ngại khi tìm đường ngoài trời. */
export const BUILDINGS: [number, number, number, number][] = [
  ...DEPTS.map((d) => [d.center[0], d.center[1], d.size[0], d.size[1]] as [number, number, number, number]),
  ...WORKROOMS.map((r) => [r.center[0], r.center[1], r.size[0], r.size[1]] as [number, number, number, number]),
  [-10, 19.5, 16, 7], // quán Trà & Ăn
  [10, 19.5, 12, 7], // gym
  [21, 8, 6, 5], // phòng nghỉ
  [0, -12, 7, 6], // phòng họp
];

/** Giờ hiện tại theo giờ Việt Nam (0–23, có phần lẻ). Có thể ép bằng ?hour=… để thử. */
export function vnHour(override?: number | null): number {
  if (override !== null && override !== undefined && Number.isFinite(override)) return override;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h + m / 60;
}

/** Chọn nơi đến theo giờ: sáng cà phê/ăn sáng, họp đầu ngày, trưa ăn rồi nghỉ, chiều họp nhanh + tập gym. */
export function pickLounge(hour: number, rand: () => number): LoungeId {
  const w: Record<LoungeId, number> =
    hour < 6 || hour >= 21
      ? { tea: 1, dining: 0, gym: 0, rest: 3, meeting: 0 }
      : hour < 9
        ? { tea: 3, dining: 3, gym: 0.5, rest: 0, meeting: 0.3 }
        : hour < 10.5
          ? { tea: 2, dining: 0.3, gym: 0.5, rest: 0.3, meeting: 4 }
          : hour < 11.5
            ? { tea: 3, dining: 0.5, gym: 1, rest: 0.5, meeting: 0.6 }
            : hour < 13
              ? { tea: 1, dining: 4, gym: 0, rest: 2, meeting: 0.2 }
              : hour < 14
                ? { tea: 2, dining: 0.5, gym: 0, rest: 4, meeting: 0.2 }
                : hour < 15.5
                  ? { tea: 2, dining: 0.5, gym: 0.5, rest: 1.5, meeting: 4 }
                  : hour < 18
                    ? { tea: 2, dining: 0, gym: 4, rest: 0.5, meeting: 0.5 }
                    : { tea: 1, dining: 2, gym: 2, rest: 1, meeting: 0.2 };
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (const id of LOUNGE_IDS) {
    r -= w[id];
    if (r <= 0) return id;
  }
  return "tea";
}

export function activityText(lounge: LoungeId, hour: number): string {
  if (lounge === "tea") return hour < 11 ? "☕ cà phê" : "🍵 uống trà";
  if (lounge === "dining") return hour < 10 ? "🥐 ăn sáng" : hour < 15 ? "🍱 ăn trưa" : "🍽️ ăn nhẹ";
  if (lounge === "gym") return "🏋️ tập gym";
  if (lounge === "meeting") return "📋 họp nhóm";
  return "💤 nghỉ ngơi";
}

// ------------------------------------------------------------------ tìm đường (A*) quanh các công trình
const CELL = 0.5;
const NX = Math.ceil((WORLD.x1 - WORLD.x0) / CELL);
const NZ = Math.ceil((WORLD.z1 - WORLD.z0) / CELL);
let blocked: Uint8Array | null = null;

function grid(): Uint8Array {
  if (blocked) return blocked;
  const g = new Uint8Array(NX * NZ);
  const m = 0.3;
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const x = WORLD.x0 + (i + 0.5) * CELL;
      const z = WORLD.z0 + (j + 0.5) * CELL;
      for (const [cx, cz, w, d] of BUILDINGS) {
        if (Math.abs(x - cx) < w / 2 + m && Math.abs(z - cz) < d / 2 + m) {
          g[j * NX + i] = 1;
          break;
        }
      }
    }
  }
  blocked = g;
  return g;
}

const toCell = (x: number, z: number): [number, number] => [
  Math.max(0, Math.min(NX - 1, Math.floor((x - WORLD.x0) / CELL))),
  Math.max(0, Math.min(NZ - 1, Math.floor((z - WORLD.z0) / CELL))),
];

function nearestFree(g: Uint8Array, i: number, j: number): [number, number] {
  if (!g[j * NX + i]) return [i, j];
  for (let r = 1; r < 12; r++) {
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        const a = i + di;
        const b = j + dj;
        if (a >= 0 && b >= 0 && a < NX && b < NZ && !g[b * NX + a]) return [a, b];
      }
    }
  }
  return [i, j];
}

function lineClear(g: Uint8Array, a: [number, number], b: [number, number]): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.2));
  for (let k = 0; k <= n; k++) {
    const [i, j] = toCell(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n);
    if (g[j * NX + i]) return false;
  }
  return true;
}

/** Đường đi ngoài trời từ a tới b (tránh công trình), rút gọn thành ít điểm gãy. */
export function findPath(a: [number, number], b: [number, number]): [number, number][] {
  const g = grid();
  const [si, sj] = nearestFree(g, ...toCell(a[0], a[1]));
  const [ti, tj] = nearestFree(g, ...toCell(b[0], b[1]));
  const key = (i: number, j: number) => j * NX + i;
  const gScore = new Float32Array(NX * NZ).fill(Infinity);
  const from = new Int32Array(NX * NZ).fill(-1);
  const closed = new Uint8Array(NX * NZ);
  const h = (i: number, j: number) => {
    const dx = Math.abs(i - ti);
    const dz = Math.abs(j - tj);
    return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz);
  };
  const open: { k: number; f: number }[] = [];
  const push = (k: number, f: number) => {
    open.push({ k, f });
    let c = open.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (open[p].f <= open[c].f) break;
      [open[p], open[c]] = [open[c], open[p]];
      c = p;
    }
  };
  const pop = () => {
    const top = open[0];
    const last = open.pop()!;
    if (open.length) {
      open[0] = last;
      let c = 0;
      for (;;) {
        const l = c * 2 + 1;
        const r = l + 1;
        let m = c;
        if (l < open.length && open[l].f < open[m].f) m = l;
        if (r < open.length && open[r].f < open[m].f) m = r;
        if (m === c) break;
        [open[m], open[c]] = [open[c], open[m]];
        c = m;
      }
    }
    return top;
  };
  gScore[key(si, sj)] = 0;
  push(key(si, sj), h(si, sj));
  let found = false;
  while (open.length) {
    const { k } = pop();
    if (closed[k]) continue;
    closed[k] = 1;
    const ci = k % NX;
    const cj = (k - ci) / NX;
    if (ci === ti && cj === tj) {
      found = true;
      break;
    }
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di;
        const nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ || g[key(ni, nj)] || closed[key(ni, nj)]) continue;
        if (di && dj && (g[key(ci + di, cj)] || g[key(ci, cj + dj)])) continue; // không cắt góc
        const ng = gScore[k] + (di && dj ? 1.4142 : 1);
        if (ng < gScore[key(ni, nj)]) {
          gScore[key(ni, nj)] = ng;
          from[key(ni, nj)] = k;
          push(key(ni, nj), ng + h(ni, nj));
        }
      }
    }
  }
  if (!found) return [a, b];
  const cells: [number, number][] = [];
  for (let k = key(ti, tj); k !== -1; k = from[k]) {
    const i = k % NX;
    cells.push([WORLD.x0 + (i + 0.5) * CELL, WORLD.z0 + ((k - i) / NX + 0.5) * CELL]);
  }
  cells.reverse();
  cells[0] = a;
  cells[cells.length - 1] = b;
  // rút gọn: từ mỗi điểm nhảy tới điểm xa nhất còn nhìn thấy được
  const out: [number, number][] = [cells[0]];
  let at = 0;
  while (at < cells.length - 1) {
    let far = at + 1;
    for (let k = cells.length - 1; k > at + 1; k--) {
      if (lineClear(g, cells[at], cells[k])) {
        far = k;
        break;
      }
    }
    out.push(cells[far]);
    at = far;
  }
  return out;
}

export type Route = { pts: [number, number][]; cum: number[]; total: number };

/** Đường đi từ ghế ngồi → cửa phòng → (tự tìm đường) → cửa khu nghỉ → chỗ đứng/ngồi. */
export function buildRoute(meta: AgentMeta, lounge: LoungeMeta, spot: Spot): Route {
  const [px, pz] = meta.pos;
  const dept = DEPT_BY_ID[meta.dept];
  const [cx, cz] = dept.center;
  const depth = dept.size[1];
  const standZ = pz + 1.9;
  const mouth: [number, number] = [cx, cz + depth / 2 + 0.8];
  const pts: [number, number][] = [
    [px, pz + 0.95],
    [px, standZ],
    [cx, standZ],
    [cx, cz + depth / 2],
    mouth,
  ];
  pts.push(...findPath(mouth, lounge.mouth).slice(1));
  pts.push(...lounge.inside);
  const [lx, lz] = lounge.center;
  for (const [vx, vz] of spot.via ?? []) pts.push([lx + vx, lz + vz]);
  pts.push([lx + spot.x, lz + spot.z]);

  const clean = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.01);
  const cum = [0];
  for (let i = 1; i < clean.length; i++) cum.push(cum[i - 1] + Math.hypot(clean[i][0] - clean[i - 1][0], clean[i][1] - clean[i - 1][1]));
  return { pts: clean, cum, total: cum[cum.length - 1] };
}

// ------------------------------------------------------------------ đường đi của nhân viên thật (Reader/Saler)
export type PlaceNode =
  | { kind: "out"; x: number; z: number }
  | { kind: "lounge"; id: LoungeId; spot: Spot }
  | { kind: "desk"; room: StaffRole; idx: number };

/** Từ ghế ngồi → lối đi giữa hàng bàn → cửa phòng → điểm ngoài cửa. */
export function deskHomePts(room: WorkRoom, idx: number): [number, number][] {
  const d = room.desks[idx];
  const [cx, cz] = room.center;
  const doorZ = cz + room.size[1] / 2;
  const lane = d.row === 0 ? room.aisleZ : room.standZ;
  return [[d.x, d.z + 0.95], [d.x, lane], [cx, lane], [cx, doorZ], [cx, doorZ + 0.8]];
}

export const deskChair = (room: WorkRoom, idx: number): [number, number] => [room.desks[idx].x, room.desks[idx].z + 0.95];

export function nodePos(n: PlaceNode): [number, number] {
  if (n.kind === "out") return [n.x, n.z];
  if (n.kind === "desk") return deskChair(WORKROOM_BY_ID[n.room], n.idx);
  const l = LOUNGE_BY_ID[n.id];
  return [l.center[0] + n.spot.x, l.center[1] + n.spot.z];
}

function loungeEnter(l: LoungeMeta, spot: Spot): [number, number][] {
  return [...l.inside, ...(spot.via ?? []).map(([vx, vz]) => [l.center[0] + vx, l.center[1] + vz] as [number, number]), [l.center[0] + spot.x, l.center[1] + spot.z]];
}

/** Danh sách điểm đi RA khỏi nút (kết thúc ở một điểm ngoài trời). */
function exitList(n: PlaceNode): [number, number][] {
  if (n.kind === "out") return [[n.x, n.z]];
  if (n.kind === "desk") return deskHomePts(WORKROOM_BY_ID[n.room], n.idx);
  const l = LOUNGE_BY_ID[n.id];
  return [...loungeEnter(l, n.spot).reverse(), l.mouth];
}

/** Danh sách điểm đi VÀO nút (bắt đầu từ một điểm ngoài trời). */
function enterList(n: PlaceNode): [number, number][] {
  if (n.kind === "out") return [[n.x, n.z]];
  if (n.kind === "desk") return deskHomePts(WORKROOM_BY_ID[n.room], n.idx).reverse();
  const l = LOUNGE_BY_ID[n.id];
  return [l.mouth, ...loungeEnter(l, n.spot)];
}

/** Tuyến đi từ nút a tới nút b (ra khỏi a → tự tìm đường ngoài trời → vào b). */
export function routeBetween(a: PlaceNode, b: PlaceNode): Route {
  const E = exitList(a);
  const N = enterList(b);
  const mid = findPath(E[E.length - 1], N[0]);
  const pts = [...E, ...mid.slice(1), ...N.slice(1)];
  const clean = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.01);
  if (clean.length < 2) clean.push([clean[0][0] + 0.01, clean[0][1]]);
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
