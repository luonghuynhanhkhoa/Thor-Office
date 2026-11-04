"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Grid, OrbitControls, RoundedBox, useTexture } from "@react-three/drei";
import * as THREE from "three";
import {
  AGENTS,
  DEPTS,
  type AgentId,
  type AgentMeta,
  type AgentState,
  type AgentStatus,
  type DeptId,
  type DeptMeta,
} from "@/lib/agentsMeta";
import {
  CORRIDORS,
  LANE_M,
  LANE_S,
  LOUNGES,
  LOUNGE_BY_ID,
  ROOM_D,
  ROOM_W,
  buildRoute,
  pickLounge,
  pointAt,
  vnHour,
  type LoungeId,
  type LoungeMeta,
  type Pose,
  type Route,
  type Spot,
} from "@/lib/layout";
import type { TvData, TvLine } from "@/lib/tv";

/**
 * Văn phòng MỞ kiểu công nghệ tương lai: mỗi PHÒNG BAN là một không gian riêng (vách phía sau có Tivi,
 * vách kính bên trái, mở ra lối đi), hàng dưới là 4 phòng nghỉ (trà · ăn · gym · nghỉ). AI rảnh sẽ tự đi
 * lại giữa các phòng theo giờ trong ngày (sáng cà phê/ăn sáng, trưa ăn rồi nghỉ, chiều tập gym).
 * Thử nhanh: thêm ?hour=8 (ép giờ) và/hoặc ?fast=1 (đi lại nhanh) vào địa chỉ.
 */
type States = Record<AgentId, AgentState>;
type Vec3 = [number, number, number];

const STATUS_TEXT: Record<AgentStatus, string> = {
  idle: "Rảnh",
  thinking: "Đang nghĩ…",
  working: "Đang chạy",
  done: "Xong ✓",
  error: "Lỗi",
};
const STATUS_DOT: Record<AgentStatus, string> = {
  idle: "#94a3b8",
  thinking: "#8b5cf6",
  working: "#16a34a",
  done: "#0284c7",
  error: "#dc2626",
};

const SKIN = "#f1c9a5";
const COMMANDER_POS = AGENTS[0].pos;
const LOGO_RATIO = 367 / 510;
const TWO_PI = Math.PI * 2;

const lerpAngle = (a: number, b: number, t: number) => {
  const d = ((((b - a + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;
  return a + d * t;
};

// ---------------------------------------------------------------- khối dựng nhanh
function B({ p, s, c, metal = 0, rough = 0.5, op, emissive, ei = 1, cast = true }: {
  p: Vec3; s: Vec3; c: string; metal?: number; rough?: number; op?: number; emissive?: string; ei?: number; cast?: boolean;
}) {
  return (
    <mesh position={p} castShadow={cast && op === undefined} receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} metalness={metal} roughness={rough} transparent={op !== undefined} opacity={op ?? 1} emissive={emissive} emissiveIntensity={emissive ? ei : 0} />
    </mesh>
  );
}
function Cyl({ p, r, h, c, seg = 20, metal = 0, rough = 0.5, emissive }: { p: Vec3; r: number; h: number; c: string; seg?: number; metal?: number; rough?: number; emissive?: string }) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <cylinderGeometry args={[r, r, h, seg]} />
      <meshStandardMaterial color={c} metalness={metal} roughness={rough} emissive={emissive} emissiveIntensity={emissive ? 1.2 : 0} />
    </mesh>
  );
}
function Chair({ p, back }: { p: Vec3; back: 1 | -1 }) {
  return (
    <group position={p}>
      <B p={[0, 0.45, 0]} s={[0.5, 0.07, 0.5]} c="#2b3040" rough={0.5} />
      <B p={[0, 0.75, back * 0.23]} s={[0.5, 0.55, 0.05]} c="#2b3040" rough={0.5} />
      <Cyl p={[0, 0.22, 0]} r={0.04} h={0.45} c="#d7dbe6" seg={8} metal={0.6} />
    </group>
  );
}
function Plant({ position }: { position: Vec3 }) {
  return (
    <group position={position}>
      <Cyl p={[0, 0.3, 0]} r={0.28} h={0.6} c="#f4f1ea" rough={0.6} />
      <mesh position={[0, 1.0, 0]} castShadow>
        <icosahedronGeometry args={[0.52, 1]} />
        <meshStandardMaterial color="#3fae6a" roughness={0.7} flatShading />
      </mesh>
      <mesh position={[0.2, 1.45, 0.05]} castShadow>
        <icosahedronGeometry args={[0.34, 1]} />
        <meshStandardMaterial color="#58c785" roughness={0.7} flatShading />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- người
type Ctl = { mode: "desk" | "walk" | "spot"; pose: Pose | null; sit: boolean; status: AgentStatus; running: boolean };

/** Người: thân + đầu + 2 tay + 2 chân. Hoạt ảnh theo chế độ (ngồi bàn/đi/làm việc ở phòng nghỉ). */
function Person({ color, ctl }: { color: string; ctl: React.RefObject<Ctl> }) {
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Mesh>(null);
  const armR = useRef<THREE.Mesh>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const hip = useRef(0.5);

  useFrame(({ clock }, dtRaw) => {
    const c = ctl.current;
    if (!c || !body.current || !head.current || !armL.current || !armR.current || !legL.current || !legR.current) return;
    const t = clock.elapsedTime;
    const dt = Math.min(dtRaw, 0.1);
    const seated = c.mode === "desk" || (c.mode === "spot" && c.sit);
    hip.current += ((seated ? 0.5 : 0.62) - hip.current) * Math.min(1, dt * 10);

    let bob = Math.sin(t * 1.6) * 0.01;
    let tilt = 0;
    let headX = 0;
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
      if (c.status === "working") {
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
    } else if (c.pose === "sip") {
      aR = -1.6 + Math.sin(t * 0.9) * 0.25;
      aL = seated ? -0.5 : 0;
      tilt = Math.sin(t * 0.7) * 0.06;
    } else if (c.pose === "eat") {
      aR = -1.0 + Math.sin(t * 3.2) * 0.45;
      aL = -0.9 + Math.sin(t * 3.2 + 1.4) * 0.3;
    } else if (c.pose === "nap") {
      headX = -0.45;
      aL = -0.3;
      aR = -0.3;
      bob = Math.sin(t * 1.2) * 0.012;
    }

    body.current.position.y = hip.current + bob;
    head.current.rotation.z = tilt;
    head.current.rotation.x = headX;
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
            <meshStandardMaterial color={SKIN} roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.07, -0.02]}>
            <sphereGeometry args={[0.2, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
            <meshStandardMaterial color="#2b2118" roughness={0.9} />
          </mesh>
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
type Roam = { claim: (l: LoungeId) => number; release: (l: LoungeId, i: number) => void; hour: () => number; fast: boolean };
type Phase = "seated" | "out" | "stay" | "back";
type Sim = { phase: Phase; s: number; route: Route | null; lounge: LoungeId | null; idx: number; spot: Spot | null; nextAt: number; leaveAt: number; heading: number };

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function Agent({ meta, st, onSelect, roam, locked }: { meta: AgentMeta; st: AgentState; onSelect: (id: AgentId) => void; roam: Roam; locked: boolean }) {
  const g = useRef<THREE.Group>(null);
  const ctl = useRef<Ctl>({ mode: "desk", pose: null, sit: true, status: st.status, running: false });
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

    const startBack = () => {
      S.phase = "back";
    };

    if (S.phase === "seated") {
      if (idle && now >= S.nextAt) {
        const hour = roam.hour();
        const first = pickLounge(hour, Math.random);
        const order = [first, ...(["tea", "dining", "gym", "rest"] as LoungeId[]).filter((l) => l !== first).sort(() => Math.random() - 0.5)];
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
      if (!idle) startBack();
      else if (S.route) {
        S.s += 1.5 * k * dt;
        if (S.s >= S.route.total) {
          S.s = S.route.total;
          S.phase = "stay";
          const pose = S.spot?.pose;
          S.leaveAt = now + (pose === "nap" ? rand(40, 70) : pose === "run" || pose === "lift" ? rand(35, 60) : rand(28, 50)) / k;
        }
      }
    } else if (S.phase === "stay") {
      if (!idle || now >= S.leaveAt) startBack();
    } else if (S.phase === "back" && S.route) {
      S.s -= 1.7 * (idle ? 1 : 1.6) * k * dt;
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
    // người tới nơi nhưng đang bị gọi về làm việc: nhả chỗ ngay khi đã rời phòng nghỉ
    if (S.phase === "back" && S.lounge && S.route && S.s < S.route.total - 0.5) {
      roam.release(S.lounge, S.idx);
      S.lounge = null;
    }

    // vị trí + hướng
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
      <mesh position={[0, 0.78, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, 0.07, 1.0]} />
        <meshStandardMaterial color="#fbfbfd" roughness={0.35} metalness={0.05} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (w / 2 - 0.08), 0.38, 0]} castShadow>
          <boxGeometry args={[0.05, 0.76, 0.85]} />
          <meshStandardMaterial color="#b9bfcc" metalness={0.6} roughness={0.35} />
        </mesh>
      ))}
      {(boss ? [-0.7, 0.7] : [0]).map((mx) => (
        <group key={mx} position={[mx, 0.82, -0.2]}>
          <mesh position={[0, 0.36, 0]} castShadow>
            <boxGeometry args={[0.9, 0.55, 0.03]} />
            <meshStandardMaterial color="#e9ebf0" metalness={0.3} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.37, 0.02]}>
            <planeGeometry args={[0.82, 0.46]} />
            <meshStandardMaterial color={screenColor} emissive={screenColor} emissiveIntensity={active ? 1.15 : 0.35} />
          </mesh>
          <mesh position={[0, 0.07, 0]}>
            <boxGeometry args={[0.06, 0.14, 0.05]} />
            <meshStandardMaterial color="#c9ced9" metalness={0.5} />
          </mesh>
          <mesh position={[0, 0.005, 0.02]}>
            <boxGeometry args={[0.34, 0.01, 0.2]} />
            <meshStandardMaterial color="#c9ced9" metalness={0.5} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.82, 0.2]}>
        <boxGeometry args={[0.55, 0.02, 0.18]} />
        <meshStandardMaterial color="#e7e9ef" />
      </mesh>
      {/* ghế (người ngồi do <Agent> vẽ) */}
      <group position={[0, 0, 0.95]}>
        <mesh position={[0, 0.45, 0]} castShadow>
          <boxGeometry args={[0.55, 0.08, 0.55]} />
          <meshStandardMaterial color="#2b3040" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.78, 0.27]} castShadow>
          <boxGeometry args={[0.52, 0.6, 0.06]} />
          <meshStandardMaterial color="#2b3040" roughness={0.5} />
        </mesh>
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
    m.position.y = 1.0 + Math.sin(t * Math.PI) * 2.6;
    m.rotation.y += 0.14;
    m.rotation.x += 0.1;
  });
  return (
    <mesh ref={ref} visible={false}>
      <octahedronGeometry args={[0.26]} />
      <meshStandardMaterial color="#ffffff" emissive={meta.color} emissiveIntensity={1.4} />
    </mesh>
  );
}

// ---------------------------------------------------------------- Tivi từng phòng
function drawTv(c: HTMLCanvasElement, name: string, color: string, lines: TvLine[] | null, chips: { n: string; s: AgentStatus }[], blink: boolean) {
  const x = c.getContext("2d");
  if (!x) return;
  const W = c.width;
  const H = c.height;
  const bg = x.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0b1226");
  bg.addColorStop(1, "#17203d");
  x.fillStyle = bg;
  x.fillRect(0, 0, W, H);
  x.fillStyle = color;
  x.fillRect(0, 0, W, 66);
  x.fillStyle = "#0b1226";
  x.font = 'bold 34px "Segoe UI", Arial, sans-serif';
  x.textBaseline = "middle";
  x.textAlign = "left";
  x.fillText(name.toUpperCase(), 24, 34);
  x.textAlign = "right";
  x.font = 'bold 22px "Segoe UI", Arial, sans-serif';
  x.fillText(blink ? "● TRỰC TIẾP" : "○ TRỰC TIẾP", W - 22, 34);
  x.textAlign = "left";
  const rows = lines ?? [{ k: "Đang tải số liệu…", v: "" }];
  rows.slice(0, 4).forEach((r, i) => {
    const y = 108 + i * 52;
    x.font = '24px "Segoe UI", Arial, sans-serif';
    x.fillStyle = "#aab6d6";
    x.textAlign = "left";
    x.fillText(r.k, 24, y);
    x.font = 'bold 34px "Segoe UI", Arial, sans-serif';
    x.fillStyle = r.warn ? "#fbbf24" : "#ffffff";
    x.textAlign = "right";
    x.fillText(r.v, W - 24, y);
    x.strokeStyle = "rgba(255,255,255,0.08)";
    x.beginPath();
    x.moveTo(24, y + 26);
    x.lineTo(W - 24, y + 26);
    x.stroke();
  });
  x.textAlign = "left";
  chips.forEach((ch, i) => {
    const cx = 24 + i * (W / 2 - 12);
    x.fillStyle = STATUS_DOT[ch.s];
    x.beginPath();
    x.arc(cx + 8, H - 26, 8, 0, TWO_PI);
    x.fill();
    x.font = '20px "Segoe UI", Arial, sans-serif';
    x.fillStyle = "#e2e8f0";
    x.fillText(`${ch.n}: ${STATUS_TEXT[ch.s]}`, cx + 24, H - 26);
  });
}

function makeTvTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { canvas, tex };
}

function redrawTv(c: HTMLCanvasElement, tex: THREE.Texture, name: string, color: string, lines: TvLine[] | null, chips: { n: string; s: AgentStatus }[], blink: boolean) {
  drawTv(c, name, color, lines, chips, blink);
  tex.needsUpdate = true;
}

function Tv({ d, data, states, onClick }: { d: DeptMeta; data: TvLine[] | null; states: States; onClick: (id: DeptId) => void }) {
  const [{ canvas, tex }] = useState(makeTvTexture);
  const last = useRef("");
  const chips = useMemo(
    () => AGENTS.filter((a) => a.dept === d.id).map((a) => ({ n: a.name, s: states[a.id].status })),
    [d.id, states]
  );

  useFrame(({ clock }) => {
    const blink = Math.floor(clock.elapsedTime) % 2 === 0;
    const sig = `${blink}|${JSON.stringify(data)}|${chips.map((c) => c.s).join()}`;
    if (sig === last.current) return;
    last.current = sig;
    redrawTv(canvas, tex, d.name, d.color, data, chips, blink);
  });

  return (
    <group position={[d.center[0], 1.75, d.center[1] - ROOM_D / 2 + 0.1]} onClick={(e) => (e.stopPropagation(), onClick(d.id))}>
      <RoundedBox args={[3.2, 1.85, 0.09]} radius={0.04} smoothness={3}>
        <meshStandardMaterial color="#0f1424" roughness={0.3} metalness={0.5} />
      </RoundedBox>
      <mesh position={[0, 0, 0.05]}>
        <planeGeometry args={[3.04, 1.71]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- cửa quẹt thẻ + đèn trạng thái
/** free = rảnh (xanh) · busy = đang nhận việc (cam) · error = lỗi (đỏ) · maint = đang cấu hình/chỉnh sửa (đỏ nhấp nháy + bảng WIP). */
type DoorState = "free" | "busy" | "error" | "maint";
const DOOR_COLOR: Record<DoorState, string> = { free: "#22c55e", busy: "#f97316", error: "#ef4444", maint: "#ef4444" };

function makeWipTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 320;
  const x = c.getContext("2d");
  if (x) {
    x.fillStyle = "#facc15";
    x.fillRect(0, 0, 512, 320);
    x.fillStyle = "#111827";
    for (let i = -320; i < 512; i += 56) {
      x.beginPath();
      x.moveTo(i, 0);
      x.lineTo(i + 28, 0);
      x.lineTo(i + 28 + 36, 36);
      x.lineTo(i + 36, 36);
      x.fill();
      x.beginPath();
      x.moveTo(i, 284);
      x.lineTo(i + 28, 284);
      x.lineTo(i + 28 + 36, 320);
      x.lineTo(i + 36, 320);
      x.fill();
    }
    x.fillStyle = "#111827";
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.font = 'bold 66px "Segoe UI", Arial, sans-serif';
    x.fillText("WORK IN", 256, 108);
    x.fillText("PROCESS", 256, 180);
    x.font = 'bold 28px "Segoe UI", Arial, sans-serif';
    x.fillText("Đang cấu hình · chỉnh sửa", 256, 246);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Cửa phòng ở mép nam: khung cửa, đầu đọc thẻ, đèn báo trên khung + đèn sàn trước cửa; khi chỉnh sửa có cửa kính đỏ + bảng WIP. */
function Door({ cx, cz, state }: { cx: number; cz: number; state: DoorState }) {
  const color = DOOR_COLOR[state];
  const led = useRef<THREE.MeshStandardMaterial>(null);
  const bar = useRef<THREE.MeshStandardMaterial>(null);
  const floor = useRef<THREE.MeshStandardMaterial>(null);
  const lamp = useRef<THREE.MeshStandardMaterial>(null);
  const [wip] = useState(makeWipTexture);

  useFrame(({ clock }) => {
    const on = state === "maint" ? (Math.sin(clock.elapsedTime * 7) > 0 ? 1 : 0.08) : 1;
    if (led.current) led.current.emissiveIntensity = 3 * on;
    if (bar.current) bar.current.emissiveIntensity = 2.4 * on;
    if (floor.current) floor.current.emissiveIntensity = 1.8 * on;
    if (lamp.current) lamp.current.emissiveIntensity = 3 * on;
  });

  return (
    <group position={[cx, 0, cz + ROOM_D / 2]}>
      {/* khung cửa */}
      {[-0.9, 0.9].map((x) => (
        <B key={x} p={[x, 1.1, 0]} s={[0.1, 2.2, 0.14]} c="#f5f7fb" metal={0.5} rough={0.3} />
      ))}
      <B p={[0, 2.25, 0]} s={[1.9, 0.16, 0.16]} c="#f5f7fb" metal={0.5} rough={0.3} />
      {/* đèn báo trên khung cửa */}
      <mesh position={[0, 2.25, 0.09]}>
        <boxGeometry args={[1.5, 0.06, 0.03]} />
        <meshStandardMaterial ref={bar} color={color} emissive={color} emissiveIntensity={2.4} />
      </mesh>
      {/* cửa kính đóng (chỉ khi đang chỉnh sửa) */}
      {state === "maint" && <B p={[0, 1.08, 0.02]} s={[1.7, 2.1, 0.04]} c="#fca5a5" op={0.42} rough={0.1} />}
      {/* đầu đọc thẻ bên phải cửa */}
      <group position={[1.12, 1.25, 0.06]}>
        <B p={[0, 0, 0]} s={[0.24, 0.44, 0.08]} c="#1f2937" metal={0.4} rough={0.4} />
        <B p={[0, 0.02, 0.045]} s={[0.15, 0.1, 0.01]} c="#93c5fd" emissive="#60a5fa" ei={1.2} />
        <B p={[0, -0.1, 0.045]} s={[0.13, 0.03, 0.012]} c="#e5e7eb" />
        <mesh position={[0, 0.16, 0.05]}>
          <sphereGeometry args={[0.05, 16, 16]} />
          <meshStandardMaterial ref={led} color={color} emissive={color} emissiveIntensity={3} />
        </mesh>
      </group>
      {/* cột đèn báo trước cửa (bên trái) */}
      <Cyl p={[-1.2, 0.7, 0.45]} r={0.03} h={1.4} c="#9aa3b5" seg={8} metal={0.6} />
      <mesh position={[-1.2, 1.5, 0.45]}>
        <sphereGeometry args={[0.15, 20, 20]} />
        <meshStandardMaterial ref={lamp} color={color} emissive={color} emissiveIntensity={3} />
      </mesh>
      {/* đèn sàn trước cửa */}
      <mesh position={[0, 0.055, 0.85]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.7, 40]} />
        <meshStandardMaterial ref={floor} color={color} emissive={color} emissiveIntensity={1.8} transparent opacity={0.85} />
      </mesh>
      {/* bảng WORK IN PROCESS */}
      {state === "maint" && (
        <group position={[1.9, 0, 0.9]} rotation={[0, -0.25, 0]}>
          {[-0.55, 0.55].map((x) => (
            <B key={x} p={[x, 0.45, -0.12]} s={[0.05, 0.9, 0.05]} c="#6b7280" metal={0.5} />
          ))}
          <mesh position={[0, 1.0, 0]} castShadow>
            <boxGeometry args={[1.4, 0.88, 0.05]} />
            <meshStandardMaterial color="#facc15" />
          </mesh>
          <mesh position={[0, 1.0, 0.03]}>
            <planeGeometry args={[1.34, 0.84]} />
            <meshBasicMaterial map={wip} toneMapped={false} />
          </mesh>
        </group>
      )}
    </group>
  );
}

// ---------------------------------------------------------------- phòng ban
/** Một PHÒNG BAN: thảm màu, vách sau trắng (có Tivi), vách kính bên trái, mở ra lối đi ở phía nam/đông. */
function Zone({ d, active, door, data, states, onTv }: { d: DeptMeta; active: boolean; door: DoorState; data: TvLine[] | null; states: States; onTv: (id: DeptId) => void }) {
  const [cx, cz] = d.center;
  const strip = (w: number, dd: number, x: number, z: number, key: string) => (
    <mesh key={key} position={[x, 0.045, z]}>
      <boxGeometry args={[w, 0.02, dd]} />
      <meshStandardMaterial color={d.color} emissive={d.color} emissiveIntensity={active ? 1.6 : 0.7} />
    </mesh>
  );
  return (
    <group>
      <RoundedBox args={[ROOM_W - 0.1, 0.05, ROOM_D - 0.1]} radius={0.2} smoothness={4} position={[cx, 0.03, cz]} receiveShadow>
        <meshStandardMaterial color={d.color} transparent opacity={active ? 0.36 : 0.22} roughness={0.5} />
      </RoundedBox>
      {strip(ROOM_W - 0.3, 0.05, cx, cz - ROOM_D / 2 + 0.08, "n")}
      {strip(ROOM_W - 0.3, 0.05, cx, cz + ROOM_D / 2 - 0.08, "s")}
      {strip(0.05, ROOM_D - 0.3, cx - ROOM_W / 2 + 0.08, cz, "w")}
      {strip(0.05, ROOM_D - 0.3, cx + ROOM_W / 2 - 0.08, cz, "e")}
      {/* vách sau (trắng) + dải màu phòng + Tivi */}
      <B p={[cx, 1.3, cz - ROOM_D / 2]} s={[ROOM_W, 2.6, 0.12]} c="#f7f8fc" rough={0.4} />
      <B p={[cx, 2.62, cz - ROOM_D / 2 + 0.01]} s={[ROOM_W + 0.02, 0.08, 0.14]} c={d.color} emissive={d.color} ei={active ? 1.6 : 0.8} />
      {/* vách kính bên trái */}
      <B p={[cx - ROOM_W / 2, 1.3, cz]} s={[0.05, 2.6, ROOM_D]} c="#cfe6ff" op={0.22} rough={0.1} />
      <B p={[cx - ROOM_W / 2, 1.3, cz + ROOM_D / 2]} s={[0.1, 2.6, 0.1]} c="#f5f7fb" metal={0.5} rough={0.3} />
      <Tv d={d} data={data} states={states} onClick={onTv} />
      <Door cx={cx} cz={cz} state={door} />
    </group>
  );
}

// ---------------------------------------------------------------- phòng nghỉ
function LoungeFurniture({ id }: { id: LoungeId }) {
  if (id === "tea") {
    return (
      <>
        <B p={[-2.55, 0.5, 0]} s={[0.6, 1.0, 3.2]} c="#f2efe8" rough={0.5} />
        <B p={[-2.55, 1.03, 0]} s={[0.7, 0.05, 3.3]} c="#3b3f4d" />
        <B p={[-2.55, 1.32, -0.7]} s={[0.32, 0.5, 0.42]} c="#374151" metal={0.4} />
        <B p={[-2.37, 1.42, -0.7]} s={[0.02, 0.06, 0.06]} c="#ef4444" emissive="#ef4444" />
        <Cyl p={[-2.55, 1.2, 0.5]} r={0.12} h={0.35} c="#d4d8e2" metal={0.6} />
        {[0.9, 1.3].map((z) => (
          <Cyl key={z} p={[-2.5, 1.1, z]} r={0.05} h={0.1} c="#ffffff" />
        ))}
        {[-0.7, 0.9].map((z) => (
          <group key={z}>
            <Cyl p={[1.2, 0.55, z]} r={0.46} h={0.05} c="#fbfbfd" rough={0.35} />
            <Cyl p={[1.2, 0.27, z]} r={0.05} h={0.55} c="#b9bfcc" seg={8} metal={0.6} />
            <Cyl p={[2.0, 0.22, z]} r={0.22} h={0.45} c="#2dd4bf" rough={0.6} />
            <Cyl p={[1.2, 0.62, z]} r={0.05} h={0.08} c="#ffffff" />
          </group>
        ))}
        <Plant position={[-2.3, 0, 2.1]} />
      </>
    );
  }
  if (id === "dining") {
    return (
      <>
        <B p={[0, 0.75, 0.05]} s={[3.4, 0.07, 0.9]} c="#d9b98a" rough={0.5} />
        {[-1.5, 1.5].map((x) => (
          <B key={x} p={[x, 0.37, 0.05]} s={[0.06, 0.74, 0.7]} c="#b9bfcc" metal={0.6} rough={0.35} />
        ))}
        {[-1.0, 0, 1.0].map((x) => (
          <Cyl key={x} p={[x, 0.83, 0.05]} r={0.13} h={0.07} c="#ffffff" />
        ))}
        <Chair p={[-0.9, 0, -0.95]} back={-1} />
        <Chair p={[0.9, 0, -0.95]} back={-1} />
        <Chair p={[-0.9, 0, 1.05]} back={1} />
        <Chair p={[0.9, 0, 1.05]} back={1} />
        <B p={[-2.7, 0.5, 0]} s={[0.5, 1.0, 2.4]} c="#f2efe8" />
        <B p={[-2.7, 1.03, 0]} s={[0.6, 0.05, 2.5]} c="#3b3f4d" />
        {[-0.7, 0, 0.7].map((z, i) => (
          <Cyl key={z} p={[-2.7, 1.12, z]} r={0.15} h={0.12} c={["#f59e0b", "#84cc16", "#ef4444"][i]} />
        ))}
        <Plant position={[2.4, 0, 2.0]} />
      </>
    );
  }
  if (id === "gym") {
    return (
      <>
        {[-2.0, -0.9].map((x) => (
          <group key={x}>
            <B p={[x, 0.09, 0]} s={[0.8, 0.14, 1.7]} c="#2a2f3e" />
            <B p={[x, 0.18, 0.05]} s={[0.62, 0.03, 1.45]} c="#111827" rough={0.8} />
            {[-0.32, 0.32].map((dx) => (
              <B key={dx} p={[x + dx, 0.65, -0.75]} s={[0.05, 1.1, 0.05]} c="#9aa3b5" metal={0.6} />
            ))}
            <B p={[x, 1.18, -0.78]} s={[0.7, 0.26, 0.1]} c="#1f2937" />
            <B p={[x, 1.18, -0.72]} s={[0.55, 0.16, 0.02]} c="#60a5fa" emissive="#60a5fa" ei={1.6} />
          </group>
        ))}
        <B p={[2.65, 0.45, 0]} s={[0.5, 0.9, 2.2]} c="#2a2f3e" />
        {[-0.7, -0.2, 0.3, 0.8].map((z, i) => (
          <mesh key={z} position={[2.55, 1.0, z]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.1 + i * 0.015, 0.1 + i * 0.015, 0.4, 12]} />
            <meshStandardMaterial color="#6b7280" metalness={0.7} roughness={0.3} />
          </mesh>
        ))}
        <B p={[0.4, 0.04, 1.6]} s={[0.7, 0.03, 1.8]} c="#93c5fd" rough={0.8} />
        <B p={[0, 1.3, -2.38]} s={[3.4, 1.9, 0.03]} c="#dbeafe" op={0.4} rough={0.05} metal={0.5} />
      </>
    );
  }
  return (
    <>
      {[-1, 1].map((sd) => (
        <group key={sd} position={[sd * 1.85, 0, -1.9]}>
          <B p={[0, 0.28, 0]} s={[1.8, 0.4, 0.8]} c="#a5b4fc" rough={0.8} />
          <B p={[0, 0.7, -0.36]} s={[1.8, 0.55, 0.14]} c="#818cf8" rough={0.8} />
          <B p={[-0.92, 0.45, 0]} s={[0.1, 0.5, 0.8]} c="#818cf8" rough={0.8} />
          <B p={[0.92, 0.45, 0]} s={[0.1, 0.5, 0.8]} c="#818cf8" rough={0.8} />
        </group>
      ))}
      <B p={[0, 0.3, 0.5]} s={[1.1, 0.06, 0.6]} c="#ffffff" />
      <Cyl p={[0, 0.15, 0.5]} r={0.05} h={0.3} c="#b9bfcc" seg={8} metal={0.6} />
      {[-1.7, 1.7].map((x, i) => (
        <mesh key={x} position={[x, 0.3, 1.2]} scale={[1, 0.7, 1]} castShadow>
          <sphereGeometry args={[0.45, 20, 16]} />
          <meshStandardMaterial color={i ? "#fda4af" : "#fde68a"} roughness={0.9} />
        </mesh>
      ))}
      <Cyl p={[2.6, 0.9, 1.7]} r={0.03} h={1.8} c="#9aa3b5" seg={8} metal={0.6} />
      <mesh position={[2.6, 1.85, 1.7]}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial color="#fff7d6" emissive="#fde68a" emissiveIntensity={1.6} />
      </mesh>
      <Plant position={[-2.5, 0, 1.9]} />
    </>
  );
}

function Lounge({ l }: { l: LoungeMeta }) {
  const [cx, cz] = l.center;
  const wall = (w: number, x: number) => <B key={x} p={[x, 1.3, -ROOM_D / 2]} s={[w, 2.6, 0.05]} c="#cfe6ff" op={0.22} rough={0.1} />;
  return (
    <group position={[cx, 0, cz]}>
      <RoundedBox args={[ROOM_W - 0.1, 0.05, ROOM_D - 0.1]} radius={0.2} smoothness={4} position={[0, 0.03, 0]} receiveShadow>
        <meshStandardMaterial color={l.color} transparent opacity={0.24} roughness={0.5} />
      </RoundedBox>
      {[
        [ROOM_W - 0.3, 0.05, 0, ROOM_D / 2 - 0.08],
        [0.05, ROOM_D - 0.3, -ROOM_W / 2 + 0.08, 0],
        [0.05, ROOM_D - 0.3, ROOM_W / 2 - 0.08, 0],
      ].map(([w, d, x, z]) => (
        <mesh key={`${x}${z}`} position={[x, 0.045, z]}>
          <boxGeometry args={[w, 0.02, d]} />
          <meshStandardMaterial color={l.color} emissive={l.color} emissiveIntensity={0.7} />
        </mesh>
      ))}
      {/* vách kính phía sau có cửa ở giữa + vách kính bên trái */}
      {wall(2.1, -1.95)}
      {wall(2.1, 1.95)}
      <B p={[-ROOM_W / 2, 1.3, 0]} s={[0.05, 2.6, ROOM_D]} c="#cfe6ff" op={0.22} rough={0.1} />
      <B p={[0, 2.62, -ROOM_D / 2]} s={[ROOM_W, 0.08, 0.1]} c={l.color} emissive={l.color} ei={0.9} />
      {[-0.9, 0.9].map((x) => (
        <B key={x} p={[x, 1.3, -ROOM_D / 2]} s={[0.08, 2.6, 0.08]} c="#f5f7fb" metal={0.5} rough={0.3} />
      ))}
      <LoungeFurniture id={l.id} />
    </group>
  );
}

// ---------------------------------------------------------------- sảnh, sàn, tường
function LogoSigns() {
  const light = useTexture("/logo-tho-light.png");
  const dark = useTexture("/logo-tho-dark.png");
  useEffect(() => {
    for (const t of [light, dark]) {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
    }
  }, [light, dark]);
  return (
    <>
      {/* bảng logo trên tường kính phía sau */}
      <group position={[0, 3.35, -9.62]}>
        <RoundedBox args={[5.4, 1.9, 0.14]} radius={0.12} smoothness={4}>
          <meshStandardMaterial color="#12162b" roughness={0.4} metalness={0.3} />
        </RoundedBox>
        <mesh position={[0, 0, 0.09]}>
          <planeGeometry args={[1.6 * LOGO_RATIO * 1.1, 1.6 * 1.1]} />
          <meshBasicMaterial map={light} transparent toneMapped={false} />
        </mesh>
        {[-2.6, 2.6].map((x) => (
          <mesh key={x} position={[x, 0, 0.09]}>
            <boxGeometry args={[0.05, 1.7, 0.03]} />
            <meshStandardMaterial color="#7c5cff" emissive="#7c5cff" emissiveIntensity={2} />
          </mesh>
        ))}
      </group>
      {/* thảm sảnh tròn + logo */}
      <mesh position={[0, 0.05, 0]} receiveShadow>
        <cylinderGeometry args={[2.5, 2.5, 0.08, 64]} />
        <meshStandardMaterial color="#ffffff" roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.095, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3.2 * LOGO_RATIO, 3.2]} />
        <meshBasicMaterial map={dark} transparent toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.36, 2.48, 64]} />
        <meshStandardMaterial color="#7c5cff" emissive="#7c5cff" emissiveIntensity={1.6} />
      </mesh>
    </>
  );
}

const FLOOR_Z0 = -9.75;
const FLOOR_Z1 = 16.75;
const FLOOR_CZ = (FLOOR_Z0 + FLOOR_Z1) / 2;
const FLOOR_D = FLOOR_Z1 - FLOOR_Z0;

function Hall() {
  const mullionsX = [-15, -10, -5, 0, 5, 10, 15];
  const mullionsZ = [-9, -3, 3, 9, 15];
  return (
    <>
      <mesh position={[0, -0.05, FLOOR_CZ]} receiveShadow>
        <boxGeometry args={[31, 0.1, FLOOR_D]} />
        <meshStandardMaterial color="#eef0f6" roughness={0.28} metalness={0.06} />
      </mesh>
      <Grid
        position={[0, 0.011, FLOOR_CZ]}
        args={[31, FLOOR_D]}
        cellSize={1}
        cellThickness={0.4}
        cellColor="#dfe3ee"
        sectionSize={5}
        sectionThickness={0.8}
        sectionColor="#ccd3e6"
        fadeDistance={120}
        infiniteGrid={false}
      />
      {/* lối đi: hành lang ngang (giữa 2 hàng phòng ban · trước hàng phòng nghỉ) + 3 hành lang dọc */}
      {[LANE_M, LANE_S].map((z) => (
        <mesh key={z} position={[0, 0.02, z]}>
          <boxGeometry args={[30, 0.01, 1.4]} />
          <meshStandardMaterial color="#e3e7f3" roughness={0.4} />
        </mesh>
      ))}
      {CORRIDORS.map((x) => (
        <mesh key={x} position={[x, 0.02, 3.2]}>
          <boxGeometry args={[0.8, 0.01, 17]} />
          <meshStandardMaterial color="#e3e7f3" roughness={0.4} />
        </mesh>
      ))}
      {/* tường kính sau + trái */}
      <mesh position={[0, 1.8, -9.85]}>
        <boxGeometry args={[31, 3.6, 0.05]} />
        <meshStandardMaterial color="#bfdcff" transparent opacity={0.2} roughness={0.05} />
      </mesh>
      <mesh position={[-15.6, 1.8, FLOOR_CZ]}>
        <boxGeometry args={[0.05, 3.6, FLOOR_D + 0.2]} />
        <meshStandardMaterial color="#bfdcff" transparent opacity={0.2} roughness={0.05} />
      </mesh>
      {mullionsX.map((x) => (
        <mesh key={`b${x}`} position={[x, 1.8, -9.85]}>
          <boxGeometry args={[0.1, 3.6, 0.1]} />
          <meshStandardMaterial color="#f5f7fb" metalness={0.5} roughness={0.3} />
        </mesh>
      ))}
      {mullionsZ.map((z) => (
        <mesh key={`l${z}`} position={[-15.6, 1.8, z]}>
          <boxGeometry args={[0.1, 3.6, 0.1]} />
          <meshStandardMaterial color="#f5f7fb" metalness={0.5} roughness={0.3} />
        </mesh>
      ))}
      <mesh position={[0, 3.62, -9.85]}>
        <boxGeometry args={[31, 0.12, 0.14]} />
        <meshStandardMaterial color="#f5f7fb" metalness={0.5} roughness={0.3} />
      </mesh>
      <Plant position={[-14.4, 0, -8.9]} />
      <Plant position={[14.4, 0, -8.9]} />
      <Plant position={[-14.4, 0, 16]} />
      <Plant position={[14.4, 0, 16]} />
      <Plant position={[-9, 0, 1.9]} />
      <Plant position={[9, 0, 1.9]} />
    </>
  );
}


export default function Office3D({
  states,
  selected,
  onSelect,
  tv,
  onTvClick,
  maint,
}: {
  states: States;
  selected: AgentId | null;
  onSelect: (id: AgentId | null) => void;
  tv: TvData | null;
  onTvClick: (id: DeptId) => void;
  /** Phòng nào đang được cấu hình/chỉnh sửa (đèn cửa đỏ nhấp nháy + bảng Work in Process, AI trong phòng không đi đâu). */
  maint: Partial<Record<DeptId, boolean>>;
}) {
  const occupancy = useRef<Record<LoungeId, boolean[]>>({
    tea: [false, false, false, false],
    dining: [false, false, false, false],
    gym: [false, false, false, false],
    rest: [false, false, false, false],
  });
  const [opts] = useState(() => {
    const q = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
    const h = q.get("hour");
    return { hour: h === null || h === "" ? null : Number(h), fast: q.get("fast") === "1" };
  });

  const roam = useMemo<Roam>(
    () => ({
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
        camera={{ position: [20.5, 20, 25], zoom: 22, near: -100, far: 200 }}
        onPointerMissed={() => onSelect(null)}
        style={{ background: "linear-gradient(180deg,#dbe8ff 0%,#f6f8fd 100%)" }}
      >
        <ambientLight intensity={1.15} />
        <hemisphereLight args={["#ffffff", "#c9d6f2", 0.6]} />
        <directionalLight
          position={[10, 18, 14]}
          intensity={1.3}
          color="#fffaf0"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-28}
          shadow-camera-right={28}
          shadow-camera-top={28}
          shadow-camera-bottom={-28}
          shadow-bias={-0.0004}
        />
        <Hall />
        <Suspense fallback={null}>
          <LogoSigns />
        </Suspense>
        {DEPTS.map((d) => (
          <Zone key={d.id} d={d} active={deptActive(d.id)} door={doorState(d.id)} data={tv ? tv[d.id] : null} states={states} onTv={onTvClick} />
        ))}
        {LOUNGES.map((l) => (
          <Lounge key={l.id} l={l} />
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
        <OrbitControls makeDefault enableDamping minZoom={12} maxZoom={90} maxPolarAngle={Math.PI / 2.2} target={[2, 0.8, 3.5]} />
      </Canvas>
    </div>
  );
}
