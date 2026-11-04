"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import {
  AGENTS,
  DEPTS,
  type AgentId,
  type AgentMeta,
  type AgentState,
  type AgentStatus,
  type DeptId,
} from "@/lib/agentsMeta";
import {
  LOUNGES,
  LOUNGE_BY_ID,
  LOUNGE_IDS,
  WANDER_POINTS,
  WORKROOMS,
  WORKROOM_BY_ID,
  buildRoute,
  nodePos,
  MEO_SEAT,
  deskChair,
  pickLounge,
  pointAt,
  routeBetween,
  vnHour,
  type LoungeId,
  type PlaceNode,
  type Pose,
  type Route,
  type Spot,
  type StaffRole,
} from "@/lib/layout";
import type { TvData } from "@/lib/tv";
import { staffLook, type BoardKind, type CasesToday, type DutyStaff, type SalesToday } from "@/lib/dutyTypes";
import { Buildings, Hall, LogoSigns, WorkRooms, Zone, type DoorState } from "@/components/Campus";
import { B } from "@/components/sceneKit";

/**
 * Khuôn viên văn phòng: mỗi phòng ban là một khu RIÊNG (vách sau có Tivi, cửa quẹt thẻ + đèn trạng thái),
 * quán Trà & Ăn, phòng Gym, phòng Nghỉ và phòng Họp đứng riêng. AI rảnh tự tìm đường đi giữa các khu theo giờ
 * trong ngày (sáng cà phê/ăn sáng, họp đầu ngày, trưa ăn rồi nghỉ, chiều họp nhanh + tập gym).
 * Thử nhanh: thêm ?hour=8 (ép giờ) và/hoặc ?fast=1 (đi lại nhanh) vào địa chỉ.
 */
type States = Record<AgentId, AgentState>;

const SKIN = "#f1c9a5";
const COMMANDER_POS = AGENTS[0].pos;
const TWO_PI = Math.PI * 2;

const lerpAngle = (a: number, b: number, t: number) => {
  const d = ((((b - a + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;
  return a + d * t;
};

// ---------------------------------------------------------------- người
type Ctl = { mode: "desk" | "walk" | "spot"; pose: Pose | null; sit: boolean; status: AgentStatus };

/** Người: thân + đầu + 2 tay + 2 chân. Hoạt ảnh theo chế độ (ngồi bàn / đi / làm việc ở khu nghỉ). */
function Person({ color, ctl, hair = "#2b2118", skin = SKIN, crown = false }: { color: string; ctl: React.RefObject<Ctl>; hair?: string; skin?: string; crown?: boolean }) {
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Mesh>(null);
  const armR = useRef<THREE.Mesh>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const hip = useRef(0.5);
  const [phaseOffset] = useState(() => Math.random() * 6);

  useFrame(({ clock }, dtRaw) => {
    const c = ctl.current;
    if (!c || !body.current || !head.current || !armL.current || !armR.current || !legL.current || !legR.current) return;
    const t = clock.elapsedTime + phaseOffset;
    const dt = Math.min(dtRaw, 0.1);
    const seated = c.mode === "desk" || (c.mode === "spot" && c.sit);
    hip.current += ((seated ? 0.5 : 0.62) - hip.current) * Math.min(1, dt * 10);

    let bob = Math.sin(t * 1.6) * 0.01;
    let tilt = 0;
    let headX = 0;
    let headY = 0;
    let aL = seated ? -0.7 : 0;
    let aR = aL;
    let lL = seated ? -Math.PI / 2 : 0;
    let lR = lL;

    if (c.mode === "walk") {
      const sw = Math.sin(t * 9);
      lL = sw * 0.6;
      lR = -sw * 0.6;
      aL = -sw * 0.55;
      aR = sw * 0.55;
      bob = Math.abs(sw) * 0.03;
    } else if (c.mode === "desk") {
      if (c.pose === "type") {
        // nhân viên thật đang trực: gõ máy nhẹ nhàng, thỉnh thoảng nhìn quanh
        aL = -0.85 + Math.sin(t * 7) * 0.12;
        aR = -0.85 + Math.sin(t * 7 + 1.9) * 0.12;
        headY = Math.sin(t * 0.35) > 0.8 ? Math.sin(t * 1.5) * 0.5 : 0;
        bob = Math.sin(t * 1.6) * 0.012;
      } else if (c.status === "working") {
        aL = -0.9 + Math.sin(t * 14) * 0.25;
        aR = -0.9 + Math.sin(t * 14 + 1.7) * 0.25;
        bob = Math.sin(t * 6) * 0.015;
        tilt = Math.sin(t * 2) * 0.08;
      } else if (c.status === "thinking") {
        tilt = Math.sin(t * 2.2) * 0.22;
        aL = -0.5;
        aR = -1.5;
      } else if (c.status === "done") {
        bob = Math.abs(Math.sin(t * 4)) * 0.08;
        aL = -2.4 + Math.sin(t * 6) * 0.3;
        aR = -2.4 - Math.sin(t * 6) * 0.3;
      } else if (c.status === "error") {
        tilt = Math.sin(t * 20) * 0.1;
      }
    } else if (c.pose === "run") {
      const sw = Math.sin(t * 12);
      lL = sw * 0.95;
      lR = -sw * 0.95;
      aL = -0.9 - sw * 0.8;
      aR = -0.9 + sw * 0.8;
      bob = Math.abs(sw) * 0.05;
    } else if (c.pose === "lift") {
      aL = -0.4 - (Math.sin(t * 3) + 1) * 0.6;
      aR = -0.4 - (Math.sin(t * 3 + Math.PI) + 1) * 0.6;
      bob = Math.sin(t * 3) * 0.02;
    } else if (c.pose === "box") {
      aL = -1.5 + Math.sin(t * 9) * 0.6;
      aR = -1.5 + Math.sin(t * 9 + Math.PI) * 0.6;
      bob = Math.abs(Math.sin(t * 4.5)) * 0.03;
    } else if (c.pose === "stretch") {
      aL = -3.0 + Math.sin(t * 1.2) * 0.25;
      aR = -3.0 - Math.sin(t * 1.2) * 0.25;
      tilt = Math.sin(t * 1.2) * 0.12;
    } else if (c.pose === "sip") {
      aR = -1.6 + Math.sin(t * 0.9) * 0.25;
      aL = seated ? -0.5 : 0;
      tilt = Math.sin(t * 0.7) * 0.06;
    } else if (c.pose === "eat") {
      aR = -1.0 + Math.sin(t * 3.2) * 0.45;
      aL = -0.9 + Math.sin(t * 3.2 + 1.4) * 0.3;
    } else if (c.pose === "talk") {
      // đứng trao đổi: tay ra hiệu, đầu gật/quay nhẹ
      headY = Math.sin(t * 0.7) * 0.35;
      tilt = Math.sin(t * 1.3) * 0.05;
      aR = Math.sin(t * 0.9) > 0.1 ? -1.3 + Math.sin(t * 5) * 0.35 : -0.3;
      aL = Math.sin(t * 0.6 + 2) > 0.5 ? -1.0 + Math.sin(t * 4) * 0.3 : -0.2;
    } else if (c.pose === "meet") {
      headY = Math.sin(t * 0.5) * 0.6;
      aR = Math.sin(t * 0.8) > 0.55 ? -1.5 + Math.sin(t * 6) * 0.3 : -0.8;
      aL = -0.8;
    } else if (c.pose === "nap") {
      headX = -0.45;
      aL = -0.3;
      aR = -0.3;
      bob = Math.sin(t * 1.2) * 0.012;
    }

    body.current.position.y = hip.current + bob;
    head.current.rotation.z = tilt;
    head.current.rotation.x = headX;
    head.current.rotation.y = headY;
    armL.current.rotation.x = aL;
    armR.current.rotation.x = aR;
    legL.current.rotation.x = lL;
    legR.current.rotation.x = lR;
    legL.current.position.y = hip.current;
    legR.current.position.y = hip.current;
  });

  return (
    <group>
      <group ref={body} position={[0, 0.5, 0]}>
        <mesh position={[0, 0.32, 0]} castShadow>
          <cylinderGeometry args={[0.2, 0.24, 0.62, 16]} />
          <meshStandardMaterial color={color} roughness={0.6} />
        </mesh>
        <group ref={head} position={[0, 0.86, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.19, 20, 20]} />
            <meshStandardMaterial color={skin} roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.07, -0.02]}>
            <sphereGeometry args={[0.2, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
            <meshStandardMaterial color={hair} roughness={0.9} />
          </mesh>
          {crown && (
            <group position={[0, 0.25, 0]}>
              <mesh>
                <cylinderGeometry args={[0.16, 0.19, 0.12, 12]} />
                <meshStandardMaterial color="#fbbf24" metalness={0.8} roughness={0.25} emissive="#f59e0b" emissiveIntensity={0.5} />
              </mesh>
              {[0, 1, 2, 3, 4].map((i) => (
                <mesh key={i} position={[Math.cos((i / 5) * TWO_PI) * 0.15, 0.1, Math.sin((i / 5) * TWO_PI) * 0.15]}>
                  <coneGeometry args={[0.04, 0.12, 6]} />
                  <meshStandardMaterial color="#fde047" metalness={0.8} roughness={0.25} emissive="#f59e0b" emissiveIntensity={0.6} />
                </mesh>
              ))}
            </group>
          )}
        </group>
        <mesh ref={armL} position={[-0.27, 0.5, 0]} castShadow>
          <boxGeometry args={[0.09, 0.4, 0.09]} />
          <meshStandardMaterial color={color} roughness={0.6} />
        </mesh>
        <mesh ref={armR} position={[0.27, 0.5, 0]} castShadow>
          <boxGeometry args={[0.09, 0.4, 0.09]} />
          <meshStandardMaterial color={color} roughness={0.6} />
        </mesh>
      </group>
      {[-0.1, 0.1].map((x, i) => (
        <group key={x} ref={i === 0 ? legL : legR} position={[x, 0.5, 0]}>
          <mesh position={[0, -0.27, 0]} castShadow>
            <boxGeometry args={[0.11, 0.54, 0.11]} />
            <meshStandardMaterial color="#2f3447" roughness={0.7} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------- AI tự đi lại
type Roam = {
  claim: (l: LoungeId) => number;
  release: (l: LoungeId, i: number) => void;
  hour: () => number;
  fast: boolean;
  /** Nhân viên chọn nơi đến: bình thường theo giờ; khi bang chủ đang họp/ăn thì hay kéo tới đúng phòng đó. */
  pickFor: (now: number) => LoungeId;
  setBias: (id: LoungeId, until: number) => void;
};
type Phase = "seated" | "out" | "stay" | "back";
type Sim = { phase: Phase; s: number; route: Route | null; lounge: LoungeId | null; idx: number; spot: Spot | null; nextAt: number; leaveAt: number; heading: number };

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function Agent({ meta, st, onSelect, roam, locked }: { meta: AgentMeta; st: AgentState; onSelect: (id: AgentId) => void; roam: Roam; locked: boolean }) {
  const g = useRef<THREE.Group>(null);
  const ctl = useRef<Ctl>({ mode: "desk", pose: null, sit: true, status: st.status });
  const sim = useRef<Sim>({ phase: "seated", s: 0, route: null, lounge: null, idx: -1, spot: null, nextAt: -1, leaveAt: 0, heading: Math.PI });
  const [px, pz] = meta.pos;

  useEffect(() => {
    ctl.current.status = st.status;
  }, [st.status]);

  useFrame(({ clock }, dtRaw) => {
    const grp = g.current;
    if (!grp) return;
    const S = sim.current;
    const C = ctl.current;
    const now = clock.elapsedTime;
    const dt = Math.min(dtRaw, 0.1);
    // Phòng đang chỉnh sửa (khoá cửa): AI ở lại bàn; đang ở ngoài thì về ngay.
    const idle = C.status === "idle" && !locked;
    const k = roam.fast ? 3 : 1;
    if (S.nextAt < 0) S.nextAt = now + (roam.fast ? rand(1, 4) : rand(5, 25));

    if (S.phase === "seated") {
      if (idle && now >= S.nextAt) {
        const first = pickLounge(roam.hour(), Math.random);
        const order = [first, ...LOUNGE_IDS.filter((l) => l !== first).sort(() => Math.random() - 0.5)];
        for (const l of order) {
          const i = roam.claim(l);
          if (i >= 0) {
            const lounge = LOUNGE_BY_ID[l];
            const spot = lounge.spots[i];
            S.lounge = l;
            S.idx = i;
            S.spot = spot;
            S.route = buildRoute(meta, lounge, spot);
            S.s = 0;
            S.phase = "out";
            break;
          }
        }
        if (S.phase === "seated") S.nextAt = now + rand(4, 10) / k;
      }
    } else if (S.phase === "out") {
      if (!idle) S.phase = "back";
      else if (S.route) {
        S.s += 1.6 * k * dt;
        if (S.s >= S.route.total) {
          S.s = S.route.total;
          S.phase = "stay";
          const pose = S.spot?.pose;
          S.leaveAt = now + (pose === "nap" ? rand(40, 70) : pose === "meet" ? rand(35, 60) : pose === "run" || pose === "lift" || pose === "box" || pose === "stretch" ? rand(35, 60) : rand(28, 50)) / k;
        }
      }
    } else if (S.phase === "stay") {
      if (!idle || now >= S.leaveAt) S.phase = "back";
    } else if (S.phase === "back" && S.route) {
      S.s -= 1.8 * (idle ? 1 : 1.6) * k * dt;
      if (S.s <= 0) {
        S.s = 0;
        S.phase = "seated";
        if (S.lounge) roam.release(S.lounge, S.idx);
        S.lounge = null;
        S.idx = -1;
        S.spot = null;
        S.route = null;
        S.nextAt = now + rand(15, 40) / k;
      }
    }
    // đã rời chỗ ở khu nghỉ (đang đi về): nhả chỗ cho người khác
    if (S.phase === "back" && S.lounge && S.route && S.s < S.route.total - 0.5) {
      roam.release(S.lounge, S.idx);
      S.lounge = null;
    }

    let x = px;
    let z = pz + 0.95;
    let target = Math.PI;
    if (S.route && S.phase !== "seated") {
      const p = pointAt(S.route, S.s);
      x = p.x;
      z = p.z;
      if (S.phase === "stay" && S.spot) {
        target = S.spot.face;
      } else {
        const dir = S.phase === "back" ? -1 : 1;
        if (Math.abs(p.dx) + Math.abs(p.dz) > 1e-6) target = Math.atan2(dir * p.dx, dir * p.dz);
        else target = S.heading;
      }
    }
    S.heading = lerpAngle(S.heading, target, Math.min(1, dt * 8));
    grp.position.set(x, 0, z);
    grp.rotation.y = S.heading;

    if (S.phase === "seated") {
      C.mode = "desk";
      C.sit = true;
      C.pose = null;
    } else if (S.phase === "stay" && S.spot) {
      C.mode = "spot";
      C.sit = S.spot.sit;
      C.pose = S.spot.pose;
    } else {
      C.mode = "walk";
      C.sit = false;
      C.pose = null;
    }
  });

  return (
    <group ref={g} position={[px, 0, pz + 0.95]} rotation={[0, Math.PI, 0]} onClick={(e) => (e.stopPropagation(), onSelect(meta.id))}>
      <Person color={meta.color} ctl={ctl} />
    </group>
  );
}

// ---------------------------------------------------------------- nhân viên thật (Reader/Saler)
const hashStr = (s: string) => {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
};

/** Chia bàn cho người đang trực (cố định theo mã nhân viên; trùng thì lấy bàn kế tiếp). */
function assignDesks(duty: DutyStaff[]): Map<string, number> {
  const res = new Map<string, number>();
  for (const role of ["reader", "saler"] as StaffRole[]) {
    const cap = WORKROOM_BY_ID[role].desks.length;
    const taken = new Set<number>();
    const on = duty.filter((d) => d.role === role && d.state === "on").sort((a, b) => a.id.localeCompare(b.id));
    for (const p of on) {
      if (taken.size >= cap) break;
      let i = hashStr(p.id) % cap;
      while (taken.has(i)) i = (i + 1) % cap;
      taken.add(i);
      res.set(p.id, i);
    }
  }
  return res;
}

/** Bang chủ gọi nhân viên lại trao đổi: ai được gọi (mã nhân viên → chỗ đứng quanh điểm họp), tới giờ nào thì thôi. */
type BossCtl = { key: number; until: number; px: number; pz: number; spots: Record<string, { x: number; z: number }> };
type PosInfo = { x: number; z: number; desk: boolean; moving: boolean; name: string };

type StaffSim = {
  init: boolean;
  node: PlaceNode;
  target: PlaceNode | null;
  route: Route | null;
  s: number;
  phase: "idle" | "moving";
  dwellUntil: number;
  heading: number;
  held: { id: LoungeId; idx: number } | null;
  attendKey: number;
  attending: boolean;
};

/** Vùng bấm vô hình quanh người (to hơn thân người cho dễ chạm). */
function HitBox() {
  return (
    <mesh position={[0, 0.95, 0]}>
      <cylinderGeometry args={[0.45, 0.45, 1.9, 8]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

/**
 * Một nhân viên thật. Đang trong giờ trực → ngồi gõ máy ở bàn trong phòng làm việc của vai trò mình;
 * chưa tới giờ trực (hoặc đang nghỉ giữa ca) → đi dạo quanh công ty hoặc ngồi nghỉ ở quán/gym/phòng nghỉ/phòng họp.
 * Bang chủ Meo gọi tới trao đổi thì ra đứng quanh Meo cho tới khi xong. Chạm vào để xem thông tin.
 */
function StaffActor({
  staff,
  deskIdx,
  roam,
  onPos,
  boss,
  onClick,
}: {
  staff: DutyStaff;
  deskIdx: number | null;
  roam: Roam;
  onPos: (id: string, info: PosInfo) => void;
  boss: React.RefObject<BossCtl>;
  onClick: (id: string) => void;
}) {
  const g = useRef<THREE.Group>(null);
  const ctl = useRef<Ctl>({ mode: "walk", pose: null, sit: false, status: "idle" });
  const sim = useRef<StaffSim>({ init: false, node: { kind: "out", x: 0, z: 0 }, target: null, route: null, s: 0, phase: "idle", dwellUntil: 0, heading: 0, held: null, attendKey: -1, attending: false });
  const look = staffLook(staff.idx);

  useEffect(() => {
    const S = sim.current;
    return () => {
      if (S.held) roam.release(S.held.id, S.held.idx);
    };
  }, [roam]);

  useFrame(({ clock }, dtRaw) => {
    const grp = g.current;
    if (!grp) return;
    const S = sim.current;
    const C = ctl.current;
    const bc = boss.current;
    const now = clock.elapsedTime;
    const dt = Math.min(dtRaw, 0.1);
    const k = roam.fast ? 3 : 1;
    const deskNode: PlaceNode | null = deskIdx !== null ? { kind: "desk", room: staff.role, idx: deskIdx } : null;
    const wantDesk = staff.state === "on" && deskNode !== null;

    if (!S.init) {
      S.init = true;
      if (wantDesk && deskNode) S.node = deskNode;
      else {
        const [x, z] = WANDER_POINTS[Math.floor(Math.random() * WANDER_POINTS.length)];
        S.node = { kind: "out", x, z };
        S.dwellUntil = now + rand(1, 6) / k;
      }
    }

    const releaseHeld = () => {
      if (S.held) roam.release(S.held.id, S.held.idx);
      S.held = null;
    };
    const startMove = (to: PlaceNode) => {
      S.route = routeBetween(S.node, to);
      S.target = to;
      S.s = 0;
      S.phase = "moving";
    };

    if (S.phase === "idle") {
      const atDesk = S.node.kind === "desk" && deskIdx !== null && S.node.idx === deskIdx;
      const sp = bc?.spots[staff.id];
      if (sp && bc.until > now && S.attendKey !== bc.key && !wantDesk) {
        // bang chủ gọi lại trao đổi
        releaseHeld();
        S.attendKey = bc.key;
        S.attending = true;
        startMove({ kind: "out", x: sp.x, z: sp.z });
      } else if (wantDesk && deskNode && !atDesk) {
        releaseHeld();
        S.attending = false;
        startMove(deskNode);
      } else if (!wantDesk && (S.node.kind === "desk" || now >= S.dwellUntil)) {
        releaseHeld();
        S.attending = false;
        let to: PlaceNode | null = null;
        if (Math.random() < 0.55) {
          const id = roam.pickFor(now);
          const i = roam.claim(id);
          if (i >= 0) {
            S.held = { id, idx: i };
            to = { kind: "lounge", id, spot: LOUNGE_BY_ID[id].spots[i] };
          }
        }
        if (!to) {
          const [x, z] = WANDER_POINTS[Math.floor(Math.random() * WANDER_POINTS.length)];
          to = { kind: "out", x, z };
        }
        startMove(to);
      }
    } else if (S.route && S.target) {
      S.s += 1.5 * k * dt;
      if (S.s >= S.route.total) {
        S.node = S.target;
        S.phase = "idle";
        S.route = null;
        if (S.attending && bc && bc.key === S.attendKey && bc.until > now) S.dwellUntil = bc.until + 0.5;
        else {
          S.attending = false;
          S.dwellUntil = S.node.kind === "lounge" ? now + rand(25, 50) / k : S.node.kind === "out" ? now + rand(3, 8) / k : Infinity;
        }
      }
    }
    if (S.attending && (!bc || bc.key !== S.attendKey || bc.until <= now) && S.phase === "idle") S.attending = false;

    let x: number;
    let z: number;
    let target = S.heading;
    if (S.phase === "moving" && S.route) {
      const p = pointAt(S.route, S.s);
      x = p.x;
      z = p.z;
      if (Math.abs(p.dx) + Math.abs(p.dz) > 1e-6) target = Math.atan2(p.dx, p.dz);
    } else {
      [x, z] = nodePos(S.node);
      if (S.node.kind === "lounge") target = S.node.spot.face;
      else if (S.node.kind === "desk") target = Math.PI;
      else if (S.attending && bc) target = Math.atan2(bc.px - x, bc.pz - z);
    }
    S.heading = lerpAngle(S.heading, target, Math.min(1, dt * 8));
    grp.position.set(x, 0, z);
    grp.rotation.y = S.heading;
    onPos(staff.id, { x, z, desk: S.node.kind === "desk" && S.phase === "idle", moving: S.phase === "moving", name: staff.name });

    if (S.phase === "moving") {
      C.mode = "walk";
      C.sit = false;
      C.pose = null;
    } else if (S.node.kind === "desk") {
      C.mode = "desk";
      C.sit = true;
      C.pose = "type";
    } else if (S.node.kind === "lounge") {
      C.mode = "spot";
      C.sit = S.node.spot.sit;
      C.pose = S.node.spot.pose;
    } else {
      C.mode = "spot";
      C.sit = false;
      C.pose = S.attending ? "talk" : null;
    }
  });

  return (
    <group
      ref={g}
      onClick={(e) => {
        e.stopPropagation();
        onClick(staff.id);
      }}
    >
      <Person color={look.shirt} ctl={ctl} hair={look.hair} skin={look.skin} />
      <HitBox />
    </group>
  );
}

// ---------------------------------------------------------------- Meo — bang chủ (Admin)
type BossSim = {
  init: boolean;
  node: PlaceNode;
  target: PlaceNode | null;
  route: Route | null;
  s: number;
  phase: "idle" | "moving" | "stay";
  nextAt: number;
  stayUntil: number;
  stayFor: number;
  heading: number;
  held: { id: LoungeId; idx: number } | null;
  kind: "chat" | "visit" | "meeting" | "eat" | "walk" | null;
  faceTo: { x: number; z: number } | null;
};

/**
 * Meo bang chủ: thường xuyên gặp trao đổi 1-1 / 1-2 / 1-3 nhân viên (gọi họ ra đứng quanh mình, hoặc ghé tận bàn người đang trực),
 * ngồi ghế đầu bàn chỉ đạo họp trong phòng họp, và ăn uống cùng mọi người (lúc đó nhân viên cũng hay kéo tới đúng phòng đó).
 */
function BossActor({
  roam,
  getPos,
  deskOf,
  onSummon,
  onActivity,
  onPos,
  onClick,
}: {
  roam: Roam;
  getPos: () => Record<string, PosInfo>;
  deskOf: (id: string) => { room: StaffRole; idx: number } | null;
  onSummon: (spots: BossCtl["spots"], until: number, px: number, pz: number) => void;
  onActivity: (text: string) => void;
  onPos: (id: string, info: PosInfo) => void;
  onClick: () => void;
}) {
  const g = useRef<THREE.Group>(null);
  const ctl = useRef<Ctl>({ mode: "spot", pose: null, sit: false, status: "idle" });
  const sim = useRef<BossSim>({ init: false, node: { kind: "out", x: 0, z: 5.8 }, target: null, route: null, s: 0, phase: "idle", nextAt: -1, stayUntil: 0, stayFor: 0, heading: Math.PI, held: null, kind: null, faceTo: null });

  useEffect(() => {
    const S = sim.current;
    return () => {
      if (S.held) roam.release(S.held.id, S.held.idx);
    };
  }, [roam]);

  useFrame(({ clock }, dtRaw) => {
    const grp = g.current;
    if (!grp) return;
    const S = sim.current;
    const C = ctl.current;
    const now = clock.elapsedTime;
    const dt = Math.min(dtRaw, 0.1);
    const k = roam.fast ? 3 : 1;
    if (!S.init) {
      S.init = true;
      S.nextAt = now + rand(2, 6) / k;
    }

    const go = (to: PlaceNode, kind: NonNullable<BossSim["kind"]>, stay: number, faceTo: BossSim["faceTo"]) => {
      S.route = routeBetween(S.node, to);
      S.target = to;
      S.s = 0;
      S.phase = "moving";
      S.kind = kind;
      S.stayFor = stay;
      S.faceTo = faceTo;
      return S.route.total / (1.7 * k);
    };

    if (S.phase === "idle" && now >= S.nextAt) {
      const hour = roam.hour();
      const pos = getPos();
      const ids = Object.keys(pos).filter((i) => i !== "boss");
      const roamers = ids.filter((i) => !pos[i].desk);
      const deskers = ids.filter((i) => pos[i].desk && deskOf(i));
      const meetingTime = (hour >= 9 && hour < 10.5) || (hour >= 14 && hour < 15.5);
      const w = {
        chat: ids.length ? 5 : 0,
        meeting: meetingTime ? 4 : 1.3,
        eat: hour >= 11 && hour < 14 ? 4 : hour < 9 ? 3 : 1,
        walk: 1.5,
      };
      let r = Math.random() * (w.chat + w.meeting + w.eat + w.walk);
      const pick = (r -= w.chat) < 0 ? "chat" : (r -= w.meeting) < 0 ? "meeting" : (r -= w.eat) < 0 ? "eat" : "walk";
      let done = false;

      if (pick === "chat") {
        const stay = rand(14, 26) / k;
        if (deskers.length && (roamers.length === 0 || Math.random() < 0.4)) {
          // ghé tận bàn một người đang trực
          const id = deskers[Math.floor(Math.random() * deskers.length)];
          const d = deskOf(id)!;
          const room = WORKROOM_BY_ID[d.room];
          const ch = deskChair(room, d.idx);
          go({ kind: "visit", room: d.room, idx: d.idx }, "visit", stay, { x: ch[0], z: ch[1] });
          onActivity(`Trao đổi 1-1 với ${pos[id].name} tại bàn làm việc`);
          done = true;
        } else if (roamers.length) {
          // gọi 1, 2 hoặc 3 người ra đứng quanh mình
          const n = Math.min(roamers.length, Math.random() < 0.45 ? 1 : Math.random() < 0.65 ? 2 : 3);
          const picked = [...roamers].sort(() => Math.random() - 0.5).slice(0, n);
          const [px, pz] = WANDER_POINTS[Math.floor(Math.random() * WANDER_POINTS.length)];
          const base = Math.random() * TWO_PI;
          const spots: BossCtl["spots"] = {};
          picked.forEach((id, i) => {
            const a = base + ((i + 1) / (n + 1)) * Math.PI * 1.2 - Math.PI * 0.6;
            spots[id] = { x: px + Math.cos(a) * 1.25, z: pz + Math.sin(a) * 1.25 };
          });
          const travel = go({ kind: "out", x: px, z: pz }, "chat", stay, { x: px + Math.cos(base) * 1.25, z: pz + Math.sin(base) * 1.25 });
          onSummon(spots, now + travel + stay + 12 / k, px, pz);
          onActivity(`Trao đổi với ${picked.map((id) => pos[id].name).join(", ")}`);
          done = true;
        }
      } else if (pick === "meeting") {
        const stay = rand(60, 90) / k;
        const travel = go({ kind: "lounge", id: "meeting", spot: MEO_SEAT }, "meeting", stay, null);
        roam.setBias("meeting", now + travel + stay);
        onActivity("Ngồi chỉ đạo họp trong phòng họp");
        done = true;
      } else if (pick === "eat") {
        const id: LoungeId = hour >= 11 && hour < 14 ? "dining" : hour < 10 ? (Math.random() < 0.5 ? "dining" : "tea") : "tea";
        const i = roam.claim(id);
        if (i >= 0) {
          S.held = { id, idx: i };
          const stay = rand(40, 60) / k;
          const travel = go({ kind: "lounge", id, spot: LOUNGE_BY_ID[id].spots[i] }, "eat", stay, null);
          roam.setBias(id, now + travel + stay);
          onActivity(id === "dining" ? (hour < 10 ? "Ăn sáng cùng mọi người" : "Ăn trưa cùng mọi người") : "Uống cà phê, trò chuyện cùng mọi người");
          done = true;
        }
      }
      if (!done) {
        const [x, z] = WANDER_POINTS[Math.floor(Math.random() * WANDER_POINTS.length)];
        go({ kind: "out", x, z }, "walk", rand(3, 6) / k, null);
        onActivity("Đi kiểm tra các phòng");
      }
    } else if (S.phase === "moving" && S.route && S.target) {
      S.s += 1.7 * k * dt;
      if (S.s >= S.route.total) {
        S.node = S.target;
        S.phase = "stay";
        S.route = null;
        S.stayUntil = now + S.stayFor;
      }
    } else if (S.phase === "stay" && now >= S.stayUntil) {
      if (S.held) roam.release(S.held.id, S.held.idx);
      S.held = null;
      S.phase = "idle";
      S.kind = null;
      S.nextAt = now + rand(4, 10) / k;
      onActivity("");
    }

    let x: number;
    let z: number;
    let target = S.heading;
    if (S.phase === "moving" && S.route) {
      const p = pointAt(S.route, S.s);
      x = p.x;
      z = p.z;
      if (Math.abs(p.dx) + Math.abs(p.dz) > 1e-6) target = Math.atan2(p.dx, p.dz);
    } else {
      [x, z] = nodePos(S.node);
      if (S.node.kind === "lounge") target = S.node.spot.face;
      else if (S.faceTo) target = Math.atan2(S.faceTo.x - x, S.faceTo.z - z);
    }
    S.heading = lerpAngle(S.heading, target, Math.min(1, dt * 8));
    grp.position.set(x, 0, z);
    grp.rotation.y = S.heading;
    onPos("boss", { x, z, desk: false, moving: S.phase === "moving", name: "Meo" });

    if (S.phase === "moving") {
      C.mode = "walk";
      C.sit = false;
      C.pose = null;
    } else if (S.node.kind === "lounge") {
      C.mode = "spot";
      C.sit = S.node.spot.sit;
      C.pose = S.node.spot.pose;
    } else {
      C.mode = "spot";
      C.sit = false;
      C.pose = S.kind === "chat" || S.kind === "visit" ? "talk" : null;
    }
  });

  return (
    <group
      ref={g}
      position={[0, 0, 5.8]}
      scale={1.08}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <Person color="#6d28d9" ctl={ctl} hair="#1a1a1a" skin="#f1c9a5" crown />
      <HitBox />
    </group>
  );
}

/** Mỗi khung hình: chiếu vị trí đầu từng nhân viên ra toạ độ màn hình (nhãn tên là HTML thường, tránh drei <Html>). */
function StaffProjector({ get, onProject }: { get: () => Record<string, { x: number; z: number }>; onProject: (id: string, x: number, y: number, on: boolean) => void }) {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    const pos = get();
    for (const id of Object.keys(pos)) {
      v.set(pos[id].x, 2.05, pos[id].z).project(camera);
      onProject(id, (v.x * 0.5 + 0.5) * size.width, (-v.y * 0.5 + 0.5) * size.height, v.z > -1 && v.z < 1);
    }
  });
  return null;
}

// ---------------------------------------------------------------- bàn làm việc (không kèm người)
function Station({ meta, st, selected, boss = false }: { meta: AgentMeta; st: AgentState; selected: boolean; boss?: boolean }) {
  const [x, z] = meta.pos;
  const active = st.status === "working" || st.status === "thinking";
  const screenColor = useMemo(
    () => new THREE.Color(active ? meta.color : st.status === "error" ? "#ef4444" : "#8da2c4"),
    [active, meta.color, st.status]
  );
  const w = boss ? 2.6 : 2.0;
  return (
    <group position={[x, 0, z]}>
      <B p={[0, 0.78, 0]} s={[w, 0.07, 1.0]} c="#fbfbfd" rough={0.35} metal={0.05} />
      {[-1, 1].map((s) => (
        <B key={s} p={[s * (w / 2 - 0.08), 0.38, 0]} s={[0.05, 0.76, 0.85]} c="#b9bfcc" metal={0.6} rough={0.35} />
      ))}
      {(boss ? [-0.7, 0.7] : [0]).map((mx) => (
        <group key={mx} position={[mx, 0.82, -0.2]}>
          <B p={[0, 0.36, 0]} s={[0.9, 0.55, 0.03]} c="#e9ebf0" metal={0.3} rough={0.35} />
          <mesh position={[0, 0.37, 0.02]}>
            <planeGeometry args={[0.82, 0.46]} />
            <meshStandardMaterial color={screenColor} emissive={screenColor} emissiveIntensity={active ? 1.15 : 0.35} />
          </mesh>
          <B p={[0, 0.07, 0]} s={[0.06, 0.14, 0.05]} c="#c9ced9" metal={0.5} cast={false} />
          <B p={[0, 0.005, 0.02]} s={[0.34, 0.01, 0.2]} c="#c9ced9" metal={0.5} cast={false} />
        </group>
      ))}
      <B p={[0, 0.82, 0.2]} s={[0.55, 0.02, 0.18]} c="#e7e9ef" cast={false} />
      <group position={[0, 0, 0.95]}>
        <B p={[0, 0.45, 0]} s={[0.55, 0.08, 0.55]} c="#2b3040" rough={0.5} />
        <B p={[0, 0.78, 0.27]} s={[0.52, 0.6, 0.06]} c="#2b3040" rough={0.5} />
        <mesh position={[0, 0.22, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.45, 8]} />
          <meshStandardMaterial color="#d7dbe6" metalness={0.6} />
        </mesh>
        <mesh position={[0, 0.03, 0]}>
          <cylinderGeometry args={[0.28, 0.28, 0.04, 5]} />
          <meshStandardMaterial color="#e4e7ef" metalness={0.4} />
        </mesh>
      </group>
      {(selected || active) && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0.4]}>
          <ringGeometry args={[1.2, 1.32, 48]} />
          <meshBasicMaterial color={meta.color} transparent opacity={selected ? 0.95 : 0.55} />
        </mesh>
      )}
    </group>
  );
}

/** Gói việc (hạt sáng) bay từ bàn Chỉ huy tới bàn AI được giao (khoảng 1,4 giây đầu). */
function Parcel({ meta, startedAt }: { meta: AgentMeta; startedAt: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const t = Math.min(1, (Date.now() - startedAt) / 1400);
    m.visible = t < 1;
    m.position.x = THREE.MathUtils.lerp(COMMANDER_POS[0], meta.pos[0], t);
    m.position.z = THREE.MathUtils.lerp(COMMANDER_POS[1], meta.pos[1], t) + 0.2;
    m.position.y = 1.0 + Math.sin(t * Math.PI) * 3.2;
    m.rotation.y += 0.14;
    m.rotation.x += 0.1;
  });
  return (
    <mesh ref={ref} visible={false}>
      <octahedronGeometry args={[0.3]} />
      <meshStandardMaterial color="#ffffff" emissive={meta.color} emissiveIntensity={1.4} />
    </mesh>
  );
}

export default function Office3D({
  states,
  selected,
  onSelect,
  tv,
  onTvClick,
  maint,
  duty,
  board,
  sales,
  cases,
  onBoardClick,
  onStaffClick,
  onBossClick,
}: {
  states: States;
  selected: AgentId | null;
  onSelect: (id: AgentId | null) => void;
  tv: TvData | null;
  onTvClick: (id: DeptId) => void;
  /** Nhân viên Reader/Saler trực hôm nay: đang trực → ngồi bàn (có tên); chưa tới giờ → đi quanh công ty/nghỉ. */
  duty: DutyStaff[];
  /** Toàn bộ ca hôm nay (kể cả đã hết ca) cho bảng ca trên tường phòng làm việc. */
  board: DutyStaff[];
  /** Bán hàng hôm nay của từng Saler (bảng ở phòng làm việc Saler). */
  sales: SalesToday | null;
  /** Ca (lịch hẹn do Sale gắn) + số đơn hôm nay của từng Reader (tivi thứ hai ở phòng Reader). */
  cases: CasesToday | null;
  onBoardClick: (kind: BoardKind) => void;
  /** Chạm vào một nhân viên → xem giờ trực, số ca hôm nay, lương, ca chưa xử lý. */
  onStaffClick: (id: string) => void;
  /** Chạm vào Meo bang chủ → xem Meo đang làm gì. */
  onBossClick: (activity: string) => void;
  /** Phòng nào đang được cấu hình/chỉnh sửa (đèn cửa đỏ nhấp nháy + bảng Work in Process, AI trong phòng ở lại bàn). */
  maint: Partial<Record<DeptId, boolean>>;
}) {
  const occupancy = useRef<Record<LoungeId, boolean[]>>(
    Object.fromEntries(LOUNGES.map((l) => [l.id, l.spots.map(() => false)])) as Record<LoungeId, boolean[]>
  );
  const [opts] = useState(() => {
    const q = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
    const h = q.get("hour");
    const zoom = typeof window === "undefined" ? 15 : Math.max(10, Math.min(window.innerWidth / 76, window.innerHeight / 44));
    return { hour: h === null || h === "" ? null : Number(h), fast: q.get("fast") === "1", zoom };
  });

  const bias = useRef<{ id: LoungeId; until: number } | null>(null);
  const roam = useMemo<Roam>(
    () => ({
      pickFor: (now) => (bias.current && now < bias.current.until && Math.random() < 0.6 ? bias.current.id : pickLounge(vnHour(opts.hour), Math.random)),
      setBias: (id, until) => {
        bias.current = { id, until };
      },
      claim: (l) => {
        const occ = occupancy.current[l];
        const free = occ.map((used, i) => (used ? -1 : i)).filter((i) => i >= 0);
        if (!free.length) return -1;
        const i = free[Math.floor(Math.random() * free.length)];
        occ[i] = true;
        return i;
      },
      release: (l, i) => {
        occupancy.current[l][i] = false;
      },
      hour: () => vnHour(opts.hour),
      fast: opts.fast,
    }),
    [opts]
  );

  // --- nhân viên thật: bàn được chia, vị trí để vẽ nhãn tên. Meo (bang chủ) có nhân vật riêng nên không vẽ thêm Reader/Saler tên Meo.
  const crew = useMemo(() => duty.filter((s) => s.name.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase() !== "meo"), [duty]);
  const assign = useMemo(() => assignDesks(crew), [crew]);
  const occupied = useMemo(() => {
    const o: Record<StaffRole, boolean[]> = { reader: WORKROOMS[0].desks.map(() => false), saler: WORKROOMS[1].desks.map(() => false) };
    for (const p of crew) {
      const i = assign.get(p.id);
      if (i !== undefined) o[p.role][i] = true;
    }
    return o;
  }, [assign, crew]);
  const staffPos = useRef<Record<string, PosInfo>>({});
  const screen = useRef<Record<string, { x: number; y: number; on: boolean }>>({});
  const labelRefs = useRef<Record<string, HTMLElement | null>>({});
  const onPos = useCallback((id: string, info: PosInfo) => {
    staffPos.current[id] = info;
  }, []);
  const getPos = useCallback(() => staffPos.current, []);
  // --- bang chủ Meo: gọi nhân viên lại trao đổi, hoạt động hiện tại
  const bossCtl = useRef<BossCtl>({ key: 0, until: 0, px: 0, pz: 0, spots: {} });
  const bossActivity = useRef("");
  const onSummon = useCallback((spots: BossCtl["spots"], until: number, px: number, pz: number) => {
    bossCtl.current = { key: bossCtl.current.key + 1, until, px, pz, spots };
  }, []);
  const onActivity = useCallback((text: string) => {
    bossActivity.current = text;
  }, []);
  const deskOf = useCallback(
    (id: string) => {
      const idx = assign.get(id);
      const s = crew.find((x) => x.id === id);
      return idx !== undefined && s ? { room: s.role, idx } : null;
    },
    [assign, crew]
  );
  const onProject = useCallback((id: string, x: number, y: number, on: boolean) => {
    screen.current[id] = { x, y, on };
  }, []);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      for (const id of Object.keys(labelRefs.current)) {
        const el = labelRefs.current[id];
        const p = screen.current[id];
        if (el && p) {
          el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
          el.style.opacity = p.on ? "1" : "0";
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const deptAgents = (id: DeptId) => AGENTS.filter((a) => a.dept === id);
  const deptActive = (id: DeptId) => deptAgents(id).some((a) => states[a.id].status === "working" || states[a.id].status === "thinking");
  const doorState = (id: DeptId): DoorState => {
    if (maint[id]) return "maint";
    const list = deptAgents(id).map((a) => states[a.id].status);
    if (list.includes("error")) return "error";
    if (list.some((s) => s === "working" || s === "thinking")) return "busy";
    return "free";
  };

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Canvas
        orthographic
        shadows
        dpr={[1, 2]}
        camera={{ position: [20.5, 20, 25.5], zoom: opts.zoom, near: -120, far: 240 }}
        onPointerMissed={() => onSelect(null)}
        style={{ background: "linear-gradient(180deg,#dbe8ff 0%,#f6f8fd 100%)" }}
      >
        <ambientLight intensity={1.15} />
        <hemisphereLight args={["#ffffff", "#c9d6f2", 0.6]} />
        <directionalLight
          position={[12, 22, 16]}
          intensity={1.3}
          color="#fffaf0"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-36}
          shadow-camera-right={36}
          shadow-camera-top={36}
          shadow-camera-bottom={-36}
          shadow-camera-far={90}
          shadow-bias={-0.0004}
        />
        <Hall />
        <Suspense fallback={null}>
          <LogoSigns />
        </Suspense>
        <Buildings />
        <WorkRooms occupied={occupied} board={board} sales={sales} cases={cases} onBoard={onBoardClick} />
        {DEPTS.map((d) => (
          <Zone key={d.id} d={d} active={deptActive(d.id)} door={doorState(d.id)} data={tv ? tv[d.id] : null} states={states} onTv={onTvClick} />
        ))}
        {AGENTS.map((a) => (
          <Station key={a.id} meta={a} st={states[a.id]} selected={selected === a.id} boss={a.id === "commander"} />
        ))}
        {AGENTS.map((a) => (
          <Agent key={a.id} meta={a} st={states[a.id]} onSelect={onSelect} roam={roam} locked={!!maint[a.dept]} />
        ))}
        {AGENTS.filter((a) => a.id !== "commander" && states[a.id].startedAt && states[a.id].status !== "idle").map((a) => (
          <Parcel key={`${a.id}-${states[a.id].startedAt}`} meta={a} startedAt={states[a.id].startedAt!} />
        ))}
        {crew.map((s) => (
          <StaffActor key={s.id} staff={s} deskIdx={assign.get(s.id) ?? null} roam={roam} onPos={onPos} boss={bossCtl} onClick={onStaffClick} />
        ))}
        <BossActor
          roam={roam}
          getPos={getPos}
          deskOf={deskOf}
          onSummon={onSummon}
          onActivity={onActivity}
          onPos={onPos}
          onClick={() => onBossClick(bossActivity.current)}
        />
        <StaffProjector get={getPos} onProject={onProject} />
        <OrbitControls makeDefault enableDamping minZoom={8} maxZoom={90} maxPolarAngle={Math.PI / 2.2} target={[2, 0.8, 4]} />
      </Canvas>

      {/* Tên nhân viên trên đầu nhân vật (Reader xanh lá · Saler cam) */}
      <div className="pointer-events-none absolute inset-0">
        <div
          ref={(el) => {
            labelRefs.current["boss"] = el;
          }}
          onClick={() => onBossClick(bossActivity.current)}
          className="pointer-events-auto absolute left-0 top-0 flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border-2 border-amber-400 bg-gradient-to-r from-amber-50 to-white px-2.5 py-0.5 text-[11px] font-extrabold text-amber-900 shadow-md"
          style={{ opacity: 0 }}
        >
          👑 Meo · Bang chủ
        </div>
        {crew.map((s) => (
          <div
            key={s.id}
            ref={(el) => {
              labelRefs.current[s.id] = el;
            }}
            title={`${s.role === "reader" ? "Reader" : "Saler"} · ${s.from ?? ""}–${s.to ?? ""} · ${s.state === "on" ? "đang trực" : s.state === "break" ? "nghỉ giữa ca" : "chưa tới giờ trực"}`}
            onClick={() => onStaffClick(s.id)}
            className="pointer-events-auto absolute left-0 top-0 flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border bg-white/90 px-2 py-0.5 text-[10.5px] font-bold text-slate-800 shadow"
            style={{ borderColor: s.role === "reader" ? "#34d399" : "#fb923c", opacity: 0 }}
          >
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: staffLook(s.idx).shirt }} />
            {s.name}
          </div>
        ))}
      </div>
    </div>
  );
}
