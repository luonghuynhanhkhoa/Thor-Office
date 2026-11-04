"use client";

import type { AgentStatus } from "@/lib/agentsMeta";

/** Khối dựng nhanh dùng chung cho cảnh 3D (hộp, trụ, ghế, cây…). */
export type Vec3 = [number, number, number];
export const TWO_PI = Math.PI * 2;

export const STATUS_TEXT: Record<AgentStatus, string> = {
  idle: "Rảnh",
  thinking: "Đang nghĩ…",
  working: "Đang chạy",
  done: "Xong ✓",
  error: "Lỗi",
};
export const STATUS_DOT: Record<AgentStatus, string> = {
  idle: "#94a3b8",
  thinking: "#8b5cf6",
  working: "#16a34a",
  done: "#0284c7",
  error: "#dc2626",
};

export function B({ p, s, c, metal = 0, rough = 0.5, op, emissive, ei = 1, cast = true, rot }: {
  p: Vec3; s: Vec3; c: string; metal?: number; rough?: number; op?: number; emissive?: string; ei?: number; cast?: boolean; rot?: Vec3;
}) {
  return (
    <mesh position={p} rotation={rot} castShadow={cast && op === undefined} receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} metalness={metal} roughness={rough} transparent={op !== undefined} opacity={op ?? 1} emissive={emissive} emissiveIntensity={emissive ? ei : 0} />
    </mesh>
  );
}

export function Cyl({ p, r, h, c, seg = 20, metal = 0, rough = 0.5, emissive, rot }: {
  p: Vec3; r: number; h: number; c: string; seg?: number; metal?: number; rough?: number; emissive?: string; rot?: Vec3;
}) {
  return (
    <mesh position={p} rotation={rot} castShadow receiveShadow>
      <cylinderGeometry args={[r, r, h, seg]} />
      <meshStandardMaterial color={c} metalness={metal} roughness={rough} emissive={emissive} emissiveIntensity={emissive ? 1.2 : 0} />
    </mesh>
  );
}

export function Ball({ p, r, c, emissive, ei = 1.4, scale }: { p: Vec3; r: number; c: string; emissive?: string; ei?: number; scale?: Vec3 }) {
  return (
    <mesh position={p} scale={scale} castShadow>
      <sphereGeometry args={[r, 20, 16]} />
      <meshStandardMaterial color={c} roughness={0.7} emissive={emissive} emissiveIntensity={emissive ? ei : 0} />
    </mesh>
  );
}

/** Ghế: người ngồi quay mặt về +z; `back` = bên có lưng ghế (±1 theo trục z); `rot` xoay cả ghế quanh trục y. */
export function Chair({ p, back, rot = 0, c = "#2b3040" }: { p: Vec3; back: 1 | -1; rot?: number; c?: string }) {
  return (
    <group position={p} rotation={[0, rot, 0]}>
      <B p={[0, 0.45, 0]} s={[0.5, 0.07, 0.5]} c={c} rough={0.5} />
      <B p={[0, 0.75, back * 0.23]} s={[0.5, 0.55, 0.05]} c={c} rough={0.5} />
      <Cyl p={[0, 0.22, 0]} r={0.04} h={0.45} c="#d7dbe6" seg={8} metal={0.6} />
    </group>
  );
}

export function Plant({ position, scale = 1 }: { position: Vec3; scale?: number }) {
  return (
    <group position={position} scale={scale}>
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

/** Cây ngoài sân (thân + tán tròn) để ngăn cách các khu. */
export function Tree({ position, scale = 1 }: { position: Vec3; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <Cyl p={[0, 0.6, 0]} r={0.12} h={1.2} c="#8b6b4a" seg={8} />
      <mesh position={[0, 1.8, 0]} castShadow>
        <icosahedronGeometry args={[0.95, 1]} />
        <meshStandardMaterial color="#4cb97a" roughness={0.75} flatShading />
      </mesh>
      <mesh position={[0.35, 2.4, 0.1]} castShadow>
        <icosahedronGeometry args={[0.6, 1]} />
        <meshStandardMaterial color="#6fd09a" roughness={0.75} flatShading />
      </mesh>
    </group>
  );
}
