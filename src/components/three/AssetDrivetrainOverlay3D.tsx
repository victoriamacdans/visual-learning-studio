import { useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import {
  computePlanetaryGearAngles,
  computeShipPropulsionState,
} from '../../three/drivetrainKinematics';
import type { NormalizedModelMetrics } from '../../three/gltfAssetUtils';

export interface AssetDrivetrainOverlay3DProps {
  assetId: string;
  metrics: NormalizedModelMetrics;
  visible: boolean;
  isPlaying: boolean;
  speedMultiplier: number;
  selectedPartId: string | null;
  showLabels: boolean;
  onSelectPart: (partId: string) => void;
}

function glowProps(id: string, selectedId: string | null) {
  return selectedId === id
    ? { emissive: '#38BDF8', emissiveIntensity: 0.65 }
    : { emissive: '#000000', emissiveIntensity: 0 };
}

/**
 * Renders cohesive, mathematically synchronized conceptual internal drivetrains inside
 * transparent cutaway GLB models:
 * - Cordless Drill: Trigger -> Battery -> DC Motor -> Planetary Gearbox -> Output Shaft -> Chuck
 * - Container Ship: Engine -> Coupling -> Propeller Shaft -> Propeller -> Water Thrust
 */
export function AssetDrivetrainOverlay3D({
  assetId,
  metrics,
  visible,
  isPlaying,
  speedMultiplier,
  selectedPartId,
  showLabels,
  onSelectPart,
}: AssetDrivetrainOverlay3DProps) {
  const elapsedRef = useRef(0);

  // Drill refs
  const motorRotorRef = useRef<THREE.Group>(null);
  const sunGearRef = useRef<THREE.Group>(null);
  const carrierRef = useRef<THREE.Group>(null);
  const planetRefs = useRef<(THREE.Group | null)[]>([]);
  const outputShaftRef = useRef<THREE.Group>(null);
  const triggerGlowRef = useRef<THREE.Mesh>(null);

  // Ship refs
  const shipCouplingRef = useRef<THREE.Group>(null);
  const shipShaftRef = useRef<THREE.Group>(null);
  const shipPistonRefs = useRef<(THREE.Mesh | null)[]>([]);
  const wakeRingRefs = useRef<(THREE.Mesh | null)[]>([]);

  const drillAnchors = useMemo(() => {
    const min = metrics.boxMin;
    const max = metrics.boxMax;
    const spanX = max[0] - min[0];
    const spanY = max[1] - min[1];
    const spanZ = max[2] - min[2];
    const barrelY = min[1] + spanY * 0.72;
    const barrelZ = min[2] + spanZ * 0.5;
    return {
      triggerPos: [min[0] + spanX * 0.48, min[1] + spanY * 0.48, barrelZ] as [number, number, number],
      batteryPos: [min[0] + spanX * 0.34, min[1] + spanY * 0.14, barrelZ] as [number, number, number],
      motorPos: [min[0] + spanX * 0.36, barrelY, barrelZ] as [number, number, number],
      gearboxPos: [min[0] + spanX * 0.61, barrelY, barrelZ] as [number, number, number],
      outputShaftPos: [min[0] + spanX * 0.77, barrelY, barrelZ] as [number, number, number],
      barrelScale: Math.max(0.28, Math.min(spanY, spanZ) * 0.32),
      barrelSpanX: spanX,
    };
  }, [metrics]);

  const shipAnchors = useMemo(() => {
    const min = metrics.boxMin;
    const max = metrics.boxMax;
    const spanX = max[0] - min[0];
    const spanY = max[1] - min[1];
    const spanZ = max[2] - min[2];
    const centerX = min[0] + spanX * 0.5;
    const shaftY = min[1] + spanY * 0.085;
    return {
      enginePos: [centerX, min[1] + spanY * 0.17, min[2] + spanZ * 0.29] as [number, number, number],
      couplingPos: [centerX, shaftY + 0.02, min[2] + spanZ * 0.2] as [number, number, number],
      shaftPos: [centerX, shaftY, min[2] + spanZ * 0.12] as [number, number, number],
      shaftLength: Math.max(0.45, spanZ * 0.17),
      wakeOrigin: [centerX, shaftY - 0.02, min[2] - 0.06] as [number, number, number],
      spanX,
      spanY,
      spanZ,
    };
  }, [metrics]);

  useFrame((_, rawDelta) => {
    if (!visible) return;
    const dt = Math.min(rawDelta, 0.08);
    if (isPlaying) {
      elapsedRef.current += dt * speedMultiplier;
    }
    const t = elapsedRef.current;

    if (assetId === 'cordless-drill') {
      // Motor speed = 16 rad/s; 4:1 planetary gearbox outputs 4.0 rad/s (matching GLB chuck!)
      const gearState = computePlanetaryGearAngles(t, 16);
      if (motorRotorRef.current) motorRotorRef.current.rotation.x = gearState.sunAngleRad;
      if (sunGearRef.current) sunGearRef.current.rotation.x = gearState.sunAngleRad;
      if (carrierRef.current) carrierRef.current.rotation.x = gearState.carrierAndChuckAngleRad;
      if (outputShaftRef.current) {
        outputShaftRef.current.rotation.x = gearState.carrierAndChuckAngleRad;
      }
      for (const planet of planetRefs.current) {
        if (planet) planet.rotation.x = gearState.planetRelativeSpinRad;
      }
      if (triggerGlowRef.current) {
        const pulse = isPlaying ? 0.45 + 0.45 * Math.sin(t * 6) : 0.2;
        (triggerGlowRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = pulse;
      }
    }

    if (assetId === 'container-ship') {
      const ship = computeShipPropulsionState(t, 5.2);
      if (shipCouplingRef.current) shipCouplingRef.current.rotation.z = ship.shaftAngleRad;
      if (shipShaftRef.current) shipShaftRef.current.rotation.z = ship.shaftAngleRad;

      shipPistonRefs.current.forEach((piston, i) => {
        if (!piston) return;
        const phase = ship.engineCrankRad + (i * Math.PI) / 2;
        piston.position.y = 0.07 + Math.sin(phase) * 0.045;
      });

      wakeRingRefs.current.forEach((ring, i) => {
        if (!ring) return;
        const p = (ship.slipstreamPhase + i * 0.25) % 1;
        ring.position.z = -p * 0.85;
        const scale = 0.75 + p * 1.15;
        ring.scale.set(scale, scale, 1);
        const mat = ring.material as THREE.MeshBasicMaterial;
        mat.opacity = (1 - p) * 0.62;
      });
    }
  });

  if (!visible) return null;

  const handleSelect = (partId: string) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelectPart(partId);
  };

  if (assetId === 'cordless-drill') {
    const s = drillAnchors.barrelScale;
    const planetOrbitR = s * 0.46;
    return (
      <group>
        {/* Battery Pack Indicator */}
        <group position={drillAnchors.batteryPos} onClick={handleSelect('battery')}>
          <mesh>
            <boxGeometry args={[s * 1.3, s * 0.6, s * 0.85]} />
            <meshStandardMaterial
              color="#10B981"
              metalness={0.3}
              roughness={0.45}
              transparent
              opacity={0.72}
              {...glowProps('battery', selectedPartId)}
            />
          </mesh>
        </group>

        {/* Trigger PWM Switch */}
        <group position={drillAnchors.triggerPos} onClick={handleSelect('trigger')}>
          <mesh ref={triggerGlowRef}>
            <boxGeometry args={[s * 0.55, s * 0.48, s * 0.35]} />
            <meshStandardMaterial
              color="#F59E0B"
              emissive="#F59E0B"
              emissiveIntensity={0.5}
              metalness={0.4}
              roughness={0.4}
            />
          </mesh>
        </group>

        {/* DC Electric Motor (Copper Windings + Spinning Rotor Shaft) */}
        <group position={drillAnchors.motorPos} onClick={handleSelect('motor')}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[s * 0.62, s * 0.62, s * 1.3, 24, 1, true]} />
            <meshStandardMaterial
              color="#475569"
              metalness={0.8}
              roughness={0.3}
              transparent
              opacity={0.45}
              side={THREE.DoubleSide}
            />
          </mesh>
          <group ref={motorRotorRef}>
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[s * 0.14, s * 0.14, s * 1.75, 16]} />
              <meshStandardMaterial color="#E2E8F0" metalness={0.92} roughness={0.18} />
            </mesh>
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[s * 0.44, s * 0.44, s * 0.95, 12]} />
              <meshStandardMaterial
                color="#D97706"
                metalness={0.88}
                roughness={0.22}
                {...glowProps('motor', selectedPartId)}
              />
            </mesh>
          </group>
        </group>

        {/* Coherent Planetary Reduction Gearbox (Sun + 3 Planets + Ring) */}
        <group position={drillAnchors.gearboxPos} onClick={handleSelect('gearbox')}>
          {/* Stationary Outer Ring Gear */}
          <mesh rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[s * 0.68, s * 0.08, 12, 32]} />
            <meshStandardMaterial
              color="#64748B"
              metalness={0.85}
              roughness={0.28}
              {...glowProps('gearbox', selectedPartId)}
            />
          </mesh>

          {/* High-RPM Sun Pinion */}
          <group ref={sunGearRef}>
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[s * 0.22, s * 0.22, s * 0.42, 12]} />
              <meshStandardMaterial color="#F59E0B" metalness={0.88} roughness={0.22} />
            </mesh>
          </group>

          {/* 4:1 Reduced Planetary Carrier + 3 Meshing Planet Gears */}
          <group ref={carrierRef}>
            {[0, 1, 2].map((idx) => {
              const angle = (idx * Math.PI * 2) / 3;
              const py = Math.cos(angle) * planetOrbitR;
              const pz = Math.sin(angle) * planetOrbitR;
              return (
                <group
                  key={`planet-${idx}`}
                  position={[0, py, pz]}
                  ref={(el) => {
                    planetRefs.current[idx] = el;
                  }}
                >
                  <mesh rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[s * 0.22, s * 0.22, s * 0.36, 10]} />
                    <meshStandardMaterial color="#38BDF8" metalness={0.85} roughness={0.22} />
                  </mesh>
                  {/* Visible index spoke to show planet spin clearly */}
                  <mesh position={[s * 0.19, 0, 0]}>
                    <boxGeometry args={[0.04, s * 0.36, s * 0.07]} />
                    <meshStandardMaterial color="#F8FAFC" />
                  </mesh>
                </group>
              );
            })}
          </group>
        </group>

        {/* Output Spindle Shaft (Synchronized 1:1 with GLB Chuck) */}
        <group
          ref={outputShaftRef}
          position={drillAnchors.outputShaftPos}
          onClick={handleSelect('output-shaft')}
        >
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[s * 0.16, s * 0.16, s * 1.15, 16]} />
            <meshStandardMaterial
              color="#CBD5E1"
              metalness={0.92}
              roughness={0.18}
              {...glowProps('output-shaft', selectedPartId)}
            />
          </mesh>
          <mesh position={[0, s * 0.14, 0]}>
            <boxGeometry args={[s * 0.85, s * 0.06, s * 0.06]} />
            <meshStandardMaterial color="#38BDF8" emissive="#0284C7" emissiveIntensity={0.4} />
          </mesh>
        </group>

        {showLabels && (
          <>
            <Html position={[drillAnchors.motorPos[0], drillAnchors.motorPos[1] + 0.45, drillAnchors.motorPos[2]]} center distanceFactor={6}>
              <span className="px-1.5 py-0.5 rounded bg-slate-950/90 border border-amber-500/50 text-[10px] font-mono text-amber-200 whitespace-nowrap">
                Motor (4× RPM)
              </span>
            </Html>
            <Html position={[drillAnchors.gearboxPos[0], drillAnchors.gearboxPos[1] + 0.45, drillAnchors.gearboxPos[2]]} center distanceFactor={6}>
              <span className="px-1.5 py-0.5 rounded bg-slate-950/90 border border-cyan-500/50 text-[10px] font-mono text-cyan-200 whitespace-nowrap">
                Planetary Gearbox (4:1)
              </span>
            </Html>
          </>
        )}
      </group>
    );
  }

  if (assetId === 'container-ship') {
    return (
      <group>
        {/* Conceptual Aft Marine Diesel Engine Block */}
        <group position={shipAnchors.enginePos} onClick={handleSelect('engine')}>
          <mesh>
            <boxGeometry args={[0.42, 0.36, 0.62]} />
            <meshStandardMaterial
              color="#D97706"
              metalness={0.68}
              roughness={0.35}
              transparent
              opacity={0.78}
              {...glowProps('engine', selectedPartId)}
            />
          </mesh>
          {[-0.18, -0.06, 0.06, 0.18].map((zOff, i) => (
            <mesh
              key={`ship-piston-${i}`}
              ref={(el) => {
                shipPistonRefs.current[i] = el;
              }}
              position={[0, 0.08, zOff]}
            >
              <cylinderGeometry args={[0.042, 0.042, 0.14, 12]} />
              <meshStandardMaterial color="#E2E8F0" metalness={0.9} roughness={0.2} />
            </mesh>
          ))}
        </group>

        {/* Flexible Shaft Coupling & Thrust Collar */}
        <group
          ref={shipCouplingRef}
          position={shipAnchors.couplingPos}
          onClick={handleSelect('coupling')}
        >
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.11, 0.11, 0.12, 18]} />
            <meshStandardMaterial
              color="#38BDF8"
              metalness={0.85}
              roughness={0.22}
              {...glowProps('coupling', selectedPartId)}
            />
          </mesh>
          <mesh position={[0, 0.09, 0]}>
            <boxGeometry args={[0.04, 0.12, 0.14]} />
            <meshStandardMaterial color="#F59E0B" />
          </mesh>
        </group>

        {/* Stern Propeller Shaft */}
        <group
          ref={shipShaftRef}
          position={shipAnchors.shaftPos}
          onClick={handleSelect('propeller-shaft')}
        >
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.045, 0.045, shipAnchors.shaftLength, 16]} />
            <meshStandardMaterial
              color="#CBD5E1"
              metalness={0.92}
              roughness={0.18}
              {...glowProps('propeller-shaft', selectedPartId)}
            />
          </mesh>
          <mesh position={[0, 0.04, 0]}>
            <boxGeometry args={[0.02, 0.06, shipAnchors.shaftLength * 0.8]} />
            <meshStandardMaterial color="#38BDF8" emissive="#0284C7" emissiveIntensity={0.45} />
          </mesh>
        </group>

        {/* Hydrodynamic Water Thrust Slipstream Behind Propeller */}
        <group position={shipAnchors.wakeOrigin} onClick={handleSelect('water-thrust')}>
          {[0, 1, 2, 3].map((idx) => (
            <mesh
              key={`wake-${idx}`}
              ref={(el) => {
                wakeRingRefs.current[idx] = el;
              }}
              position={[0, 0, -idx * 0.2]}
            >
              <torusGeometry args={[0.13, 0.014, 8, 24]} />
              <meshBasicMaterial
                color={selectedPartId === 'water-thrust' ? '#7DD3FC' : '#38BDF8'}
                transparent
                opacity={0.55}
              />
            </mesh>
          ))}
        </group>

        {showLabels && (
          <>
            <Html position={[shipAnchors.enginePos[0], shipAnchors.enginePos[1] + 0.36, shipAnchors.enginePos[2]]} center distanceFactor={7}>
              <span className="px-1.5 py-0.5 rounded bg-slate-950/90 border border-amber-500/50 text-[10px] font-mono text-amber-200 whitespace-nowrap">
                Engine (Conceptual)
              </span>
            </Html>
            <Html position={[shipAnchors.wakeOrigin[0], shipAnchors.wakeOrigin[1] + 0.3, shipAnchors.wakeOrigin[2] - 0.3]} center distanceFactor={7}>
              <span className="px-1.5 py-0.5 rounded bg-slate-950/90 border border-cyan-500/50 text-[10px] font-mono text-cyan-200 whitespace-nowrap">
                Water Thrust Wake
              </span>
            </Html>
          </>
        )}
      </group>
    );
  }

  return null;
}
