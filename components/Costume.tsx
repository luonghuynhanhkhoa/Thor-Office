"use client";

import type { ReactNode } from "react";
import type { CostumeId } from "@/lib/costumes";

/**
 * Trang phục cho nhân vật 3D: đổi màu thân/tay/chân/da và thêm phụ kiện lên đầu (`head`, gốc toạ độ = tâm đầu)
 * và lên người (`body`, gốc = hông; thân cao ~0.62; nhân vật nhìn về +z, lưng ở -z).
 */
export type CostumeStyle = { torso?: string; arm?: string; leg?: string; skin?: string; head?: ReactNode; body?: ReactNode };

const M = ({ c, e, ei = 0, metal = 0, rough = 0.7 }: { c: string; e?: string; ei?: number; metal?: number; rough?: number }) => (
  <meshStandardMaterial color={c} emissive={e} emissiveIntensity={e ? ei : 0} metalness={metal} roughness={rough} />
);

export function costumeStyle(id: CostumeId): CostumeStyle {
  switch (id) {
    case "witch":
      return {
        torso: "#4c1d95",
        arm: "#4c1d95",
        leg: "#1f1147",
        head: (
          <group position={[0, 0.17, 0]}>
            <mesh>
              <cylinderGeometry args={[0.34, 0.34, 0.03, 20]} />
              <M c="#1f1147" />
            </mesh>
            <mesh position={[0, 0.27, 0]}>
              <coneGeometry args={[0.2, 0.52, 16]} />
              <M c="#4c1d95" />
            </mesh>
            <mesh position={[0, 0.05, 0]}>
              <cylinderGeometry args={[0.205, 0.215, 0.07, 16]} />
              <M c="#fbbf24" metal={0.6} rough={0.3} />
            </mesh>
          </group>
        ),
        body: (
          <mesh position={[0, 0.32, -0.27]} rotation={[0.12, 0, 0]}>
            <boxGeometry args={[0.5, 0.7, 0.03]} />
            <M c="#2e1065" />
          </mesh>
        ),
      };
    case "pumpkin":
      return {
        torso: "#f97316",
        arm: "#f97316",
        leg: "#1f2937",
        head: (
          <group>
            <mesh scale={[1.22, 1.08, 1.22]}>
              <sphereGeometry args={[0.22, 20, 16]} />
              <M c="#f97316" />
            </mesh>
            <mesh position={[0, 0.25, 0]}>
              <boxGeometry args={[0.05, 0.1, 0.05]} />
              <M c="#16a34a" />
            </mesh>
            {[-0.09, 0.09].map((x) => (
              <mesh key={x} position={[x, 0.04, 0.255]} rotation={[0, 0, x > 0 ? 0.4 : -0.4]}>
                <boxGeometry args={[0.065, 0.07, 0.03]} />
                <M c="#111827" e="#fde047" ei={0.9} />
              </mesh>
            ))}
            <mesh position={[0, -0.08, 0.255]}>
              <boxGeometry args={[0.16, 0.05, 0.03]} />
              <M c="#111827" e="#fde047" ei={0.9} />
            </mesh>
          </group>
        ),
      };
    case "vampire":
      return {
        torso: "#111827",
        arm: "#111827",
        leg: "#111827",
        skin: "#e9e1f0",
        head: (
          <group>
            {[-0.04, 0.04].map((x) => (
              <mesh key={x} position={[x, -0.1, 0.17]} rotation={[Math.PI, 0, 0]}>
                <coneGeometry args={[0.012, 0.05, 6]} />
                <M c="#ffffff" />
              </mesh>
            ))}
          </group>
        ),
        body: (
          <group>
            <mesh position={[0, 0.33, -0.27]} rotation={[0.12, 0, 0]}>
              <boxGeometry args={[0.66, 0.85, 0.03]} />
              <M c="#7f1d1d" />
            </mesh>
            <mesh position={[0, 0.6, -0.2]}>
              <boxGeometry args={[0.5, 0.18, 0.04]} />
              <M c="#111827" />
            </mesh>
          </group>
        ),
      };
    case "gown":
      return {
        torso: "#be123c",
        arm: "#fecdd3",
        leg: "#7f1d1d",
        head: (
          <mesh position={[0, 0.2, 0]}>
            <torusGeometry args={[0.12, 0.018, 8, 20]} />
            <M c="#fde047" metal={0.9} rough={0.2} e="#fbbf24" ei={0.5} />
          </mesh>
        ),
        body: (
          <group>
            <mesh position={[0, -0.34, 0]}>
              <cylinderGeometry args={[0.25, 0.52, 0.86, 22]} />
              <M c="#be123c" rough={0.35} metal={0.15} />
            </mesh>
            <mesh position={[0, 0.03, 0]}>
              <cylinderGeometry args={[0.255, 0.255, 0.05, 20]} />
              <M c="#fde047" metal={0.9} rough={0.2} />
            </mesh>
          </group>
        ),
      };
    case "bikini":
      return {
        torso: "skin",
        arm: "skin",
        leg: "skin",
        head: (
          <group>
            <mesh position={[0, 0.03, 0.17]}>
              <boxGeometry args={[0.31, 0.05, 0.03]} />
              <M c="#111827" />
            </mesh>
            <mesh position={[0.16, 0.16, 0.02]}>
              <sphereGeometry args={[0.055, 10, 10]} />
              <M c="#f472b6" />
            </mesh>
          </group>
        ),
        body: (
          <group>
            <mesh position={[0, 0.49, 0]}>
              <cylinderGeometry args={[0.215, 0.215, 0.11, 18]} />
              <M c="#ec4899" />
            </mesh>
            <mesh position={[0, 0.04, 0]}>
              <cylinderGeometry args={[0.25, 0.25, 0.11, 18]} />
              <M c="#ec4899" />
            </mesh>
            <mesh position={[0, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.3, 0.075, 10, 24]} />
              <M c="#fb923c" />
            </mesh>
          </group>
        ),
      };
    case "hero":
      return {
        torso: "#1d4ed8",
        arm: "#1d4ed8",
        leg: "#dc2626",
        head: (
          <group>
            <mesh position={[0, 0.03, 0.165]}>
              <boxGeometry args={[0.37, 0.09, 0.04]} />
              <M c="#dc2626" />
            </mesh>
            {[-0.07, 0.07].map((x) => (
              <mesh key={x} position={[x, 0.03, 0.19]}>
                <boxGeometry args={[0.07, 0.035, 0.01]} />
                <M c="#ffffff" e="#ffffff" ei={0.6} />
              </mesh>
            ))}
          </group>
        ),
        body: (
          <group>
            <mesh position={[0, 0.3, -0.27]} rotation={[0.2, 0, 0]}>
              <boxGeometry args={[0.56, 0.9, 0.035]} />
              <M c="#dc2626" rough={0.4} />
            </mesh>
            <mesh position={[0, 0.42, 0.22]} rotation={[0, 0, Math.PI / 4]}>
              <boxGeometry args={[0.17, 0.17, 0.02]} />
              <M c="#fde047" e="#fbbf24" ei={0.8} metal={0.5} />
            </mesh>
            <mesh position={[0, 0.05, 0]}>
              <cylinderGeometry args={[0.245, 0.245, 0.06, 18]} />
              <M c="#fde047" metal={0.6} />
            </mesh>
          </group>
        ),
      };
    case "cat":
      return {
        torso: "#fb923c",
        arm: "#fb923c",
        leg: "#fb923c",
        head: (
          <group>
            {[-0.11, 0.11].map((x) => (
              <group key={x} position={[x, 0.2, 0]} rotation={[0, 0, x > 0 ? -0.25 : 0.25]}>
                <mesh>
                  <coneGeometry args={[0.07, 0.17, 4]} />
                  <M c="#fb923c" />
                </mesh>
                <mesh position={[0, -0.01, 0.025]}>
                  <coneGeometry args={[0.04, 0.1, 4]} />
                  <M c="#f9a8d4" />
                </mesh>
              </group>
            ))}
            <mesh position={[0, -0.02, 0.19]}>
              <sphereGeometry args={[0.025, 8, 8]} />
              <M c="#f472b6" />
            </mesh>
          </group>
        ),
        body: (
          <mesh position={[0, 0.12, -0.38]} rotation={[-0.9, 0, 0]}>
            <cylinderGeometry args={[0.04, 0.05, 0.6, 8]} />
            <M c="#fb923c" />
          </mesh>
        ),
      };
    case "bear":
      return {
        torso: "#92400e",
        arm: "#92400e",
        leg: "#92400e",
        head: (
          <group>
            {[-0.14, 0.14].map((x) => (
              <mesh key={x} position={[x, 0.17, 0]}>
                <sphereGeometry args={[0.07, 12, 12]} />
                <M c="#92400e" />
              </mesh>
            ))}
            <mesh position={[0, -0.04, 0.16]} scale={[1, 0.8, 0.8]}>
              <sphereGeometry args={[0.09, 12, 12]} />
              <M c="#fde68a" />
            </mesh>
            <mesh position={[0, -0.01, 0.235]}>
              <sphereGeometry args={[0.02, 8, 8]} />
              <M c="#111827" />
            </mesh>
          </group>
        ),
        body: (
          <group>
            <mesh position={[0, 0.3, 0.17]} scale={[1, 1.15, 0.45]}>
              <sphereGeometry args={[0.17, 14, 12]} />
              <M c="#fde68a" />
            </mesh>
            <mesh position={[0, 0.06, -0.27]}>
              <sphereGeometry args={[0.09, 10, 10]} />
              <M c="#92400e" />
            </mesh>
          </group>
        ),
      };
    case "bunny":
      return {
        torso: "#f8fafc",
        arm: "#f8fafc",
        leg: "#f8fafc",
        head: (
          <group>
            {[-0.085, 0.085].map((x) => (
              <group key={x} position={[x, 0.36, 0]} rotation={[0, 0, x > 0 ? -0.1 : 0.1]}>
                <mesh>
                  <boxGeometry args={[0.07, 0.38, 0.045]} />
                  <M c="#f8fafc" />
                </mesh>
                <mesh position={[0, 0, 0.026]}>
                  <boxGeometry args={[0.035, 0.28, 0.01]} />
                  <M c="#f9a8d4" />
                </mesh>
              </group>
            ))}
            <mesh position={[0, -0.02, 0.19]}>
              <sphereGeometry args={[0.022, 8, 8]} />
              <M c="#f472b6" />
            </mesh>
          </group>
        ),
        body: (
          <mesh position={[0, 0.08, -0.28]}>
            <sphereGeometry args={[0.11, 12, 12]} />
            <M c="#ffffff" rough={0.95} />
          </mesh>
        ),
      };
    case "cowboy":
      return {
        torso: "#a16207",
        arm: "#fef3c7",
        leg: "#1e3a8a",
        head: (
          <group position={[0, 0.17, 0]}>
            <mesh>
              <cylinderGeometry args={[0.33, 0.33, 0.03, 20]} />
              <M c="#78350f" />
            </mesh>
            <mesh position={[0, 0.1, 0]}>
              <cylinderGeometry args={[0.15, 0.17, 0.2, 16]} />
              <M c="#92400e" />
            </mesh>
            <mesh position={[0, 0.03, 0]}>
              <cylinderGeometry args={[0.172, 0.172, 0.04, 16]} />
              <M c="#fbbf24" />
            </mesh>
          </group>
        ),
        body: (
          <group>
            <mesh position={[0, 0.34, 0.2]}>
              <boxGeometry args={[0.42, 0.45, 0.04]} />
              <M c="#78350f" />
            </mesh>
            <mesh position={[0.1, 0.46, 0.225]} rotation={[0, 0, Math.PI / 4]}>
              <boxGeometry args={[0.07, 0.07, 0.015]} />
              <M c="#fde047" metal={0.8} />
            </mesh>
          </group>
        ),
      };
    case "chef":
      return {
        torso: "#ffffff",
        arm: "#ffffff",
        leg: "#374151",
        head: (
          <group position={[0, 0.17, 0]}>
            <mesh position={[0, 0.12, 0]}>
              <cylinderGeometry args={[0.15, 0.15, 0.24, 16]} />
              <M c="#ffffff" />
            </mesh>
            <mesh position={[0, 0.3, 0]} scale={[1.2, 0.8, 1.2]}>
              <sphereGeometry args={[0.17, 14, 12]} />
              <M c="#ffffff" />
            </mesh>
          </group>
        ),
        body: (
          <mesh position={[0, 0.28, 0.215]}>
            <boxGeometry args={[0.4, 0.5, 0.03]} />
            <M c="#f1f5f9" />
          </mesh>
        ),
      };
    default:
      return {};
  }
}
