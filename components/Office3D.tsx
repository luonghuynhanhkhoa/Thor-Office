"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Grid, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { AGENTS, type AgentId, type AgentMeta, type AgentState, type AgentStatus } from "@/lib/agentsMeta";

type States = Record<AgentId, AgentState>;
type Screen = Record<string, { x: number; y: number; on: boolean }>;

const STATUS_TEXT: Record<AgentStatus, string> = {
  idle: "Rảnh",
  thinking: "Đang nghĩ…",
  working: "Đang chạy",
  done: "Xong ✓",
  error: "Lỗi",
};
const STATUS_DOT: Record<AgentStatus, string> = {
  idle: "#94a3b8",
  thinking: "#c084fc",
  working: "#4ade80",
  done: "#38bdf8",
  error: "#f87171",
};

const SKIN = "#f1c9a5";
const COMMANDER_POS = AGENTS[0].pos;

/** Người ngồi bàn: thân + đầu + 2 tay. Hoạt ảnh theo trạng thái. */
function Person({ color, status }: { color: string; status: AgentStatus }) {
  const head = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Mesh>(null);
  const armR = useRef<THREE.Mesh>(null);
  const body = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (!head.current || !armL.current || !armR.current || !body.current) return;
    let bob = Math.sin(t * 1.6) * 0.01; // mặc định: thở nhẹ
    let tilt = 0;
    let aL = -0.7;
    let aR = -0.7;
    if (status === "working") {
      aL = -0.9 + Math.sin(t * 14) * 0.25; // gõ phím
      aR = -0.9 + Math.sin(t * 14 + 1.7) * 0.25;
      bob = Math.sin(t * 6) * 0.015;
      tilt = Math.sin(t * 2) * 0.08;
    } else if (status === "thinking") {
      tilt = Math.sin(t * 2.2) * 0.22;
      aL = -0.5;
      aR = -1.5;
    } else if (status === "done") {
      bob = Math.abs(Math.sin(t * 4)) * 0.08; // nhún mừng
      aL = -2.4 + Math.sin(t * 6) * 0.3;
      aR = -2.4 - Math.sin(t * 6) * 0.3;
    } else if (status === "error") {
      tilt = Math.sin(t * 20) * 0.1;
    }
    body.current.position.y = 0.5 + bob;
    head.current.rotation.z = tilt;
    armL.current.rotation.x = aL;
    armR.current.rotation.x = aR;
  });

  return (
    <group ref={body} position={[0, 0.5, 0]}>
      <mesh position={[0, 0.32, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.24, 0.62, 16]} />
        <meshStandardMaterial color={color} roughness={0.7} />
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
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      <mesh ref={armR} position={[0.27, 0.5, 0]} castShadow>
        <boxGeometry args={[0.09, 0.4, 0.09]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
    </group>
  );
}

/** Một bàn làm việc + ghế + người + màn hình. */
function Station({
  meta,
  st,
  selected,
  onSelect,
  boss = false,
}: {
  meta: AgentMeta;
  st: AgentState;
  selected: boolean;
  onSelect: (id: AgentId) => void;
  boss?: boolean;
}) {
  const [x, z] = meta.pos;
  const active = st.status === "working" || st.status === "thinking";
  const screenColor = useMemo(
    () => new THREE.Color(active ? meta.color : st.status === "error" ? "#f87171" : "#1e293b"),
    [active, meta.color, st.status]
  );
  const w = boss ? 3.0 : 2.0;

  return (
    <group position={[x, 0, z]} onClick={(e) => (e.stopPropagation(), onSelect(meta.id))}>
      <mesh position={[0, 0.78, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, 0.09, 1.0]} />
        <meshStandardMaterial color={boss ? "#3b2a63" : "#d8c7a6"} roughness={0.55} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (w / 2 - 0.1), 0.38, 0]} castShadow>
          <boxGeometry args={[0.08, 0.78, 0.9]} />
          <meshStandardMaterial color="#5b6475" />
        </mesh>
      ))}
      {(boss ? [-0.9, 0, 0.9] : [0]).map((mx) => (
        <group key={mx} position={[mx, 0.83, -0.2]}>
          <mesh position={[0, 0.34, 0]} castShadow>
            <boxGeometry args={[0.78, 0.5, 0.05]} />
            <meshStandardMaterial color="#0f172a" />
          </mesh>
          <mesh position={[0, 0.34, 0.03]}>
            <planeGeometry args={[0.7, 0.42]} />
            <meshStandardMaterial color={screenColor} emissive={screenColor} emissiveIntensity={active ? 1.3 : 0.25} />
          </mesh>
          <mesh position={[0, 0.06, 0]}>
            <boxGeometry args={[0.08, 0.12, 0.08]} />
            <meshStandardMaterial color="#334155" />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.84, 0.2]}>
        <boxGeometry args={[0.6, 0.03, 0.2]} />
        <meshStandardMaterial color="#e2e8f0" />
      </mesh>
      <group position={[0, 0, 0.95]}>
        <mesh position={[0, 0.45, 0]} castShadow>
          <boxGeometry args={[0.55, 0.08, 0.55]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
        <mesh position={[0, 0.75, 0.25]} castShadow>
          <boxGeometry args={[0.55, 0.55, 0.07]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
        <mesh position={[0, 0.22, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.45, 8]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
        {/* người ngồi quay mặt về bàn (-z) */}
        <group rotation={[0, Math.PI, 0]} position={[0, 0, -0.02]}>
          <Person color={meta.color} status={st.status} />
        </group>
      </group>
      {(selected || active) && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0.4]}>
          <ringGeometry args={[1.25, 1.4, 48]} />
          <meshBasicMaterial color={meta.color} transparent opacity={selected ? 0.9 : 0.45} />
        </mesh>
      )}
    </group>
  );
}

/** Gói việc bay từ bàn Chỉ huy tới bàn AI được giao (khoảng 1,1 giây đầu). */
function Parcel({ meta, startedAt }: { meta: AgentMeta; startedAt: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const t = Math.min(1, (Date.now() - startedAt) / 1100);
    m.visible = t < 1;
    m.position.x = THREE.MathUtils.lerp(COMMANDER_POS[0], meta.pos[0], t);
    m.position.z = THREE.MathUtils.lerp(COMMANDER_POS[1], meta.pos[1], t) + 0.2;
    m.position.y = 1.0 + Math.sin(t * Math.PI) * 1.4;
    m.rotation.y += 0.12;
  });
  return (
    <mesh ref={ref} visible={false}>
      <boxGeometry args={[0.3, 0.2, 0.4]} />
      <meshStandardMaterial color="#ffffff" emissive={meta.color} emissiveIntensity={0.9} />
    </mesh>
  );
}

function Plant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.25, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.22, 0.5, 12]} />
        <meshStandardMaterial color="#7c4a2d" />
      </mesh>
      <mesh position={[0, 0.95, 0]} castShadow>
        <coneGeometry args={[0.5, 1.0, 10]} />
        <meshStandardMaterial color="#16a34a" roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.45, 0]} castShadow>
        <coneGeometry args={[0.36, 0.8, 10]} />
        <meshStandardMaterial color="#22c55e" roughness={0.8} />
      </mesh>
    </group>
  );
}

/** Biển hiệu trên tường: vẽ chữ vào ảnh rồi dán lên tấm phẳng (không cần phông ngoài). */
function Sign() {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 1400;
    c.height = 200;
    const g = c.getContext("2d")!;
    g.fillStyle = "#0b1024";
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = "#fcd34d";
    g.lineWidth = 8;
    g.strokeRect(10, 10, c.width - 20, c.height - 20);
    g.fillStyle = "#fcd34d";
    g.font = "bold 96px system-ui, Arial, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("VĂN PHÒNG AI · THOR", c.width / 2, c.height / 2 + 4);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  return (
    <mesh position={[0, 2.3, -6.38]}>
      <planeGeometry args={[7, 1]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
}

function Room() {
  return (
    <>
      <mesh position={[0, -0.05, 0]} receiveShadow>
        <boxGeometry args={[17, 0.1, 13]} />
        <meshStandardMaterial color="#1b2038" roughness={0.9} />
      </mesh>
      <Grid
        position={[0, 0.011, 0]}
        args={[17, 13]}
        cellSize={1}
        cellThickness={0.6}
        cellColor="#2b3358"
        sectionSize={4}
        sectionThickness={1}
        sectionColor="#3a4577"
        fadeDistance={60}
        infiniteGrid={false}
      />
      <mesh position={[0, 0.015, 0.2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[13, 8.6]} />
        <meshStandardMaterial color="#243a63" transparent opacity={0.55} />
      </mesh>
      <mesh position={[0, 1.6, -6.5]} receiveShadow>
        <boxGeometry args={[17, 3.2, 0.2]} />
        <meshStandardMaterial color="#222a4f" />
      </mesh>
      <mesh position={[-8.5, 1.6, 0]} receiveShadow>
        <boxGeometry args={[0.2, 3.2, 13]} />
        <meshStandardMaterial color="#1c2345" />
      </mesh>
      <Sign />
      {[-5, 5].map((x) => (
        <mesh key={x} position={[x, 1.7, -6.38]}>
          <boxGeometry args={[2.6, 1.2, 0.05]} />
          <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={0.7} />
        </mesh>
      ))}
      <Plant position={[-7.4, 0, -5.4]} />
      <Plant position={[7.4, 0, -5.4]} />
      <Plant position={[-7.4, 0, 5.4]} />
      <Plant position={[7.4, 0, 5.4]} />
    </>
  );
}

/** Mỗi khung hình: chiếu vị trí đầu từng AI ra toạ độ màn hình để vẽ nhãn bằng HTML thường. */
function Projector({ onProject }: { onProject: (id: AgentId, x: number, y: number, on: boolean) => void }) {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    for (const a of AGENTS) {
      v.set(a.pos[0], 2.15, a.pos[1] + 0.95).project(camera);
      onProject(a.id, (v.x * 0.5 + 0.5) * size.width, (-v.y * 0.5 + 0.5) * size.height, v.z > -1 && v.z < 1);
    }
  });
  return null;
}

export default function Office3D({
  states,
  selected,
  onSelect,
}: {
  states: States;
  selected: AgentId | null;
  onSelect: (id: AgentId | null) => void;
}) {
  const screen = useRef<Screen>({});
  const labelRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const onProject = useCallback((id: AgentId, x: number, y: number, on: boolean) => {
    screen.current[id] = { x, y, on };
  }, []);

  // Cập nhật vị trí nhãn theo khung hình (không qua React → mượt, không gây vẽ lại).
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      for (const a of AGENTS) {
        const el = labelRefs.current[a.id];
        const p = screen.current[a.id];
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

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Canvas
        orthographic
        shadows
        dpr={[1, 2]}
        camera={{ position: [13, 12, 13], zoom: 52, near: -60, far: 120 }}
        onPointerMissed={() => onSelect(null)}
        style={{ background: "linear-gradient(180deg,#0b1024 0%,#141a3a 100%)" }}
      >
        <ambientLight intensity={0.95} />
        <directionalLight
          position={[8, 14, 6]}
          intensity={1.6}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-14}
          shadow-camera-right={14}
          shadow-camera-top={14}
          shadow-camera-bottom={-14}
        />
        <pointLight position={[0, 4, -3]} intensity={18} color="#a855f7" distance={14} />
        <Room />
        {AGENTS.map((a) => (
          <Station
            key={a.id}
            meta={a}
            st={states[a.id]}
            selected={selected === a.id}
            onSelect={onSelect}
            boss={a.id === "commander"}
          />
        ))}
        {AGENTS.filter((a) => a.id !== "commander" && states[a.id].startedAt && states[a.id].status !== "idle").map(
          (a) => (
            <Parcel key={`${a.id}-${states[a.id].startedAt}`} meta={a} startedAt={states[a.id].startedAt!} />
          )
        )}
        <Projector onProject={onProject} />
        <OrbitControls
          makeDefault
          enableDamping
          minZoom={26}
          maxZoom={110}
          maxPolarAngle={Math.PI / 2.2}
          target={[0, 0.8, 0.3]}
        />
      </Canvas>

      {/* Nhãn: tên + nhánh việc + trạng thái (HTML nằm đè lên cảnh 3D) */}
      <div className="pointer-events-none absolute inset-0">
        {AGENTS.map((a) => {
          const st = states[a.id];
          const sel = selected === a.id;
          return (
            <div
              key={a.id}
              ref={(el) => {
                labelRefs.current[a.id] = el;
              }}
              className="absolute left-0 top-0 whitespace-nowrap rounded-xl border px-3 py-1.5 text-left shadow-lg backdrop-blur"
              style={{
                background: "rgba(12,14,28,0.88)",
                borderColor: sel ? a.color : "rgba(255,255,255,0.18)",
                boxShadow: sel ? `0 0 14px ${a.color}88` : undefined,
                opacity: 0,
              }}
            >
              <div className="flex items-center gap-2 text-[13px] font-bold text-white">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: a.color }} />
                {a.name}
              </div>
              <div className="text-[11px] text-slate-300">{a.branch}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: STATUS_DOT[st.status] }}>
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    st.status === "working" || st.status === "thinking" ? "animate-pulse" : ""
                  }`}
                  style={{ background: STATUS_DOT[st.status] }}
                />
                {STATUS_TEXT[st.status]}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
