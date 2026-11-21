import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import {
  evaluateInlineSixKinematics,
  getCylinderXPosition,
  INLINE_SIX_CONFIG,
} from '../../three/inlineSixKinematics';
import type { SceneViewMode } from '../../three/sceneController';

export interface InlineSixEngine3DProps {
  rootRef?: RefObject<THREE.Group | null>;
  crankAngleDeg: number;
  isPlaying: boolean;
  speedMultiplier: number;
  viewMode: SceneViewMode;
  isExploded: boolean;
  selectedComponentId: string | null;
  isolateSelected: boolean;
  showLabels: boolean;
  isSoftwareGl: boolean;
  onCrankAngleTick: (nextAngleDeg: number) => void;
  onSelectComponent: (componentId: string) => void;
}

function getEmissiveProps(
  componentId: string,
  selectedId: string | null,
): { emissive: string; emissiveIntensity: number } {
  return selectedId === componentId
    ? { emissive: '#38BDF8', emissiveIntensity: 0.42 }
    : { emissive: '#000000', emissiveIntensity: 0 };
}

function getOpacity(
  componentId: string,
  selectedId: string | null,
  isolate: boolean,
  baseOpacity = 1,
): number {
  if (!isolate || !selectedId) return baseOpacity;
  return selectedId === componentId ? baseOpacity : Math.min(baseOpacity, 0.14);
}

/**
 * Interactive 3D Inline-Six four-stroke car engine with transparent cutaway block,
 * 6 crank-slider pistons & rods, 6-throw crankshaft, half-speed overhead camshafts,
 * valves, and intake/exhaust manifolds.
 */
export function InlineSixEngine3D({
  rootRef,
  crankAngleDeg,
  isPlaying,
  speedMultiplier,
  viewMode,
  isExploded,
  selectedComponentId,
  isolateSelected,
  showLabels,
  isSoftwareGl,
  onCrankAngleTick,
  onSelectComponent,
}: InlineSixEngine3DProps) {
  const crankDegRef = useRef(crankAngleDeg);
  const lastReportRef = useRef(crankAngleDeg);
  const explodeRef = useRef(isExploded ? 1 : 0);

  if (!isPlaying || Math.abs(crankDegRef.current - crankAngleDeg) > 12) {
    crankDegRef.current = crankAngleDeg;
  }

  // Animated Three.js node refs (zero allocations per frame)
  const crankshaftRef = useRef<THREE.Group>(null);
  const intakeCamRef = useRef<THREE.Group>(null);
  const exhaustCamRef = useRef<THREE.Group>(null);
  const pistonRefs = useRef<(THREE.Group | null)[]>([]);
  const conrodRefs = useRef<(THREE.Group | null)[]>([]);
  const intakeValveRefs = useRef<(THREE.Mesh | null)[]>([]);
  const exhaustValveRefs = useRef<(THREE.Mesh | null)[]>([]);
  const combustionGlowRefs = useRef<(THREE.Mesh | null)[]>([]);
  const valveCoverGroupRef = useRef<THREE.Group>(null);
  const intakeManifoldRef = useRef<THREE.Group>(null);
  const exhaustManifoldRef = useRef<THREE.Group>(null);
  const oilPanRef = useRef<THREE.Group>(null);

  // Build curved manifold runner geometries cleanly
  const { intakeRunnerGeos, exhaustHeaderGeos, camLobeGeo } = useMemo(() => {
    const intakeGeos: THREE.TubeGeometry[] = [];
    const exhaustGeos: THREE.TubeGeometry[] = [];

    for (let i = 1; i <= 6; i += 1) {
      const x = getCylinderXPosition(i);
      const inCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x, 0.98, 0.36),
        new THREE.Vector3(x, 1.04, 0.72),
        new THREE.Vector3(x, 0.84, 1.02),
      ]);
      intakeGeos.push(new THREE.TubeGeometry(inCurve, 14, 0.085, 12, false));

      const exCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x, 0.96, -0.36),
        new THREE.Vector3(x, 0.92, -0.78),
        new THREE.Vector3(x * 0.65, 0.45, -1.06),
      ]);
      exhaustGeos.push(new THREE.TubeGeometry(exCurve, 14, 0.08, 12, false));
    }

    // Egg-shaped cam lobe extruded along X
    const lobeShape = new THREE.Shape();
    lobeShape.absarc(0, 0, 0.075, -Math.PI * 0.35, Math.PI * 1.35, false);
    lobeShape.quadraticCurveTo(0.145, 0, 0.075 * Math.cos(-Math.PI * 0.35), 0.075 * Math.sin(-Math.PI * 0.35));
    const camGeo = new THREE.ExtrudeGeometry(lobeShape, { depth: 0.06, bevelEnabled: false });
    camGeo.center();
    camGeo.rotateY(Math.PI / 2);

    return {
      intakeRunnerGeos: intakeGeos,
      exhaustHeaderGeos: exhaustGeos,
      camLobeGeo: camGeo,
    };
  }, []);

  useEffect(() => {
    return () => {
      intakeRunnerGeos.forEach((g) => g.dispose());
      exhaustHeaderGeos.forEach((g) => g.dispose());
      camLobeGeo.dispose();
    };
  }, [intakeRunnerGeos, exhaustHeaderGeos, camLobeGeo]);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.08);
    if (isPlaying) {
      crankDegRef.current = (crankDegRef.current + dt * 155 * speedMultiplier) % 720;
      if (Math.abs(crankDegRef.current - lastReportRef.current) > 4.5) {
        lastReportRef.current = crankDegRef.current;
        onCrankAngleTick(crankDegRef.current);
      }
    }

    const snap = evaluateInlineSixKinematics(crankDegRef.current);

    if (crankshaftRef.current) {
      crankshaftRef.current.rotation.x = snap.crankAngleRad;
    }
    // Half-speed camshaft timing (0.5x crankshaft angle)
    if (intakeCamRef.current) {
      intakeCamRef.current.rotation.x = snap.camAngleRad;
    }
    if (exhaustCamRef.current) {
      exhaustCamRef.current.rotation.x = snap.camAngleRad;
    }

    for (let idx = 0; idx < snap.cylinders.length; idx += 1) {
      const cyl = snap.cylinders[idx];
      const pistonGroup = pistonRefs.current[idx];
      if (pistonGroup) {
        pistonGroup.position.y = cyl.pistonPinY;
      }
      const rodGroup = conrodRefs.current[idx];
      if (rodGroup) {
        rodGroup.position.set(cyl.xPos, cyl.rodMidY, cyl.rodMidZ);
        rodGroup.rotation.x = cyl.rodAngleX;
      }
      const inValve = intakeValveRefs.current[idx];
      if (inValve) {
        inValve.position.y = 0.96 - cyl.intakeValveLift * 0.14;
      }
      const exValve = exhaustValveRefs.current[idx];
      if (exValve) {
        exValve.position.y = 0.96 - cyl.exhaustValveLift * 0.14;
      }
      const glow = combustionGlowRefs.current[idx];
      if (glow) {
        const mat = glow.material as THREE.MeshStandardMaterial;
        const activeFlash = cyl.combustionIntensity;
        const isIntakeCharge = cyl.strokePhase === 'intake';
        if (activeFlash > 0.04) {
          glow.visible = true;
          mat.color.set('#F97316');
          mat.emissive.set('#EA580C');
          mat.emissiveIntensity = 0.9 + activeFlash * 1.4;
          mat.opacity = 0.35 + activeFlash * 0.52;
        } else if (isIntakeCharge) {
          glow.visible = true;
          mat.color.set('#38BDF8');
          mat.emissive.set('#0284C7');
          mat.emissiveIntensity = 0.45;
          mat.opacity = 0.24;
        } else {
          glow.visible = false;
        }
      }
    }

    // Smooth Exploded view transitions
    const targetExp = isExploded ? 1 : 0;
    if (Math.abs(explodeRef.current - targetExp) > 0.002) {
      explodeRef.current = THREE.MathUtils.damp(explodeRef.current, targetExp, 7, dt);
    }
    const exp = explodeRef.current;
    if (valveCoverGroupRef.current) valveCoverGroupRef.current.position.y = exp * 0.95;
    if (intakeManifoldRef.current) intakeManifoldRef.current.position.z = exp * 0.85;
    if (exhaustManifoldRef.current) exhaustManifoldRef.current.position.z = -exp * 0.85;
    if (oilPanRef.current) oilPanRef.current.position.y = -exp * 0.72;
  });

  const handleClick = (id: string) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelectComponent(id);
  };

  const isCutaway = viewMode === 'cutaway' || viewMode === 'internal';
  const blockOpacity = viewMode === 'internal' ? 0.14 : viewMode === 'cutaway' ? 0.26 : 0.92;
  const snapNow = evaluateInlineSixKinematics(crankAngleDeg);

  return (
    <group ref={rootRef} name="inline-six-root">
      {/* Engine Block & Cutaway Cylinder Housing */}
      <group userData={{ componentId: 'cylinder-block' }} onClick={handleClick('cylinder-block')}>
        <mesh position={[0, 0.18, 0]}>
          <boxGeometry args={[5.15, 1.45, 1.18]} />
          <meshStandardMaterial
            color="#334155"
            metalness={0.62}
            roughness={0.42}
            transparent={isCutaway || isolateSelected}
            opacity={
              isolateSelected && selectedComponentId !== 'cylinder-block'
                ? 0.12
                : blockOpacity
            }
            depthWrite={!isCutaway}
            {...getEmissiveProps('cylinder-block', selectedComponentId)}
          />
        </mesh>

        {/* Cylinder Head Frame */}
        <mesh position={[0, 1.05, 0]}>
          <boxGeometry args={[5.15, 0.34, 1.14]} />
          <meshStandardMaterial
            color="#475569"
            metalness={0.74}
            roughness={0.34}
            transparent={isCutaway || isolateSelected}
            opacity={
              isolateSelected && selectedComponentId !== 'cylinder-block'
                ? 0.12
                : isCutaway
                  ? 0.22
                  : 0.94
            }
            depthWrite={!isCutaway}
          />
        </mesh>

        {/* Rear Flywheel Bellhousing Ring */}
        <mesh position={[-2.78, INLINE_SIX_CONFIG.crankCenterY, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.72, 0.72, 0.16, 32]} />
          <meshStandardMaterial color="#1E293B" metalness={0.85} roughness={0.28} />
        </mesh>

        {/* Explodable Oil Pan Sump */}
        <group ref={oilPanRef}>
          <mesh position={[0, -1.32, 0]}>
            <boxGeometry args={[4.95, 0.36, 1.08]} />
            <meshStandardMaterial
              color="#0F172A"
              metalness={0.65}
              roughness={0.45}
              transparent={isCutaway || isolateSelected}
              opacity={isCutaway ? 0.34 : 0.95}
              depthWrite={!isCutaway}
            />
          </mesh>
        </group>

        {/* Explodable Valve Cover */}
        <group ref={valveCoverGroupRef}>
          <mesh position={[0, 1.48, 0]}>
            <boxGeometry args={[4.95, 0.22, 0.96]} />
            <meshStandardMaterial
              color="#B91C1C"
              metalness={0.45}
              roughness={0.32}
              transparent={isCutaway || isolateSelected}
              opacity={viewMode === 'internal' ? 0.1 : viewMode === 'cutaway' ? 0.24 : 0.94}
              depthWrite={!isCutaway}
            />
          </mesh>
        </group>
      </group>

      {/* Six-Throw Counterweighted Crankshaft */}
      <group
        ref={crankshaftRef}
        userData={{ componentId: 'crankshaft' }}
        position={[0, INLINE_SIX_CONFIG.crankCenterY, 0]}
        onClick={handleClick('crankshaft')}
      >
        {/* Main Crankshaft Center Journal Axis along X */}
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow={!isSoftwareGl}>
          <cylinderGeometry args={[0.11, 0.11, 5.65, 24]} />
          <meshStandardMaterial
            color="#94A3B8"
            metalness={0.9}
            roughness={0.2}
            transparent={isolateSelected && selectedComponentId !== 'crankshaft'}
            opacity={getOpacity('crankshaft', selectedComponentId, isolateSelected)}
            {...getEmissiveProps('crankshaft', selectedComponentId)}
          />
        </mesh>

        {/* 6 Phased Crank Throws & Counterweights */}
        {snapNow.cylinders.map((cyl) => {
          const throwRad = ((360 - cyl.firingOffsetDeg) * Math.PI) / 180;
          const pinY = INLINE_SIX_CONFIG.crankRadius * Math.cos(throwRad);
          const pinZ = INLINE_SIX_CONFIG.crankRadius * Math.sin(throwRad);
          return (
            <group key={`throw-${cyl.cylinderNumber}`} position={[cyl.xPos, 0, 0]}>
              {/* Crank Webs */}
              <group rotation={[throwRad, 0, 0]}>
                <mesh position={[-0.14, 0.04, 0]}>
                  <boxGeometry args={[0.06, 0.56, 0.26]} />
                  <meshStandardMaterial color="#475569" metalness={0.85} roughness={0.26} />
                </mesh>
                <mesh position={[0.14, 0.04, 0]}>
                  <boxGeometry args={[0.06, 0.56, 0.26]} />
                  <meshStandardMaterial color="#475569" metalness={0.85} roughness={0.26} />
                </mesh>
              </group>
              {/* Crankpin */}
              <mesh position={[0, pinY, pinZ]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.085, 0.085, 0.24, 18]} />
                <meshStandardMaterial color="#38BDF8" metalness={0.85} roughness={0.2} />
              </mesh>
            </group>
          );
        })}

        {/* Front Harmonic Balancer Pulley */}
        <mesh position={[2.76, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.28, 0.28, 0.14, 24]} />
          <meshStandardMaterial color="#1E293B" metalness={0.88} roughness={0.25} />
        </mesh>
      </group>

      {/* Dual Half-Speed Overhead Camshafts (0.5x Crankshaft Speed) */}
      <group userData={{ componentId: 'camshaft' }} onClick={handleClick('camshaft')}>
        {/* Intake Camshaft (+Z side) */}
        <group ref={intakeCamRef} position={[0, INLINE_SIX_CONFIG.camCenterY, 0.22]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.055, 0.055, 5.25, 18]} />
            <meshStandardMaterial
              color="#CBD5E1"
              metalness={0.9}
              roughness={0.2}
              transparent={isolateSelected && selectedComponentId !== 'camshaft'}
              opacity={getOpacity('camshaft', selectedComponentId, isolateSelected)}
              {...getEmissiveProps('camshaft', selectedComponentId)}
            />
          </mesh>
          {/* 2:1 Cam Sprocket */}
          <mesh position={[2.68, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.26, 0.26, 0.06, 24]} />
            <meshStandardMaterial color="#F59E0B" metalness={0.82} roughness={0.25} />
          </mesh>
          {snapNow.cylinders.map((cyl) => (
            <mesh
              key={`in-lobe-${cyl.cylinderNumber}`}
              geometry={camLobeGeo}
              position={[cyl.xPos, 0, 0]}
              rotation={[(cyl.firingOffsetDeg * 0.5 * Math.PI) / 180 + Math.PI * 0.72, 0, 0]}
            >
              <meshStandardMaterial color="#94A3B8" metalness={0.88} roughness={0.22} />
            </mesh>
          ))}
        </group>

        {/* Exhaust Camshaft (-Z side) */}
        <group ref={exhaustCamRef} position={[0, INLINE_SIX_CONFIG.camCenterY, -0.22]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.055, 0.055, 5.25, 18]} />
            <meshStandardMaterial
              color="#CBD5E1"
              metalness={0.9}
              roughness={0.2}
              transparent={isolateSelected && selectedComponentId !== 'camshaft'}
              opacity={getOpacity('camshaft', selectedComponentId, isolateSelected)}
              {...getEmissiveProps('camshaft', selectedComponentId)}
            />
          </mesh>
          <mesh position={[2.68, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.26, 0.26, 0.06, 24]} />
            <meshStandardMaterial color="#F59E0B" metalness={0.82} roughness={0.25} />
          </mesh>
          {snapNow.cylinders.map((cyl) => (
            <mesh
              key={`ex-lobe-${cyl.cylinderNumber}`}
              geometry={camLobeGeo}
              position={[cyl.xPos, 0, 0]}
              rotation={[(cyl.firingOffsetDeg * 0.5 * Math.PI) / 180 + Math.PI * 0.22, 0, 0]}
            >
              <meshStandardMaterial color="#94A3B8" metalness={0.88} roughness={0.22} />
            </mesh>
          ))}
        </group>

        {/* Front Timing Chain / Belt Guide */}
        <mesh position={[2.72, 0.24, 0]} rotation={[0, 0, 0]}>
          <boxGeometry args={[0.06, 2.04, 0.62]} />
          <meshStandardMaterial color="#1E293B" metalness={0.5} roughness={0.6} transparent opacity={0.45} />
        </mesh>
      </group>

      {/* Six Selectable Cylinders (Pistons, Rings, Rods, Valves, Combustion Glow) */}
      {snapNow.cylinders.map((cyl, idx) => {
        const isSelected = selectedComponentId === cyl.componentId;
        const cylOpacity = getOpacity(cyl.componentId, selectedComponentId, isolateSelected);
        return (
          <group
            key={cyl.componentId}
            userData={{ componentId: cyl.componentId }}
            onClick={handleClick(cyl.componentId)}
          >
            {/* Transparent Cylinder Bore Sleeve */}
            <mesh position={[cyl.xPos, 0.34, 0]}>
              <cylinderGeometry args={[0.31, 0.31, 1.05, 24, 1, true]} />
              <meshStandardMaterial
                color={isSelected ? '#38BDF8' : '#64748B'}
                metalness={0.75}
                roughness={0.25}
                transparent
                opacity={isSelected ? 0.36 : 0.16}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>

            {/* Spark Plug / Ignition Tip */}
            <mesh position={[cyl.xPos, 1.08, 0]}>
              <cylinderGeometry args={[0.032, 0.032, 0.28, 12]} />
              <meshStandardMaterial color="#F8FAFC" metalness={0.3} roughness={0.4} />
            </mesh>

            {/* Combustion / Air-Charge Volumetric Flash */}
            <mesh
              ref={(el) => {
                combustionGlowRefs.current[idx] = el;
              }}
              position={[cyl.xPos, 0.72, 0]}
            >
              <cylinderGeometry args={[0.27, 0.27, 0.24, 20]} />
              <meshStandardMaterial
                color="#F97316"
                emissive="#EA580C"
                emissiveIntensity={1}
                transparent
                opacity={0.65}
                depthWrite={false}
              />
            </mesh>

            {/* Reciprocating Piston Crown & Compression Rings */}
            <group
              ref={(el) => {
                pistonRefs.current[idx] = el;
              }}
              position={[cyl.xPos, cyl.pistonPinY, 0]}
            >
              <mesh castShadow={!isSoftwareGl}>
                <cylinderGeometry args={[0.285, 0.285, 0.32, 24]} />
                <meshStandardMaterial
                  color="#CBD5E1"
                  metalness={0.88}
                  roughness={0.2}
                  transparent={isolateSelected && !isSelected}
                  opacity={cylOpacity}
                  {...getEmissiveProps(cyl.componentId, selectedComponentId)}
                />
              </mesh>
              {/* Dual Compression Rings */}
              <mesh position={[0, 0.09, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.288, 0.014, 8, 24]} />
                <meshStandardMaterial color="#F59E0B" metalness={0.88} roughness={0.22} />
              </mesh>
              <mesh position={[0, 0.03, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.288, 0.014, 8, 24]} />
                <meshStandardMaterial color="#F59E0B" metalness={0.88} roughness={0.22} />
              </mesh>
              {/* Wrist Pin */}
              <mesh rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.05, 0.05, 0.44, 14]} />
                <meshStandardMaterial color="#64748B" metalness={0.9} roughness={0.18} />
              </mesh>
            </group>

            {/* Articulated Connecting Rod */}
            <group
              ref={(el) => {
                conrodRefs.current[idx] = el;
              }}
              position={[cyl.xPos, cyl.rodMidY, cyl.rodMidZ]}
              rotation={[cyl.rodAngleX, 0, 0]}
            >
              <mesh castShadow={!isSoftwareGl}>
                <boxGeometry args={[0.09, INLINE_SIX_CONFIG.rodLength, 0.1]} />
                <meshStandardMaterial
                  color="#94A3B8"
                  metalness={0.86}
                  roughness={0.26}
                  transparent={isolateSelected && !isSelected}
                  opacity={cylOpacity}
                  {...getEmissiveProps(cyl.componentId, selectedComponentId)}
                />
              </mesh>
              <mesh position={[0, -INLINE_SIX_CONFIG.rodLength * 0.48, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.125, 0.125, 0.14, 16]} />
                <meshStandardMaterial color="#D97706" metalness={0.85} roughness={0.24} />
              </mesh>
            </group>

            {/* Intake & Exhaust Valves */}
            <mesh
              ref={(el) => {
                intakeValveRefs.current[idx] = el;
              }}
              position={[cyl.xPos, 0.96, 0.18]}
            >
              <cylinderGeometry args={[0.022, 0.095, 0.24, 14]} />
              <meshStandardMaterial color="#38BDF8" metalness={0.85} roughness={0.22} />
            </mesh>
            <mesh
              ref={(el) => {
                exhaustValveRefs.current[idx] = el;
              }}
              position={[cyl.xPos, 0.96, -0.18]}
            >
              <cylinderGeometry args={[0.022, 0.095, 0.24, 14]} />
              <meshStandardMaterial color="#F97316" metalness={0.85} roughness={0.22} />
            </mesh>

            {showLabels && (
              <Html position={[cyl.xPos, 1.72, 0]} center distanceFactor={9}>
                <span
                  className={`px-1.5 py-0.5 rounded border text-[10px] font-mono whitespace-nowrap ${
                    isSelected
                      ? 'bg-cyan-950/95 border-cyan-400 text-cyan-200'
                      : 'bg-slate-950/90 border-slate-700 text-slate-300'
                  }`}
                >
                  Cyl {cyl.cylinderNumber} · {cyl.strokePhase}
                </span>
              </Html>
            )}
          </group>
        );
      })}

      {/* Intake Manifold & Plenum (+Z) */}
      <group
        ref={intakeManifoldRef}
        userData={{ componentId: 'intake-manifold' }}
        onClick={handleClick('intake-manifold')}
      >
        <mesh position={[0, 0.84, 1.05]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.16, 0.16, 4.4, 20]} />
          <meshStandardMaterial
            color="#0284C7"
            metalness={0.62}
            roughness={0.34}
            transparent={isolateSelected && selectedComponentId !== 'intake-manifold'}
            opacity={getOpacity('intake-manifold', selectedComponentId, isolateSelected)}
            {...getEmissiveProps('intake-manifold', selectedComponentId)}
          />
        </mesh>
        {intakeRunnerGeos.map((geo, i) => (
          <mesh key={`in-run-${i}`} geometry={geo}>
            <meshStandardMaterial
              color="#38BDF8"
              metalness={0.65}
              roughness={0.32}
              transparent={isolateSelected && selectedComponentId !== 'intake-manifold'}
              opacity={getOpacity('intake-manifold', selectedComponentId, isolateSelected)}
            />
          </mesh>
        ))}
      </group>

      {/* Exhaust Manifold Headers (-Z) */}
      <group
        ref={exhaustManifoldRef}
        userData={{ componentId: 'exhaust-manifold' }}
        onClick={handleClick('exhaust-manifold')}
      >
        <mesh position={[0, 0.42, -1.08]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.15, 0.15, 3.6, 20]} />
          <meshStandardMaterial
            color="#B45309"
            metalness={0.82}
            roughness={0.28}
            transparent={isolateSelected && selectedComponentId !== 'exhaust-manifold'}
            opacity={getOpacity('exhaust-manifold', selectedComponentId, isolateSelected)}
            {...getEmissiveProps('exhaust-manifold', selectedComponentId)}
          />
        </mesh>
        {exhaustHeaderGeos.map((geo, i) => (
          <mesh key={`ex-hdr-${i}`} geometry={geo}>
            <meshStandardMaterial
              color="#D97706"
              metalness={0.82}
              roughness={0.28}
              transparent={isolateSelected && selectedComponentId !== 'exhaust-manifold'}
              opacity={getOpacity('exhaust-manifold', selectedComponentId, isolateSelected)}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}
