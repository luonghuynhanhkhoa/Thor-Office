"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Grid, RoundedBox, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { AGENTS, type AgentState, type AgentStatus, type DeptId, type DeptMeta, type AgentId } from "@/lib/agentsMeta";
import { WORKROOMS, WORLD, type StaffRole } from "@/lib/layout";
import type { TvLine } from "@/lib/tv";
import { formatDong, staffLook, type BoardKind, type CasesToday, type DutyStaff, type SalerSales, type SalesToday } from "@/lib/dutyTypes";
import { B, Ball, Chair, Cyl, Plant, STATUS_DOT, STATUS_TEXT, TWO_PI, Tree } from "@/components/sceneKit";

/**
 * Các CÔNG TRÌNH tĩnh của khuôn viên: phòng ban (vách sau có Tivi, cửa quẹt thẻ), Tổng Hành Dinh (khu đặc biệt),
 * quán Trà & Ăn, phòng Gym, phòng Nghỉ, phòng Họp, sân đường và cây xanh. Mỗi khu đứng riêng, cách nhau bằng lối đi/sân cây.
 */
type States = Record<AgentId, AgentState>;
const LOGO_RATIO = 367 / 510;

function prepTexture(t: THREE.Texture) {
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
}

function makeCanvasTexture(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d");
  if (x) draw(x);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
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

function Tv({ d, data, states, onClick, scale = 1 }: { d: DeptMeta; data: TvLine[] | null; states: States; onClick: (id: DeptId) => void; scale?: number }) {
  const [{ canvas, tex }] = useState(makeTvTexture);
  const last = useRef("");
  const chips = useMemo(() => AGENTS.filter((a) => a.dept === d.id).map((a) => ({ n: a.name, s: states[a.id].status })), [d.id, states]);

  useFrame(({ clock }) => {
    const blink = Math.floor(clock.elapsedTime) % 2 === 0;
    const sig = `${blink}|${JSON.stringify(data)}|${chips.map((c) => c.s).join()}`;
    if (sig === last.current) return;
    last.current = sig;
    redrawTv(canvas, tex, d.name, d.color, data, chips, blink);
  });

  return (
    <group position={[d.center[0], 1.75, d.center[1] - d.size[1] / 2 + 0.1]} scale={scale} onClick={(e) => (e.stopPropagation(), onClick(d.id))}>
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
export type DoorState = "free" | "busy" | "error" | "maint";
const DOOR_COLOR: Record<DoorState, string> = { free: "#22c55e", busy: "#f97316", error: "#ef4444", maint: "#ef4444" };

function Door({ cx, cz, depth, state }: { cx: number; cz: number; depth: number; state: DoorState }) {
  const color = DOOR_COLOR[state];
  const led = useRef<THREE.MeshStandardMaterial>(null);
  const bar = useRef<THREE.MeshStandardMaterial>(null);
  const lamp = useRef<THREE.MeshStandardMaterial>(null);
  const [wip] = useState(() =>
    makeCanvasTexture(512, 320, (x) => {
      x.fillStyle = "#facc15";
      x.fillRect(0, 0, 512, 320);
      x.fillStyle = "#111827";
      for (let i = -320; i < 512; i += 56) {
        for (const y0 of [0, 284]) {
          x.beginPath();
          x.moveTo(i, y0);
          x.lineTo(i + 28, y0);
          x.lineTo(i + 64, y0 + 36);
          x.lineTo(i + 36, y0 + 36);
          x.fill();
        }
      }
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.font = 'bold 66px "Segoe UI", Arial, sans-serif';
      x.fillText("WORK IN", 256, 108);
      x.fillText("PROCESS", 256, 180);
      x.font = 'bold 28px "Segoe UI", Arial, sans-serif';
      x.fillText("Đang cấu hình · chỉnh sửa", 256, 246);
    })
  );

  useFrame(({ clock }) => {
    const on = state === "maint" ? (Math.sin(clock.elapsedTime * 7) > 0 ? 1 : 0.08) : 1;
    if (led.current) led.current.emissiveIntensity = 3 * on;
    if (bar.current) bar.current.emissiveIntensity = 2.4 * on;
    if (lamp.current) lamp.current.emissiveIntensity = 3 * on;
  });

  return (
    <group position={[cx, 0, cz + depth / 2]}>
      {[-0.9, 0.9].map((x) => (
        <B key={x} p={[x, 1.1, 0]} s={[0.1, 2.2, 0.14]} c="#f5f7fb" metal={0.5} rough={0.3} />
      ))}
      <B p={[0, 2.25, 0]} s={[1.9, 0.16, 0.16]} c="#f5f7fb" metal={0.5} rough={0.3} />
      <mesh position={[0, 2.25, 0.09]}>
        <boxGeometry args={[1.5, 0.06, 0.03]} />
        <meshStandardMaterial ref={bar} color={color} emissive={color} emissiveIntensity={2.4} />
      </mesh>
      {state === "maint" && <B p={[0, 1.08, 0.02]} s={[1.7, 2.1, 0.04]} c="#fca5a5" op={0.42} rough={0.1} />}
      <group position={[1.12, 1.25, 0.06]}>
        <B p={[0, 0, 0]} s={[0.24, 0.44, 0.08]} c="#1f2937" metal={0.4} rough={0.4} />
        <B p={[0, 0.02, 0.045]} s={[0.15, 0.1, 0.01]} c="#93c5fd" emissive="#60a5fa" ei={1.2} />
        <B p={[0, -0.1, 0.045]} s={[0.13, 0.03, 0.012]} c="#e5e7eb" />
        <mesh position={[0, 0.16, 0.05]}>
          <sphereGeometry args={[0.05, 16, 16]} />
          <meshStandardMaterial ref={led} color={color} emissive={color} emissiveIntensity={3} />
        </mesh>
      </group>
      <Cyl p={[-1.2, 0.7, 0.45]} r={0.03} h={1.4} c="#9aa3b5" seg={8} metal={0.6} />
      <mesh position={[-1.2, 1.5, 0.45]}>
        <sphereGeometry args={[0.15, 20, 20]} />
        <meshStandardMaterial ref={lamp} color={color} emissive={color} emissiveIntensity={3} />
      </mesh>
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

// ---------------------------------------------------------------- vách ngắn (che tầm nhìn từ ngoài vào)
/** Vách ngắn ở 2 cạnh mở (đông + nam, chừa cửa ở giữa cạnh nam): nửa dưới đặc, nửa trên kính mờ, mép trên có dải màu. */
function Partitions({ cx, cz, W, D, color, gap = 0.95 }: { cx: number; cz: number; W: number; D: number; color: string; gap?: number }) {
  const seg = (key: string, x: number, z: number, w: number, d: number) => (
    <group key={key} position={[x, 0, z]}>
      <B p={[0, 0.3, 0]} s={[w, 0.6, d]} c="#f4f6fb" rough={0.5} />
      <B p={[0, 0.88, 0]} s={[w, 0.56, d * 0.7]} c="#e6edf9" op={0.5} rough={0.2} />
      <B p={[0, 1.18, 0]} s={[w + 0.02, 0.05, d + 0.04]} c={color} emissive={color} ei={0.6} />
    </group>
  );
  const half = W / 2 - gap;
  return (
    <>
      {seg("e", cx + W / 2 - 0.05, cz, 0.1, D)}
      {seg("sl", cx - (W / 2 + gap) / 2, cz + D / 2 - 0.05, half, 0.1)}
      {seg("sr", cx + (W / 2 + gap) / 2, cz + D / 2 - 0.05, half, 0.1)}
    </>
  );
}

// ---------------------------------------------------------------- phòng ban
/** Tổng Hành Dinh: khu ĐẶC BIỆT — viền vàng, 4 cột kính, logo Thỏ lớn trên sàn trước bàn Chỉ huy. */
function HqDecor({ d }: { d: DeptMeta }) {
  const [cx, cz] = d.center;
  const [W, D] = d.size;
  const dark = useTexture("/logo-tho-dark.png");
  useEffect(() => prepTexture(dark), [dark]);
  return (
    <group>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => (
        <group key={`${sx}${sz}`} position={[cx + sx * (W / 2 - 0.25), 0, cz + sz * (D / 2 - 0.25)]}>
          <Cyl p={[0, 1.4, 0]} r={0.16} h={2.8} c="#e8f1ff" rough={0.1} metal={0.4} />
          <Cyl p={[0, 2.85, 0]} r={0.24} h={0.12} c="#fbbf24" emissive="#fbbf24" metal={0.6} />
        </group>
      ))}
      <mesh position={[cx, 0.07, cz + 1.9]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.7, 48]} />
        <meshStandardMaterial color="#ffffff" roughness={0.3} />
      </mesh>
      <mesh position={[cx, 0.085, cz + 1.9]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.3 * LOGO_RATIO, 2.3]} />
        <meshBasicMaterial map={dark} transparent toneMapped={false} />
      </mesh>
      {[-1, 1].map((s) => (
        <B key={s} p={[cx + s * (W / 2 - 0.08), 0.06, cz]} s={[0.12, 0.03, D - 0.2]} c="#fbbf24" emissive="#fbbf24" ei={1.4} />
      ))}
    </group>
  );
}

function Zone({ d, active, door, data, states, onTv }: { d: DeptMeta; active: boolean; door: DoorState; data: TvLine[] | null; states: States; onTv: (id: DeptId) => void }) {
  const [cx, cz] = d.center;
  const [W, D] = d.size;
  const special = d.id === "hq";
  const strip = (w: number, dd: number, x: number, z: number, key: string) => (
    <mesh key={key} position={[x, 0.045, z]}>
      <boxGeometry args={[w, 0.02, dd]} />
      <meshStandardMaterial color={d.color} emissive={d.color} emissiveIntensity={active ? 1.6 : 0.7} />
    </mesh>
  );
  return (
    <group>
      <RoundedBox args={[W - 0.1, 0.05, D - 0.1]} radius={0.2} smoothness={4} position={[cx, 0.03, cz]} receiveShadow>
        <meshStandardMaterial color={d.color} transparent opacity={active ? 0.36 : 0.22} roughness={0.5} />
      </RoundedBox>
      {strip(W - 0.3, 0.05, cx, cz - D / 2 + 0.08, "n")}
      {strip(W - 0.3, 0.05, cx, cz + D / 2 - 0.08, "s")}
      {strip(0.05, D - 0.3, cx - W / 2 + 0.08, cz, "w")}
      {strip(0.05, D - 0.3, cx + W / 2 - 0.08, cz, "e")}
      <B p={[cx, 1.3, cz - D / 2]} s={[W, 2.6, 0.12]} c={special ? "#262b44" : "#f7f8fc"} rough={0.4} />
      <B p={[cx, 2.62, cz - D / 2 + 0.01]} s={[W + 0.02, 0.08, 0.14]} c={d.color} emissive={d.color} ei={active ? 1.6 : 0.8} />
      <B p={[cx - W / 2, 1.3, cz]} s={[0.05, 2.6, D]} c="#cfe6ff" op={0.22} rough={0.1} />
      <B p={[cx - W / 2, 1.3, cz + D / 2]} s={[0.1, 2.6, 0.1]} c="#f5f7fb" metal={0.5} rough={0.3} />
      <Tv d={d} data={data} states={states} onClick={onTv} scale={special ? 1.2 : 1} />
      <Door cx={cx} cz={cz} depth={D} state={door} />
      <Partitions cx={cx} cz={cz} W={W} D={D} color={d.color} />
      {special && (
        <Suspense fallback={null}>
          <HqDecor d={d} />
        </Suspense>
      )}
    </group>
  );
}

// ---------------------------------------------------------------- khu nghỉ / họp
const GLASS = "#cfe6ff";

/** Quán Trà & Ăn: một quán hiện đại — quầy bar cà phê (tây) và khu bàn ăn (tây bắc), biển neon. Tâm (-10, 19.5), 16×7. */
function Restaurant() {
  const neon = useMemo(
    () =>
      makeCanvasTexture(512, 128, (x) => {
        x.clearRect(0, 0, 512, 128);
        x.font = 'bold 64px "Segoe UI", Arial, sans-serif';
        x.textAlign = "center";
        x.textBaseline = "middle";
        x.shadowColor = "#2dd4bf";
        x.shadowBlur = 24;
        x.fillStyle = "#c7fff3";
        x.fillText("CAFÉ & BISTRO", 256, 66);
      }),
    []
  );
  const table = (x: number, z: number, key: string) => (
    <group key={key} position={[x, 0, z]}>
      <B p={[0, 0.72, 0]} s={[1.2, 0.06, 0.9]} c="#f6f1e7" rough={0.4} />
      <Cyl p={[0, 0.36, 0]} r={0.05} h={0.72} c="#b9bfcc" seg={8} metal={0.6} />
      <Cyl p={[0, 0.82, 0]} r={0.05} h={0.14} c="#fb7185" />
    </group>
  );
  return (
    <group position={[-10, 0, 19.5]}>
      <B p={[0, 0.03, 0]} s={[15.8, 0.05, 6.8]} c="#d9b98c" rough={0.55} />
      <B p={[-4, 0.06, 0]} s={[7.6, 0.02, 6.4]} c="#fb7185" op={0.18} />
      <B p={[4.5, 0.06, 0]} s={[7, 0.02, 6.4]} c="#2dd4bf" op={0.18} />
      {/* tường sau (bắc) có cửa ở giữa, tường tây, dải đèn */}
      {[-4.45, 4.45].map((x) => (
        <B key={x} p={[x, 1.3, -3.5]} s={[7.1, 2.6, 0.12]} c="#2f3542" rough={0.5} />
      ))}
      {[-0.9, 0.9].map((x) => (
        <B key={x} p={[x, 1.3, -3.5]} s={[0.08, 2.6, 0.12]} c="#f5f7fb" metal={0.5} rough={0.3} />
      ))}
      <B p={[-8, 1.3, 0]} s={[0.12, 2.6, 7]} c="#2f3542" rough={0.5} />
      <B p={[0, 2.64, -3.5]} s={[16, 0.07, 0.14]} c="#2dd4bf" emissive="#2dd4bf" ei={1.2} />
      <mesh position={[-7.92, 2.0, 0.6]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[3.6, 0.9]} />
        <meshBasicMaterial map={neon} transparent toneMapped={false} />
      </mesh>
      <B p={[-7.92, 1.5, -2.3]} s={[0.05, 1.0, 1.3]} c="#1f2937" />
      {/* kính chắn thấp phía đông và nam (mặt tiền quán) */}
      <B p={[8, 0.5, 0]} s={[0.05, 1.0, 7]} c={GLASS} op={0.25} rough={0.1} />
      <B p={[0, 0.5, 3.5]} s={[16, 1.0, 0.05]} c={GLASS} op={0.25} rough={0.1} />

      {/* QUẦY BAR cà phê (khu Trà) */}
      <B p={[4.5, 0.55, -2.7]} s={[4.2, 1.1, 0.7]} c="#f4efe6" rough={0.45} />
      <B p={[4.5, 1.12, -2.7]} s={[4.3, 0.06, 0.8]} c="#3b3f4d" />
      <B p={[4.5, 1.9, -3.38]} s={[4.0, 0.06, 0.3]} c="#c9a27a" />
      {[3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0].map((x, i) => (
        <Cyl key={x} p={[x, 2.05, -3.38]} r={0.06} h={0.3} c={["#60a5fa", "#fbbf24", "#34d399", "#f472b6", "#a78bfa", "#fb923c", "#2dd4bf"][i]} seg={10} />
      ))}
      <B p={[5.7, 1.45, -2.7]} s={[0.55, 0.45, 0.4]} c="#9aa3b5" metal={0.6} rough={0.3} />
      <B p={[5.7, 1.62, -2.48]} s={[0.1, 0.05, 0.02]} c="#ef4444" emissive="#ef4444" />
      <B p={[3.0, 1.35, -2.7]} s={[0.9, 0.4, 0.5]} c={GLASS} op={0.45} />
      <Cyl p={[4.1, 1.22, -2.7]} r={0.1} h={0.16} c="#ffffff" />
      {[3.5, 5.5].map((x) => (
        <group key={x}>
          <Cyl p={[x, 0.26, -1.7]} r={0.22} h={0.52} c="#2dd4bf" rough={0.6} />
          <Cyl p={[x, 0.5, -1.7]} r={0.24} h={0.06} c="#1f2937" />
        </group>
      ))}
      {table(4.5, 0.8, "t1")}
      {[3.65, 5.35].map((x) => (
        <Cyl key={x} p={[x, 0.24, 0.8]} r={0.2} h={0.48} c="#fbbf24" rough={0.6} />
      ))}
      {table(7.0, 0.8, "t2")}
      {[6.3, 7.7].map((x) => (
        <Cyl key={x} p={[x, 0.24, 0.8]} r={0.2} h={0.48} c="#fbbf24" rough={0.6} />
      ))}
      {[3.5, 5.5].map((x) => (
        <group key={`l${x}`}>
          <Cyl p={[x, 2.95, -2.5]} r={0.012} h={0.8} c="#9aa3b5" seg={6} />
          <Ball p={[x, 2.45, -2.5]} r={0.17} c="#fff3c4" emissive="#fbbf24" ei={1.6} />
        </group>
      ))}

      {/* KHU BÀN ĂN (khu Ăn) */}
      {table(-5.2, -0.3, "a")}
      {table(-2.6, -0.3, "b")}
      {table(-5.2, 2.2, "c")}
      {table(-2.6, 2.2, "d")}
      {[-5.2, -2.6].map((x) => (
        <group key={x}>
          <Chair p={[x, 0, -1.1]} back={-1} c="#fb7185" />
          <Chair p={[x, 0, 0.5]} back={1} c="#fb7185" />
          <Chair p={[x, 0, 1.4]} back={-1} c="#fda4af" />
          <Chair p={[x, 0, 3.0]} back={1} c="#fda4af" />
        </group>
      ))}
      <B p={[-7.5, 0.35, -1.5]} s={[0.6, 0.5, 2.6]} c="#e11d48" rough={0.7} />
      <B p={[-7.8, 0.8, -1.5]} s={[0.1, 0.6, 2.6]} c="#be123c" rough={0.7} />
      {[-5.2, -2.6].map((x) => (
        <group key={`p${x}`}>
          <Cyl p={[x, 2.95, -0.3]} r={0.012} h={0.8} c="#9aa3b5" seg={6} />
          <Ball p={[x, 2.45, -0.3]} r={0.17} c="#fff3c4" emissive="#fbbf24" ei={1.6} />
        </group>
      ))}
      <Plant position={[-7.3, 0, 3.0]} scale={0.8} />
      <Plant position={[7.3, 0, -2.8]} scale={0.8} />
    </group>
  );
}

function Barbell({ p }: { p: [number, number, number] }) {
  return (
    <group position={p}>
      <Cyl p={[0, 0, 0]} r={0.02} h={1.7} c="#cbd5e1" seg={8} metal={0.8} rot={[0, 0, Math.PI / 2]} />
      {[-0.75, 0.75].map((x) => (
        <Cyl key={x} p={[x, 0, 0]} r={0.2} h={0.07} c="#111827" seg={20} rot={[0, 0, Math.PI / 2]} />
      ))}
    </group>
  );
}

/** Phòng Gym thực thụ: máy chạy bộ, tạ đơn + ghế đẩy tạ, giàn squat, máy cáp, xe đạp, bao đấm, thảm yoga, tủ đồ, gương. Tâm (10, 19.5), 12×7. */
function Gym() {
  return (
    <group position={[10, 0, 19.5]}>
      <B p={[0, 0.03, 0]} s={[11.8, 0.05, 6.8]} c="#3a4254" rough={0.8} />
      <B p={[0, 0.06, 0]} s={[11.4, 0.02, 6.4]} c="#60a5fa" op={0.16} />
      {/* tường bắc: gương + tivi, cửa ở giữa; tường tây: tủ đồ */}
      {[-3.45, 3.45].map((x) => (
        <group key={x}>
          <B p={[x, 1.3, -3.5]} s={[5.1, 2.6, 0.12]} c="#1f2937" rough={0.5} />
          <B p={[x, 1.25, -3.42]} s={[4.8, 1.7, 0.02]} c="#cfe8ff" metal={0.9} rough={0.05} />
        </group>
      ))}
      {[-0.9, 0.9].map((x) => (
        <B key={x} p={[x, 1.3, -3.5]} s={[0.08, 2.6, 0.12]} c="#f5f7fb" metal={0.5} rough={0.3} />
      ))}
      <B p={[-6, 1.3, 0]} s={[0.12, 2.6, 7]} c="#1f2937" rough={0.5} />
      <B p={[0, 2.64, -3.5]} s={[12, 0.07, 0.14]} c="#60a5fa" emissive="#60a5fa" ei={1.2} />
      <B p={[3.6, 2.0, -3.4]} s={[1.7, 0.95, 0.05]} c="#0f1424" metal={0.4} />
      <B p={[3.6, 2.0, -3.37]} s={[1.6, 0.85, 0.01]} c="#60a5fa" emissive="#60a5fa" ei={1.4} />
      {[1.0, 1.7, 2.4, 3.1].map((z, i) => (
        <B key={z} p={[-5.7, 0.85, z]} s={[0.4, 1.7, 0.6]} c={["#93c5fd", "#a5b4fc", "#93c5fd", "#a5b4fc"][i]} metal={0.3} />
      ))}
      <B p={[8, 0.4, -0.2]} s={[0.05, 0.8, 7]} c={GLASS} op={0.25} />
      <B p={[0, 0.4, 3.5]} s={[12, 0.8, 0.05]} c={GLASS} op={0.25} />

      {/* 4 máy chạy bộ */}
      {[-5.4, -4.2, -3.0, -1.8].map((x) => (
        <group key={x}>
          <B p={[x, 0.09, -0.8]} s={[0.8, 0.14, 1.7]} c="#2a2f3e" />
          <B p={[x, 0.18, -0.75]} s={[0.62, 0.03, 1.45]} c="#111827" rough={0.8} />
          {[-0.32, 0.32].map((dx) => (
            <B key={dx} p={[x + dx, 0.65, -1.55]} s={[0.05, 1.1, 0.05]} c="#9aa3b5" metal={0.6} />
          ))}
          <B p={[x, 1.18, -1.58]} s={[0.7, 0.26, 0.1]} c="#1f2937" />
          <B p={[x, 1.18, -1.52]} s={[0.55, 0.16, 0.02]} c="#60a5fa" emissive="#60a5fa" ei={1.6} />
        </group>
      ))}
      {/* giá tạ đơn dọc tường bắc */}
      <B p={[2.6, 0.45, -3.1]} s={[3.6, 0.9, 0.5]} c="#2a2f3e" />
      {[1.2, 1.7, 2.2, 2.7, 3.2, 3.7, 4.2].map((x, i) => (
        <Cyl key={x} p={[x, 1.0, -3.1]} r={0.1 + i * 0.012} h={0.36} c="#6b7280" metal={0.7} rough={0.3} rot={[0, 0, Math.PI / 2]} />
      ))}
      {/* 2 ghế đẩy tạ + tạ đòn */}
      {[2.4, 4.4].map((x) => (
        <group key={x}>
          <B p={[x, 0.38, 0.3]} s={[0.5, 0.12, 1.3]} c="#ef4444" />
          {[-0.5, 0.5].map((dz) => (
            <B key={dz} p={[x, 0.19, 0.3 + dz]} s={[0.4, 0.38, 0.06]} c="#374151" />
          ))}
          <B p={[x - 0.45, 0.7, -0.1]} s={[0.05, 1.0, 0.05]} c="#9aa3b5" metal={0.6} />
          <B p={[x + 0.45, 0.7, -0.1]} s={[0.05, 1.0, 0.05]} c="#9aa3b5" metal={0.6} />
          <Barbell p={[x, 1.15, -0.1]} />
        </group>
      ))}
      {/* giàn squat */}
      <group position={[5.2, 0, -1.0]}>
        {[-0.45, 0.45].map((dx) =>
          [-0.4, 0.4].map((dz) => <B key={`${dx}${dz}`} p={[dx, 1.1, dz]} s={[0.07, 2.2, 0.07]} c="#9aa3b5" metal={0.6} />)
        )}
        <B p={[0, 2.2, 0]} s={[1.0, 0.07, 0.9]} c="#6b7280" metal={0.5} />
        <Barbell p={[0, 1.4, 0]} />
      </group>
      {/* máy cáp */}
      <B p={[5.6, 1.0, 1.9]} s={[0.7, 2.0, 0.5]} c="#374151" metal={0.4} />
      <B p={[5.6, 0.4, 1.4]} s={[0.5, 0.6, 0.6]} c="#2a2f3e" />
      <B p={[5.6, 1.6, 1.62]} s={[0.1, 0.5, 0.02]} c="#60a5fa" emissive="#60a5fa" />
      {/* 2 xe đạp tập */}
      {[-2.8, -1.6].map((x) => (
        <group key={x} position={[x, 0, 2.5]}>
          <B p={[0, 0.06, 0]} s={[0.5, 0.1, 1.1]} c="#2a2f3e" />
          <Cyl p={[0, 0.5, -0.25]} r={0.32} h={0.12} c="#6b7280" metal={0.6} rot={[0, 0, Math.PI / 2]} />
          <B p={[0, 0.85, 0.3]} s={[0.07, 0.8, 0.07]} c="#9aa3b5" metal={0.6} />
          <B p={[0, 1.28, 0.3]} s={[0.3, 0.1, 0.35]} c="#111827" />
          <B p={[0, 1.2, -0.35]} s={[0.5, 0.06, 0.06]} c="#9aa3b5" metal={0.6} />
        </group>
      ))}
      {/* bao đấm đứng */}
      <Cyl p={[-4.8, 0.06, 2.9]} r={0.4} h={0.12} c="#111827" />
      <Cyl p={[-4.8, 0.9, 2.9]} r={0.26} h={1.5} c="#ef4444" rough={0.6} />
      {/* thảm yoga + tạ ấm + bóng */}
      {[1.0, 1.9].map((x, i) => (
        <B key={x} p={[x, 0.05, 1.9]} s={[0.8, 0.02, 1.8]} c={["#a78bfa", "#34d399"][i]} rough={0.9} />
      ))}
      {[-0.6, -0.2, 0.2].map((x) => (
        <Ball key={x} p={[x, 0.17, 3.0]} r={0.17} c="#111827" />
      ))}
      <Ball p={[0.6, 0.35, 3.0]} r={0.35} c="#f9a8d4" />
      {/* bình nước lạnh */}
      <Cyl p={[5.7, 0.5, -3.0]} r={0.16} h={1.0} c="#ffffff" />
      <Cyl p={[5.7, 1.15, -3.0]} r={0.14} h={0.3} c="#7dd3fc" />
    </group>
  );
}

/** Phòng Nghỉ: sofa, bàn thấp, ghế lười, đèn sàn. Tâm (21, 8), 6×5, cửa ở tường tây. */
function RestRoom() {
  return (
    <group position={[21, 0, 8]}>
      <B p={[0, 0.03, 0]} s={[5.9, 0.05, 4.9]} c="#818cf8" op={0.24} />
      <B p={[0, 1.3, -2.5]} s={[6, 2.6, 0.05]} c={GLASS} op={0.22} rough={0.1} />
      {[-1.7, 1.7].map((z) => (
        <B key={z} p={[-3, 1.3, z]} s={[0.05, 2.6, 1.6]} c={GLASS} op={0.22} rough={0.1} />
      ))}
      <B p={[-3, 2.62, 0]} s={[0.1, 0.08, 5]} c="#818cf8" emissive="#818cf8" ei={0.9} />
      {[-1.0, 1.7].map((x) => (
        <group key={x} position={[x, 0, -1.9]}>
          <B p={[0, 0.28, 0]} s={[1.9, 0.4, 0.8]} c="#a5b4fc" rough={0.8} />
          <B p={[0, 0.7, -0.36]} s={[1.9, 0.55, 0.14]} c="#818cf8" rough={0.8} />
          <B p={[-0.97, 0.45, 0]} s={[0.1, 0.5, 0.8]} c="#818cf8" rough={0.8} />
          <B p={[0.97, 0.45, 0]} s={[0.1, 0.5, 0.8]} c="#818cf8" rough={0.8} />
        </group>
      ))}
      <B p={[0.3, 0.3, 0.5]} s={[1.1, 0.06, 0.6]} c="#ffffff" />
      <Cyl p={[0.3, 0.15, 0.5]} r={0.05} h={0.3} c="#b9bfcc" seg={8} metal={0.6} />
      <Ball p={[-1.5, 0.3, 1.3]} r={0.45} c="#fde68a" scale={[1, 0.7, 1]} />
      <Ball p={[1.8, 0.3, 1.3]} r={0.45} c="#fda4af" scale={[1, 0.7, 1]} />
      <Cyl p={[2.6, 0.9, 1.7]} r={0.03} h={1.8} c="#9aa3b5" seg={8} metal={0.6} />
      <Ball p={[2.6, 1.85, 1.7]} r={0.2} c="#fff7d6" emissive="#fde68a" ei={1.6} />
      <Plant position={[-2.5, 0, 1.9]} scale={0.8} />
    </group>
  );
}

/** Phòng Họp: bàn dài 8 ghế, máy chiếu + màn chiếu, tivi hội nghị, quầy đồ ăn thức uống, bảng trắng, máy in. Tâm (0, -12), 7×6, cửa ở phía nam. */
function MeetingRoom() {
  const slide = useMemo(
    () =>
      makeCanvasTexture(512, 288, (x) => {
        x.fillStyle = "#ffffff";
        x.fillRect(0, 0, 512, 288);
        x.fillStyle = "#1e293b";
        x.font = 'bold 34px "Segoe UI", Arial, sans-serif';
        x.fillText("THOR · HỌP ĐIỀU HÀNH", 28, 52);
        ["#38bdf8", "#facc15", "#fb923c", "#34d399"].forEach((c, i) => {
          x.fillStyle = c;
          x.fillRect(28, 88 + i * 46, 90 + ((i * 53) % 120), 24);
          x.fillStyle = "#cbd5e1";
          x.fillRect(150 + ((i * 53) % 120), 94 + i * 46, 300 - ((i * 53) % 120), 12);
        });
      }),
    []
  );
  const call = useMemo(
    () =>
      makeCanvasTexture(512, 288, (x) => {
        x.fillStyle = "#0b1226";
        x.fillRect(0, 0, 512, 288);
        ["#38bdf8", "#facc15", "#fb923c", "#34d399"].forEach((c, i) => {
          const px = 12 + (i % 2) * 250;
          const py = 12 + Math.floor(i / 2) * 138;
          x.fillStyle = "#1e293b";
          x.fillRect(px, py, 238, 126);
          x.fillStyle = c;
          x.beginPath();
          x.arc(px + 119, py + 52, 28, 0, TWO_PI);
          x.fill();
          x.fillRect(px + 79, py + 88, 80, 26);
        });
      }),
    []
  );
  return (
    <group position={[0, 0, -12]}>
      <B p={[0, 0.03, 0]} s={[6.9, 0.05, 5.9]} c="#4a5578" rough={0.9} />
      <B p={[0, 0.06, 0]} s={[6.5, 0.02, 5.5]} c="#f59e0b" op={0.14} />
      <B p={[0, 1.3, -3]} s={[7, 2.6, 0.12]} c="#f7f8fc" rough={0.4} />
      <B p={[-3.5, 1.3, 0]} s={[0.12, 2.6, 6]} c="#f7f8fc" rough={0.4} />
      <B p={[0, 2.62, -3]} s={[7.02, 0.08, 0.14]} c="#f59e0b" emissive="#f59e0b" ei={1.0} />
      {/* màn chiếu + máy chiếu treo trên bàn */}
      <B p={[0, 1.55, -2.92]} s={[3.8, 2.1, 0.05]} c="#e5e7eb" />
      <mesh position={[0, 1.55, -2.88]}>
        <planeGeometry args={[3.6, 1.95]} />
        <meshBasicMaterial map={slide} toneMapped={false} />
      </mesh>
      <group position={[0, 2.25, 0.2]}>
        <Cyl p={[0, 0.4, 0]} r={0.02} h={0.5} c="#9aa3b5" seg={6} />
        <B p={[0, 0, 0]} s={[0.5, 0.17, 0.42]} c="#e5e7eb" metal={0.3} />
        <Cyl p={[0, -0.01, -0.24]} r={0.07} h={0.08} c="#fde68a" emissive="#fde68a" rot={[Math.PI / 2, 0, 0]} />
      </group>
      {/* tivi hội nghị trên tường tây */}
      <group position={[-3.4, 1.7, 0.2]} rotation={[0, Math.PI / 2, 0]}>
        <RoundedBox args={[2.3, 1.3, 0.08]} radius={0.04} smoothness={3}>
          <meshStandardMaterial color="#0f1424" roughness={0.3} metalness={0.5} />
        </RoundedBox>
        <mesh position={[0, 0, 0.045]}>
          <planeGeometry args={[2.2, 1.2]} />
          <meshBasicMaterial map={call} toneMapped={false} />
        </mesh>
      </group>
      {/* bàn họp + ghế */}
      <B p={[0, 0.75, 0.1]} s={[4.4, 0.07, 1.4]} c="#e8d5b5" rough={0.4} />
      {[-1.8, 1.8].map((x) => (
        <B key={x} p={[x, 0.37, 0.1]} s={[0.08, 0.74, 1.1]} c="#b9bfcc" metal={0.6} rough={0.35} />
      ))}
      {[-1.5, 0, 1.5].map((x) => (
        <group key={x}>
          <Chair p={[x, 0, 1.5]} back={1} c="#475569" />
          <Chair p={[x, 0, -1.3]} back={-1} c="#475569" />
        </group>
      ))}
      <Chair p={[-2.8, 0, 0.1]} back={-1} rot={Math.PI / 2} c="#475569" />
      <Chair p={[2.8, 0, 0.1]} back={-1} rot={-Math.PI / 2} c="#475569" />
      {/* trên bàn: laptop, bình nước, đồ ăn, loa hội nghị */}
      {[-1.5, -0.5, 0.5, 1.5].map((x) => (
        <B key={x} p={[x, 0.82, 0.62]} s={[0.34, 0.02, 0.24]} c="#cbd5e1" metal={0.5} />
      ))}
      <Cyl p={[0, 0.8, 0.1]} r={0.12} h={0.05} c="#111827" />
      <Cyl p={[-0.9, 0.9, -0.2]} r={0.1} h={0.28} c="#7dd3fc" />
      {[0.7, 1.1].map((x, i) => (
        <Cyl key={x} p={[x, 0.8, -0.2]} r={0.18} h={0.03} c={["#fbbf24", "#fb7185"][i]} />
      ))}
      {[-0.4, 0.4].map((x) => (
        <Cyl key={x} p={[x, 0.82, -0.3]} r={0.04} h={0.08} c="#ffffff" />
      ))}
      {/* quầy đồ ăn thức uống dưới màn chiếu, bên phải */}
      <B p={[2.6, 0.45, -2.65]} s={[1.8, 0.9, 0.5]} c="#f2efe8" />
      <B p={[2.6, 0.92, -2.65]} s={[1.9, 0.05, 0.6]} c="#3b3f4d" />
      <B p={[3.1, 1.15, -2.65]} s={[0.4, 0.4, 0.35]} c="#9aa3b5" metal={0.6} />
      <Cyl p={[2.2, 1.2, -2.65]} r={0.14} h={0.5} c="#7dd3fc" />
      <Cyl p={[2.6, 1.0, -2.5]} r={0.2} h={0.05} c="#fbbf24" />
      <Ball p={[2.6, 1.1, -2.5]} r={0.12} c="#ef4444" />
      {/* bảng trắng, máy in, cây, đồng hồ */}
      <B p={[-2.7, 1.5, -2.92]} s={[1.1, 0.8, 0.04]} c="#ffffff" />
      <B p={[-2.7, 1.5, -2.9]} s={[1.18, 0.88, 0.03]} c="#9aa3b5" />
      <B p={[-2.6, 0.3, -2.5]} s={[0.6, 0.6, 0.5]} c="#e5e7eb" />
      <B p={[-2.6, 0.68, -2.5]} s={[0.5, 0.18, 0.4]} c="#cbd5e1" />
      <Plant position={[-3.0, 0, 2.5]} scale={0.8} />
      <Plant position={[3.0, 0, 2.5]} scale={0.8} />
      <Cyl p={[1.9, 2.3, -2.92]} r={0.22} h={0.04} c="#ffffff" rot={[Math.PI / 2, 0, 0]} />
    </group>
  );
}

/** Một bàn làm việc của nhân viên (màn hình sáng khi có người trực). */
function DeskUnit({ x, z, color, on }: { x: number; z: number; color: string; on: boolean }) {
  const screen = new THREE.Color(on ? color : "#8da2c4");
  return (
    <group position={[x, 0, z]}>
      <B p={[0, 0.76, 0]} s={[1.5, 0.06, 0.85]} c="#fbfbfd" rough={0.35} />
      {[-1, 1].map((s) => (
        <B key={s} p={[s * 0.68, 0.37, 0]} s={[0.05, 0.74, 0.7]} c="#b9bfcc" metal={0.6} rough={0.35} />
      ))}
      <group position={[0, 0.8, -0.18]}>
        <B p={[0, 0.3, 0]} s={[0.7, 0.44, 0.03]} c="#e9ebf0" metal={0.3} rough={0.35} />
        <mesh position={[0, 0.31, 0.02]}>
          <planeGeometry args={[0.64, 0.37]} />
          <meshStandardMaterial color={screen} emissive={screen} emissiveIntensity={on ? 1.1 : 0.3} />
        </mesh>
        <B p={[0, 0.05, 0]} s={[0.05, 0.1, 0.05]} c="#c9ced9" metal={0.5} cast={false} />
      </group>
      <B p={[0, 0.8, 0.2]} s={[0.45, 0.02, 0.15]} c="#e7e9ef" cast={false} />
      <group position={[0, 0, 0.95]}>
        <B p={[0, 0.45, 0]} s={[0.5, 0.07, 0.5]} c="#2b3040" rough={0.5} />
        <B p={[0, 0.74, 0.24]} s={[0.48, 0.55, 0.05]} c="#2b3040" rough={0.5} />
        <Cyl p={[0, 0.22, 0]} r={0.04} h={0.45} c="#d7dbe6" seg={8} metal={0.6} />
      </group>
    </group>
  );
}

const SHIFT_MARK: Record<DutyStaff["state"], { t: string; c: string }> = {
  on: { t: "● đang trực", c: "#4ade80" },
  break: { t: "☕ nghỉ giữa ca", c: "#fbbf24" },
  soon: { t: "⏳ sắp trực", c: "#93c5fd" },
  done: { t: "✓ hết ca", c: "#94a3b8" },
};

function drawBoard(c: HTMLCanvasElement, title: string, color: string, list: DutyStaff[]) {
  const x = c.getContext("2d");
  if (!x) return;
  const W = c.width;
  const H = c.height;
  x.fillStyle = "#0b1226";
  x.fillRect(0, 0, W, H);
  x.fillStyle = color;
  x.fillRect(0, 0, W, 62);
  x.fillStyle = "#0b1226";
  x.textBaseline = "middle";
  x.textAlign = "left";
  x.font = 'bold 32px "Segoe UI", Arial, sans-serif';
  x.fillText(title, 24, 33);
  x.textAlign = "right";
  x.font = 'bold 24px "Segoe UI", Arial, sans-serif';
  x.fillText(`${list.filter((s) => s.state === "on").length} đang trực · ${list.length} có ca hôm nay`, W - 24, 33);
  if (!list.length) {
    x.fillStyle = "#aab6d6";
    x.textAlign = "center";
    x.font = '28px "Segoe UI", Arial, sans-serif';
    x.fillText("Hôm nay chưa có ai đăng ký ca", W / 2, H / 2 + 20);
    return;
  }
  const perCol = 7;
  const cols = Math.min(3, Math.ceil(list.length / perCol));
  const colW = (W - 32) / cols;
  const shown = list.slice(0, cols * perCol);
  shown.forEach((s, i) => {
    const col = Math.floor(i / perCol);
    const row = i % perCol;
    const x0 = 16 + col * colW;
    const y = 96 + row * 48;
    x.fillStyle = staffLook(s.idx).shirt;
    x.beginPath();
    x.arc(x0 + 14, y, 9, 0, TWO_PI);
    x.fill();
    x.textAlign = "left";
    x.fillStyle = s.state === "done" ? "#94a3b8" : "#ffffff";
    x.font = `bold ${cols > 2 ? 22 : 26}px "Segoe UI", Arial, sans-serif`;
    x.fillText(s.name, x0 + 32, y - 8);
    x.font = `${cols > 2 ? 17 : 19}px "Segoe UI", Arial, sans-serif`;
    x.fillStyle = SHIFT_MARK[s.state].c;
    x.fillText(SHIFT_MARK[s.state].t, x0 + 32, y + 15);
    x.textAlign = "right";
    x.fillStyle = "#e2e8f0";
    x.font = `bold ${cols > 2 ? 22 : 26}px "Segoe UI", Arial, sans-serif`;
    x.fillText(`${s.from ?? "?"}–${s.to ?? "?"}`, x0 + colW - 14, y - 8);
    if (s.note) {
      x.font = `${cols > 2 ? 15 : 17}px "Segoe UI", Arial, sans-serif`;
      x.fillStyle = "#fcd34d";
      x.fillText(s.note, x0 + colW - 14, y + 15);
    }
  });
  if (list.length > shown.length) {
    x.textAlign = "right";
    x.fillStyle = "#aab6d6";
    x.font = '20px "Segoe UI", Arial, sans-serif';
    x.fillText(`+${list.length - shown.length} người khác — bấm bảng để xem đủ`, W - 24, H - 16);
  }
}

function ellipsize(x: CanvasRenderingContext2D, text: string, maxW: number) {
  if (x.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && x.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t}…`;
}

/** Bảng của phòng Saler: mỗi người một dòng (ca · số khách · gói đã bán · doanh thu) + tổng khách và tổng doanh thu hôm nay. */
function drawSalerBoard(c: HTMLCanvasElement, color: string, list: DutyStaff[], sales: SalesToday | null) {
  const x = c.getContext("2d");
  if (!x) return;
  const W = c.width;
  const H = c.height;
  x.fillStyle = "#0b1226";
  x.fillRect(0, 0, W, H);
  x.fillStyle = color;
  x.fillRect(0, 0, W, 62);
  x.fillStyle = "#0b1226";
  x.textBaseline = "middle";
  x.textAlign = "left";
  x.font = 'bold 32px "Segoe UI", Arial, sans-serif';
  x.fillText("BÁN HÀNG HÔM NAY · SALER", 24, 33);
  x.textAlign = "right";
  x.font = 'bold 24px "Segoe UI", Arial, sans-serif';
  x.fillText(`${list.filter((s) => s.state === "on").length} đang trực`, W - 24, 33);

  // gộp: người có ca + người có đơn
  const byId = new Map(sales?.salers.map((s) => [s.id, s]) ?? []);
  const rows: { name: string; idx: number; duty?: DutyStaff; sale?: SalerSales }[] = list.map((d) => ({ name: d.name, idx: d.idx, duty: d, sale: byId.get(d.id) }));
  for (const s of sales?.salers ?? []) if (!list.some((d) => d.id === s.id)) rows.push({ name: s.name, idx: 0, sale: s });
  rows.sort((a, b) => (b.sale?.revenue ?? 0) - (a.sale?.revenue ?? 0));
  x.textAlign = "left";
  x.font = 'bold 18px "Segoe UI", Arial, sans-serif';
  x.fillStyle = "#7c8bb0";
  x.fillText("NHÂN VIÊN", 52, 84);
  x.fillText("CA", 250, 84);
  x.fillText("KHÁCH", 400, 84);
  x.fillText("GÓI ĐÃ BÁN", 500, 84);
  x.textAlign = "right";
  x.fillText("DOANH THU", W - 24, 84);
  const shown = rows.slice(0, 6);
  shown.forEach((r, i) => {
    const y = 120 + i * 40;
    x.fillStyle = r.duty ? staffLook(r.duty.idx).shirt : "#64748b";
    x.beginPath();
    x.arc(30, y, 8, 0, TWO_PI);
    x.fill();
    x.textAlign = "left";
    x.fillStyle = "#ffffff";
    x.font = 'bold 24px "Segoe UI", Arial, sans-serif';
    x.fillText(ellipsize(x, r.name, 180), 52, y);
    x.font = '22px "Segoe UI", Arial, sans-serif';
    x.fillStyle = r.duty ? SHIFT_MARK[r.duty.state].c : "#64748b";
    x.fillText(r.duty ? `${r.duty.from ?? "?"}–${r.duty.to ?? "?"}` : "không ca", 250, y);
    x.fillStyle = "#e2e8f0";
    x.font = 'bold 24px "Segoe UI", Arial, sans-serif';
    x.fillText(String(r.sale?.customers ?? 0), 410, y);
    x.font = '19px "Segoe UI", Arial, sans-serif';
    x.fillStyle = "#cbd5e1";
    const pk = r.sale?.packages.slice(0, 3).map((p) => `${p.name} ×${p.count}`).join(" · ") ?? "";
    x.fillText(pk ? ellipsize(x, pk, 470) : "—", 500, y);
    x.textAlign = "right";
    x.font = 'bold 26px "Segoe UI", Arial, sans-serif';
    x.fillStyle = r.sale && r.sale.revenue > 0 ? "#4ade80" : "#64748b";
    x.fillText(r.sale ? formatDong(r.sale.revenue) : "0đ", W - 24, y);
  });
  if (rows.length > shown.length) {
    x.textAlign = "left";
    x.fillStyle = "#aab6d6";
    x.font = '16px "Segoe UI", Arial, sans-serif';
    x.fillText(`+${rows.length - shown.length} người khác — bấm bảng để xem đủ`, 52, 372);
  }
  x.fillStyle = "rgba(255,255,255,0.08)";
  x.fillRect(0, H - 62, W, 62);
  x.textAlign = "left";
  x.fillStyle = "#aab6d6";
  x.font = 'bold 22px "Segoe UI", Arial, sans-serif';
  x.fillText(`TỔNG HÔM NAY · ${sales?.totalCustomers ?? 0} khách · ${sales?.totalOrders ?? 0} đơn`, 24, H - 31);
  x.textAlign = "right";
  x.fillStyle = "#fde047";
  x.font = 'bold 36px "Segoe UI", Arial, sans-serif';
  x.fillText(formatDong(sales?.totalRevenue ?? 0), W - 24, H - 31);
}

function drawCasesBoard(c: HTMLCanvasElement, color: string, cases: CasesToday | null, idxOf: Map<string, number>) {
  const x = c.getContext("2d");
  if (!x) return;
  const W = c.width;
  const H = c.height;
  x.fillStyle = "#0b1226";
  x.fillRect(0, 0, W, H);
  x.fillStyle = color;
  x.fillRect(0, 0, W, 62);
  x.fillStyle = "#0b1226";
  x.textBaseline = "middle";
  x.textAlign = "left";
  x.font = 'bold 32px "Segoe UI", Arial, sans-serif';
  x.fillText("CA ĐANG XỬ LÝ · READER", 24, 33);
  x.textAlign = "right";
  x.font = 'bold 24px "Segoe UI", Arial, sans-serif';
  x.fillText(`${cases?.totalWaiting ?? 0} ca đang đợi`, W - 24, 33);
  x.textAlign = "left";
  x.font = 'bold 18px "Segoe UI", Arial, sans-serif';
  x.fillStyle = "#7c8bb0";
  x.fillText("READER", 52, 84);
  x.fillText("ĐANG XỬ LÝ", 270, 84);
  x.fillText("CA ĐANG ĐỢI (GIỜ HẸN)", 450, 84);
  x.textAlign = "right";
  x.fillText("ĐƠN HÔM NAY", W - 24, 84);
  const rows = cases?.readers ?? [];
  if (!rows.length) {
    x.textAlign = "center";
    x.fillStyle = "#aab6d6";
    x.font = '28px "Segoe UI", Arial, sans-serif';
    x.fillText("Hôm nay chưa có ca nào được Sale giao", W / 2, H / 2 + 10);
  }
  const shown = rows.slice(0, 7);
  shown.forEach((r, i) => {
    const y = 118 + i * 37;
    const idx = idxOf.get(r.id);
    x.fillStyle = idx === undefined ? "#64748b" : staffLook(idx).shirt;
    x.beginPath();
    x.arc(30, y, 8, 0, TWO_PI);
    x.fill();
    x.textAlign = "left";
    x.fillStyle = "#ffffff";
    x.font = 'bold 23px "Segoe UI", Arial, sans-serif';
    x.fillText(ellipsize(x, r.name, 200), 52, y);
    x.font = 'bold 23px "Segoe UI", Arial, sans-serif';
    x.fillStyle = r.handling ? "#4ade80" : "#64748b";
    x.fillText(r.handling ? `▶ ca ${r.handling}` : "—", 270, y);
    x.font = '20px "Segoe UI", Arial, sans-serif';
    x.fillStyle = "#cbd5e1";
    const w = r.waiting.slice(0, 5).join(" · ") + (r.waiting.length > 5 ? ` +${r.waiting.length - 5}` : "");
    x.fillText(r.waiting.length ? ellipsize(x, w, 440) : r.done ? `đã xong ${r.done} ca` : "không có ca đợi", 450, y);
    x.textAlign = "right";
    x.fillStyle = "#fde047";
    x.font = 'bold 26px "Segoe UI", Arial, sans-serif';
    x.fillText(String(r.ordersToday), W - 24, y);
  });
  if (rows.length > shown.length) {
    x.textAlign = "left";
    x.fillStyle = "#aab6d6";
    x.font = '16px "Segoe UI", Arial, sans-serif';
    x.fillText(`+${rows.length - shown.length} Reader khác — bấm tivi để xem đủ`, 52, 392);
  }
  x.fillStyle = "rgba(255,255,255,0.08)";
  x.fillRect(0, H - 52, W, 52);
  x.textAlign = "left";
  x.fillStyle = "#aab6d6";
  x.font = 'bold 22px "Segoe UI", Arial, sans-serif';
  x.fillText(`TỔNG HÔM NAY · ${cases?.totalOrders ?? 0} đơn Sale giao · ${cases?.totalDone ?? 0} ca đã xong`, 24, H - 26);
}

function refreshTexture(tex: THREE.Texture) {
  tex.needsUpdate = true;
}

/** Tivi trên tường phòng làm việc: Reader = ca trực + ca đang xử lý; Saler = bán hàng hôm nay. Bấm để xem bản phóng to. */
function ShiftBoard({
  room,
  kind,
  offsetX = 0,
  list,
  sales,
  cases,
  onClick,
}: {
  room: (typeof WORKROOMS)[number];
  kind: BoardKind;
  offsetX?: number;
  list: DutyStaff[];
  sales: SalesToday | null;
  cases: CasesToday | null;
  onClick: (k: BoardKind) => void;
}) {
  const [{ canvas, tex }] = useState(() => {
    const c = document.createElement("canvas");
    c.width = 1280;
    c.height = 448;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return { canvas: c, tex: t };
  });
  const last = useRef("");
  useFrame(() => {
    const sig = JSON.stringify(kind === "sales" ? [list, sales] : kind === "cases" ? [list.map((s) => s.id), cases] : list);
    if (sig === last.current) return;
    last.current = sig;
    if (kind === "sales") drawSalerBoard(canvas, room.color, list, sales);
    else if (kind === "cases") drawCasesBoard(canvas, room.color, cases, new Map(list.map((s) => [s.id, s.idx])));
    else drawBoard(canvas, "CA TRỰC HÔM NAY · READER", room.color, list);
    refreshTexture(tex);
  });
  const [cx, cz] = room.center;
  const w = Math.min(room.size[0] - 1.5, kind === "sales" ? 5.8 : 5.7);
  const h = w * (448 / 1280);
  return (
    <group position={[cx + offsetX, 1.55, cz - room.size[1] / 2 + 0.1]} onClick={(e) => (e.stopPropagation(), onClick(kind))}>
      <RoundedBox args={[w + 0.14, h + 0.14, 0.08]} radius={0.04} smoothness={3}>
        <meshStandardMaterial color="#0f1424" roughness={0.3} metalness={0.5} />
      </RoundedBox>
      <mesh position={[0, 0, 0.045]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  );
}
/** Phòng làm việc của Reader / Saler: bàn có vách ngăn từng chỗ, vách ngắn quanh phòng; nhân viên đang trực ngồi ở đây. */
export function WorkRooms({ occupied, board, sales, cases, onBoard }: { occupied: Record<StaffRole, boolean[]>; board: DutyStaff[]; sales: SalesToday | null; cases: CasesToday | null; onBoard: (k: BoardKind) => void }) {
  return (
    <>
      {WORKROOMS.map((r) => {
        const [cx, cz] = r.center;
        const [W, D] = r.size;
        const cols = [...new Set(r.desks.map((d) => d.x))].sort((a, b) => a - b);
        return (
          <group key={r.id}>
            <RoundedBox args={[W - 0.1, 0.05, D - 0.1]} radius={0.2} smoothness={4} position={[cx, 0.03, cz]} receiveShadow>
              <meshStandardMaterial color={r.color} transparent opacity={0.22} roughness={0.5} />
            </RoundedBox>
            {[
              [W - 0.3, 0.05, cx, cz - D / 2 + 0.08],
              [W - 0.3, 0.05, cx, cz + D / 2 - 0.08],
              [0.05, D - 0.3, cx - W / 2 + 0.08, cz],
              [0.05, D - 0.3, cx + W / 2 - 0.08, cz],
            ].map(([w, d, x, z]) => (
              <mesh key={`${x}${z}`} position={[x, 0.045, z]}>
                <boxGeometry args={[w, 0.02, d]} />
                <meshStandardMaterial color={r.color} emissive={r.color} emissiveIntensity={0.7} />
              </mesh>
            ))}
            <B p={[cx, 1.3, cz - D / 2]} s={[W, 2.6, 0.12]} c="#f7f8fc" rough={0.4} />
            <B p={[cx, 2.62, cz - D / 2 + 0.01]} s={[W + 0.02, 0.08, 0.14]} c={r.color} emissive={r.color} ei={0.9} />
            <B p={[cx - W / 2, 1.3, cz]} s={[0.05, 2.6, D]} c={GLASS} op={0.22} rough={0.1} />
            <Door cx={cx} cz={cz} depth={D} state="free" />
            <Partitions cx={cx} cz={cz} W={W} D={D} color={r.color} />
            {r.id === "reader" ? (
              <>
                <ShiftBoard room={r} kind="shift" offsetX={-3.2} list={board.filter((s) => s.role === "reader")} sales={sales} cases={cases} onClick={onBoard} />
                <ShiftBoard room={r} kind="cases" offsetX={3.2} list={board.filter((s) => s.role === "reader")} sales={sales} cases={cases} onClick={onBoard} />
              </>
            ) : (
              <ShiftBoard room={r} kind="sales" list={board.filter((s) => s.role === "saler")} sales={sales} cases={cases} onClick={onBoard} />
            )}
            {r.desks.map((d, i) => (
              <DeskUnit key={i} x={d.x} z={d.z} color={r.color} on={!!occupied[r.id][i]} />
            ))}
            {/* vách ngăn giữa các cột bàn */}
            {cols.slice(0, -1).map((x, i) => {
              const mid = (x + cols[i + 1]) / 2;
              if (Math.abs(mid - cx) < 0.5) return null; // giữa phòng là lối đi
              return [r.desks[0].z, r.desks[r.desks.length - 1].z].map((z) => <B key={`${mid}${z}`} p={[mid, 0.55, z + 0.1]} s={[0.05, 1.1, 1.5]} c="#e6edf9" op={0.85} rough={0.4} />);
            })}
            <Plant position={[cx - W / 2 + 0.6, 0, cz - D / 2 + 0.6]} scale={0.7} />
            <Plant position={[cx + W / 2 - 0.6, 0, cz - D / 2 + 0.6]} scale={0.7} />
          </group>
        );
      })}
    </>
  );
}

export function Buildings() {
  return (
    <>
      <Restaurant />
      <Gym />
      <RestRoom />
      <MeetingRoom />
      <Door cx={0} cz={-12} depth={6} state="free" />
      <Partitions cx={0} cz={-12} W={7} D={6} color="#f59e0b" />
    </>
  );
}

// ---------------------------------------------------------------- sân, đường, tường
export function LogoSigns() {
  const light = useTexture("/logo-tho-light.png");
  useEffect(() => prepTexture(light), [light]);
  return (
    <group position={[0, 3.35, WORLD.z0 - 0.12]}>
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
  );
}

const FW = WORLD.x1 - WORLD.x0;
const FD = WORLD.z1 - WORLD.z0;
const FCX = (WORLD.x0 + WORLD.x1) / 2;
const FCZ = (WORLD.z0 + WORLD.z1) / 2;

const ROADS: [number, number, number, number][] = [
  // [tâm x, tâm z, rộng, sâu]
  [4, -7.5, 52, 1.6],
  [4, 14.25, 52, 1.6],
  [-6, 3.4, 1.6, 22],
  [6, 3.4, 1.6, 22],
];

const TREES: [number, number][] = [
  [-5.75, -12.6], [5.75, -12.6], [-19, -11], [19, -11], [-19.5, 3], [19.5, 3], [-9.5, 1.5], [9.5, 1.5],
  [-8.5, -3.8], [8.5, -3.8], [-17.5, 12.5], [17.5, 13], [-19, 22.5], [23.5, 20],
  [-6.5, 15.2], [6.5, 15.2], [22.5, -4], [22.5, 14], [-8.5, 4.6], [8.5, 4.6],
  [-24.5, 14], [29.5, -4], [29.5, 11], [-24.5, -10],
];

export function Hall() {
  const mullionsX = [-25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30];
  const mullionsZ = [-15, -9, -3, 3, 9, 15, 21];
  return (
    <>
      <mesh position={[FCX, -0.05, FCZ]} receiveShadow>
        <boxGeometry args={[FW, 0.1, FD]} />
        <meshStandardMaterial color="#eef0f6" roughness={0.28} metalness={0.06} />
      </mesh>
      <Grid
        position={[FCX, 0.011, FCZ]}
        args={[FW, FD]}
        cellSize={1}
        cellThickness={0.4}
        cellColor="#e1e5f0"
        sectionSize={5}
        sectionThickness={0.8}
        sectionColor="#d3d9ea"
        fadeDistance={160}
        infiniteGrid={false}
      />
      {ROADS.map(([x, z, w, d]) => (
        <mesh key={`${x}${z}`} position={[x, 0.02, z]} receiveShadow>
          <boxGeometry args={[w, 0.01, d]} />
          <meshStandardMaterial color="#dfe4f2" roughness={0.4} />
        </mesh>
      ))}
      <mesh position={[FCX, 1.8, WORLD.z0 - 0.15]}>
        <boxGeometry args={[FW, 3.6, 0.05]} />
        <meshStandardMaterial color="#bfdcff" transparent opacity={0.2} roughness={0.05} />
      </mesh>
      <mesh position={[WORLD.x0 - 0.1, 1.8, FCZ]}>
        <boxGeometry args={[0.05, 3.6, FD + 0.2]} />
        <meshStandardMaterial color="#bfdcff" transparent opacity={0.2} roughness={0.05} />
      </mesh>
      {mullionsX.map((x) => (
        <mesh key={`b${x}`} position={[x, 1.8, WORLD.z0 - 0.15]}>
          <boxGeometry args={[0.1, 3.6, 0.1]} />
          <meshStandardMaterial color="#f5f7fb" metalness={0.5} roughness={0.3} />
        </mesh>
      ))}
      {mullionsZ.map((z) => (
        <mesh key={`l${z}`} position={[WORLD.x0 - 0.1, 1.8, z]}>
          <boxGeometry args={[0.1, 3.6, 0.1]} />
          <meshStandardMaterial color="#f5f7fb" metalness={0.5} roughness={0.3} />
        </mesh>
      ))}
      <mesh position={[FCX, 3.62, WORLD.z0 - 0.15]}>
        <boxGeometry args={[FW, 0.12, 0.14]} />
        <meshStandardMaterial color="#f5f7fb" metalness={0.5} roughness={0.3} />
      </mesh>
      {TREES.map(([x, z], i) => (
        <Tree key={i} position={[x, 0, z]} scale={0.85 + (i % 3) * 0.12} />
      ))}
    </>
  );
}

export { Zone };
