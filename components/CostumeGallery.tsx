"use client";

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { COSTUMES, type CostumeId } from "@/lib/costumes";
import { Person, type Ctl } from "@/components/Office3D";

/** Tủ trang phục: xem 360° tất cả bộ đồ trước khi chọn. */
function Model({ id, x, z }: { id: CostumeId; x: number; z: number }) {
  const g = useRef<THREE.Group>(null);
  const ctl = useRef<Ctl>({ mode: "spot", pose: null, sit: false, status: "idle" });
  useFrame(({ clock }) => {
    if (g.current) g.current.rotation.y = Math.sin(clock.elapsedTime * 0.6 + x) * 0.9;
  });
  return (
    <group ref={g} position={[x, 0, z]}>
      <Person color="#38bdf8" ctl={ctl} costume={id} />
    </group>
  );
}

export default function CostumeGallery() {
  const cols = 6;
  return (
    <main className="relative h-dvh w-full bg-gradient-to-b from-[#dbe8ff] to-[#f6f8fd]">
      <div className="absolute left-4 top-4 z-10 rounded-2xl border border-slate-200 bg-white/90 px-4 py-2 text-sm font-bold text-slate-800 shadow">👗 Tủ trang phục — kéo chuột để xoay, lăn chuột để phóng to</div>
      <Canvas camera={{ position: [0, 3.6, 9.5], fov: 38 }} shadows>
        <ambientLight intensity={1.2} />
        <directionalLight position={[4, 8, 6]} intensity={1.6} castShadow />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
          <planeGeometry args={[30, 14]} />
          <meshStandardMaterial color="#eef0f6" />
        </mesh>
        {COSTUMES.map((c, i) => (
          <Model key={c.id} id={c.id} x={(i % cols) * 2.2 - ((cols - 1) * 2.2) / 2} z={Math.floor(i / cols) * 2.8 - 1.2} />
        ))}
      </Canvas>
      <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center gap-3 px-4 text-center text-[11px] font-semibold text-slate-700">
        {COSTUMES.map((c) => (
          <span key={c.id} className="rounded-full bg-white/85 px-2 py-1 shadow">
            {c.emoji} {c.name}
          </span>
        ))}
      </div>
    </main>
  );
}
