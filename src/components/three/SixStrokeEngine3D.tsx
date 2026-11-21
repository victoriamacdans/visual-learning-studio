import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import {
  evaluateSixStrokeKinematics,
  SIX_STROKE_GEOMETRY,
  SIX_STROKE_VARIANTS,
  type SixStrokeVariantId,
} from '../../three/sixStrokeKinematics';
import type { SceneViewMode } from '../../three/sceneController';

export interface SixStrokeEngine3DProps {
  rootRef?: RefObject<THREE.Group | null>;
  variant: SixStrokeVariantId;
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

function getEmissive(
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
  return selectedId === componentId ? baseOpacity : Math.min(baseOpacity, 0.16);
}

/**
 * Detailed Single-Cylinder Engine Cutaway (Six-Stroke Reference & Mechanical Baseline).
 * - Exact planar slider-crank geometry with Lathe piston + 3 rings + wrist pin,
 *   H-beam connecting rod, extruded counterweighted crankshaft + toothed flywheel,
 *   cutaway finned cylinder block, cylinder head w/ spark plug, helical valve springs,
 *   curved Tube intake/exhaust passages, and conditional water injector ONLY in the
 *   explicitly labeled Crower-style water-steam variant.
 */
export function SixStrokeEngine3D({
  rootRef,
  variant,
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
}: SixStrokeEngine3DProps) {
  const variantMeta = SIX_STROKE_VARIANTS[variant];
  const cycleDegrees = variantMeta.cycleDegrees;
  const crankDegRef = useRef(crankAngleDeg);
  const lastReportRef = useRef(crankAngleDeg);
  const explodeRef = useRef(isExploded ? 1 : 0);

  if (!isPlaying || Math.abs(crankDegRef.current - crankAngleDeg) > 14) {
    crankDegRef.current = crankAngleDeg;
  }

  // Animated Three.js refs
  const crankGroupRef = useRef<THREE.Group>(null);
  const pistonGroupRef = useRef<THREE.Group>(null);
  const conrodGroupRef = useRef<THREE.Group>(null);
  const intakeCamRef = useRef<THREE.Group>(null);
  const exhaustCamRef = useRef<THREE.Group>(null);
  const intakeValveRef = useRef<THREE.Group>(null);
  const exhaustValveRef = useRef<THREE.Group>(null);
  const combustionChamberGlowRef = useRef<THREE.Mesh>(null);
  const sparkArcRef = useRef<THREE.Mesh>(null);
  const waterMistRef = useRef<THREE.Mesh>(null);

  // Explodable assemblies
  const headExplodeRef = useRef<THREE.Group>(null);
  const manifoldExplodeRef = useRef<THREE.Group>(null);
  const flywheelExplodeRef = useRef<THREE.Group>(null);

  // Build crisp procedural engineering geometries & dispose on unmount
  const geometries = useMemo(() => {
    const r = SIX_STROKE_GEOMETRY.pistonRadius;
    const boreR = SIX_STROKE_GEOMETRY.boreRadius;

    // 1. Cutaway Cylinder Bore Sleeve (225 deg open arc facing front +Z viewer)
    const sleeveCutawayGeo = new THREE.CylinderGeometry(
      boreR,
      boreR,
      1.36,
      36,
      1,
      true,
      Math.PI * 0.45,
      Math.PI * 1.35,
    );
    const outerJacketGeo = new THREE.CylinderGeometry(
      boreR + 0.14,
      boreR + 0.14,
      1.32,
      36,
      1,
      true,
      Math.PI * 0.48,
      Math.PI * 1.29,
    );

    // 2. Lathe Piston Crown & Skirt with Ring Land Grooves
    const pistonProfile: THREE.Vector2[] = [
      new THREE.Vector2(0.005, 0.27),
      new THREE.Vector2(r * 0.78, 0.27),
      new THREE.Vector2(r * 0.96, 0.23),
      new THREE.Vector2(r, 0.19),
      new THREE.Vector2(r - 0.03, 0.16),
      new THREE.Vector2(r, 0.13),
      new THREE.Vector2(r - 0.03, 0.1),
      new THREE.Vector2(r, 0.07),
      new THREE.Vector2(r - 0.03, 0.04),
      new THREE.Vector2(r, 0.01),
      new THREE.Vector2(r * 0.98, -0.26),
      new THREE.Vector2(r * 0.82, -0.26),
      new THREE.Vector2(r * 0.78, -0.08),
      new THREE.Vector2(0.005, -0.06),
    ];
    const pistonGeo = new THREE.LatheGeometry(pistonProfile, 32);

    // 3. Crank Counterweight Teardrop Extrusion
    const webShape = new THREE.Shape();
    webShape.absarc(0, 0, 0.34, Math.PI * 0.18, Math.PI * 0.82, false);
    webShape.lineTo(-0.24, -0.46);
    webShape.absarc(0, -0.44, 0.24, Math.PI, Math.PI * 2, false);
    webShape.closePath();
    const counterweightGeo = new THREE.ExtrudeGeometry(webShape, {
      depth: 0.11,
      bevelEnabled: true,
      bevelThickness: 0.015,
      bevelSize: 0.015,
      bevelSegments: 2,
    });
    counterweightGeo.center();

    // 4. Toothed Flywheel Ring Gear
    const gearShape = new THREE.Shape();
    const teeth = 28;
    const outerR = 0.68;
    const innerR = 0.62;
    for (let i = 0; i < teeth * 2; i += 1) {
      const a = (i / (teeth * 2)) * Math.PI * 2;
      const rad = i % 2 === 0 ? outerR : innerR;
      if (i === 0) gearShape.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
      else gearShape.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    gearShape.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, 0, 0.14, 0, Math.PI * 2, true);
    gearShape.holes.push(hole);
    const flywheelGeo = new THREE.ExtrudeGeometry(gearShape, {
      depth: 0.12,
      bevelEnabled: false,
    });
    flywheelGeo.center();

    // 5. Egg-shaped Cam Lobe
    const lobeShape = new THREE.Shape();
    lobeShape.absarc(0, 0, 0.085, -Math.PI * 0.35, Math.PI * 1.35, false);
    lobeShape.quadraticCurveTo(
      0.165,
      0,
      0.085 * Math.cos(-Math.PI * 0.35),
      0.085 * Math.sin(-Math.PI * 0.35),
    );
    const camLobeGeo = new THREE.ExtrudeGeometry(lobeShape, {
      depth: 0.075,
      bevelEnabled: false,
    });
    camLobeGeo.center();

    // 6. Helical Valve Coil Spring
    const springPts: THREE.Vector3[] = [];
    const springTurns = 5;
    const springSamples = 50;
    for (let i = 0; i <= springSamples; i += 1) {
      const t = i / springSamples;
      const a = t * Math.PI * 2 * springTurns;
      springPts.push(new THREE.Vector3(Math.cos(a) * 0.072, t * 0.24, Math.sin(a) * 0.072));
    }
    const springGeo = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(springPts),
      40,
      0.013,
      8,
      false,
    );

    // 7. Curved Intake & Exhaust Port Tubes
    const intakeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.22, 1.48, 0),
      new THREE.Vector3(-0.62, 1.56, 0.06),
      new THREE.Vector3(-1.05, 1.48, 0.12),
    ]);
    const intakeTubeGeo = new THREE.TubeGeometry(intakeCurve, 22, 0.125, 16, false);

    const exhaustCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.22, 1.48, 0),
      new THREE.Vector3(0.65, 1.54, -0.06),
      new THREE.Vector3(1.12, 1.36, -0.14),
    ]);
    const exhaustTubeGeo = new THREE.TubeGeometry(exhaustCurve, 22, 0.12, 16, false);

    return {
      sleeveCutawayGeo,
      outerJacketGeo,
      pistonGeo,
      counterweightGeo,
      flywheelGeo,
      camLobeGeo,
      springGeo,
      intakeTubeGeo,
      exhaustTubeGeo,
    };
  }, []);

  useEffect(() => {
    return () => {
      Object.values(geometries).forEach((g) => g.dispose());
    };
  }, [geometries]);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.08);
    if (isPlaying) {
      crankDegRef.current =
        (crankDegRef.current + dt * 165 * speedMultiplier) % cycleDegrees;
      if (Math.abs(crankDegRef.current - lastReportRef.current) > 4.5) {
        lastReportRef.current = crankDegRef.current;
        onCrankAngleTick(crankDegRef.current);
      }
    }

    const k = evaluateSixStrokeKinematics(crankDegRef.current, variant);

    // 1. Crankshaft rotation around Z axis (crankpin sweeps in XY plane)
    if (crankGroupRef.current) {
      crankGroupRef.current.rotation.z = -k.crankAngleRad;
    }

    // 2. Piston vertical reciprocation along Y
    if (pistonGroupRef.current) {
      pistonGroupRef.current.position.y = k.wristPinY;
    }

    // 3. Connecting rod midpoint & exact tilt around Z
    if (conrodGroupRef.current) {
      conrodGroupRef.current.position.set(k.rodMidpoint[0], k.rodMidpoint[1], 0);
      conrodGroupRef.current.rotation.z = -k.rodTiltRad;
    }

    // 4. Overhead cams & valves
    if (intakeCamRef.current) {
      intakeCamRef.current.rotation.z = -k.camAngleRad;
    }
    if (exhaustCamRef.current) {
      exhaustCamRef.current.rotation.z = -k.camAngleRad;
    }
    if (intakeValveRef.current) {
      intakeValveRef.current.position.y = 1.5 - k.intakeValveLift * 0.16;
    }
    if (exhaustValveRef.current) {
      exhaustValveRef.current.position.y = 1.5 - k.exhaustValveLift * 0.16;
    }

    // 5. Combustion / Steam chamber glow & spark indicator
    if (combustionChamberGlowRef.current) {
      const mat = combustionChamberGlowRef.current.material as THREE.MeshStandardMaterial;
      if (k.steamExpansionIntensity > 0.05) {
        combustionChamberGlowRef.current.visible = true;
        mat.color.set('#38BDF8');
        mat.emissive.set('#0EA5E9');
        mat.emissiveIntensity = 0.7 + k.steamExpansionIntensity * 1.4;
        mat.opacity = 0.25 + k.steamExpansionIntensity * 0.45;
      } else if (k.combustionHeatIntensity > 0.05) {
        combustionChamberGlowRef.current.visible = true;
        mat.color.set('#FB923C');
        mat.emissive.set('#EA580C');
        mat.emissiveIntensity = 0.8 + k.combustionHeatIntensity * 1.8;
        mat.opacity = 0.28 + k.combustionHeatIntensity * 0.55;
      } else if (k.strokePhase === 'intake' || k.strokePhase === 'secondary-scavenge') {
        combustionChamberGlowRef.current.visible = true;
        mat.color.set('#22D3EE');
        mat.emissive.set('#0284C7');
        mat.emissiveIntensity = 0.35;
        mat.opacity = 0.22;
      } else {
        combustionChamberGlowRef.current.visible = false;
      }
    }

    if (sparkArcRef.current) {
      sparkArcRef.current.visible = k.sparkIntensity > 0.12;
      sparkArcRef.current.scale.setScalar(0.6 + k.sparkIntensity * 0.9);
    }

    if (waterMistRef.current) {
      waterMistRef.current.visible =
        variantMeta.hasWaterInjection && k.waterInjectorActive > 0.05;
      const mat = waterMistRef.current.material as THREE.MeshStandardMaterial;
      mat.opacity = k.waterInjectorActive * 0.7;
    }

    // 6. Smooth Exploded View
    const targetExp = isExploded ? 1 : 0;
    if (Math.abs(explodeRef.current - targetExp) > 0.002) {
      explodeRef.current = THREE.MathUtils.damp(explodeRef.current, targetExp, 6.8, dt);
    }
    const exp = explodeRef.current;
    if (headExplodeRef.current) headExplodeRef.current.position.y = exp * 0.75;
    if (manifoldExplodeRef.current) manifoldExplodeRef.current.position.y = exp * 0.52;
    if (flywheelExplodeRef.current) flywheelExplodeRef.current.position.z = -exp * 0.75;
  });

  const handleClick = (id: string) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelectComponent(id);
  };

  const isCutaway = viewMode === 'cutaway' || viewMode === 'internal';
  const kNow = evaluateSixStrokeKinematics(crankAngleDeg, variant);
  const blockOpacity = viewMode === 'internal' ? 0.16 : isCutaway ? 0.34 : 0.94;
  const geom = SIX_STROKE_GEOMETRY;

  return (
    <group ref={rootRef} name="six-stroke-engine-root">
      {/* 1. CYLINDER BLOCK, COOLING FINS & CRANKCASE CUTAWAY */}
      <group userData={{ componentId: 'cylinder-block' }} onClick={handleClick('cylinder-block')}>
        {/* Honed Steel Cylinder Bore Liner */}
        <mesh geometry={geometries.sleeveCutawayGeo} position={[0, 0.7, 0]}>
          <meshStandardMaterial
            color="#94A3B8"
            metalness={0.86}
            roughness={0.22}
            side={THREE.DoubleSide}
            transparent={isolateSelected && selectedComponentId !== 'cylinder-block'}
            opacity={getOpacity('cylinder-block', selectedComponentId, isolateSelected, 0.92)}
            {...getEmissive('cylinder-block', selectedComponentId)}
          />
        </mesh>

        {/* Outer Cast Block Jacket */}
        <mesh geometry={geometries.outerJacketGeo} position={[0, 0.7, 0]}>
          <meshStandardMaterial
            color="#334155"
            metalness={0.62}
            roughness={0.44}
            side={THREE.DoubleSide}
            transparent={isCutaway || isolateSelected}
            opacity={getOpacity(
              'cylinder-block',
              selectedComponentId,
              isolateSelected,
              blockOpacity + 0.18,
            )}
            {...getEmissive('cylinder-block', selectedComponentId)}
          />
        </mesh>

        {/* Horizontal Air-Cooling Fins around Rear/Sides */}
        {[0.28, 0.48, 0.68, 0.88, 1.08].map((yPos) => (
          <mesh
            key={`fin-${yPos}`}
            position={[0, yPos, -0.14]}
            rotation={[0, 0, 0]}
          >
            <boxGeometry args={[1.56, 0.04, 1.24]} />
            <meshStandardMaterial
              color="#475569"
              metalness={0.72}
              roughness={0.36}
              transparent={isCutaway || isolateSelected}
              opacity={getOpacity(
                'cylinder-block',
                selectedComponentId,
                isolateSelected,
                isCutaway ? 0.48 : 0.94,
              )}
            />
          </mesh>
        ))}

        {/* Lower Split Crankcase Housing (open front window) */}
        <mesh position={[0, geom.crankCenterY - 0.14, -0.18]}>
          <boxGeometry args={[1.64, 1.15, 0.92]} />
          <meshStandardMaterial
            color="#1E293B"
            metalness={0.68}
            roughness={0.42}
            transparent={isCutaway || isolateSelected}
            opacity={getOpacity(
              'cylinder-block',
              selectedComponentId,
              isolateSelected,
              isCutaway ? 0.56 : 0.94,
            )}
          />
        </mesh>

        {/* Sump Base Plate */}
        <mesh position={[0, -1.62, 0]} receiveShadow={!isSoftwareGl}>
          <boxGeometry args={[1.76, 0.18, 1.38]} />
          <meshStandardMaterial color="#0F172A" metalness={0.75} roughness={0.38} />
        </mesh>
      </group>

      {/* 2. CYLINDER HEAD, SPARK PLUG & COMBUSTION DOME */}
      <group
        ref={headExplodeRef}
        userData={{ componentId: 'cylinder-head' }}
        onClick={handleClick('cylinder-head')}
      >
        <mesh position={[0, 1.62, -0.08]}>
          <boxGeometry args={[1.62, 0.44, 1.24]} />
          <meshStandardMaterial
            color="#475569"
            metalness={0.74}
            roughness={0.34}
            transparent={isCutaway || isolateSelected}
            opacity={getOpacity(
              'cylinder-head',
              selectedComponentId,
              isolateSelected,
              isCutaway ? 0.36 : 0.94,
            )}
            depthWrite={!isCutaway}
            {...getEmissive('cylinder-head', selectedComponentId)}
          />
        </mesh>

        {/* Spark Plug Ceramic Insulator + Metal Hex */}
        <group position={[0, 1.72, 0]}>
          <mesh position={[0, 0.12, 0]}>
            <cylinderGeometry args={[0.045, 0.045, 0.24, 14]} />
            <meshStandardMaterial color="#F8FAFC" metalness={0.12} roughness={0.32} />
          </mesh>
          <mesh position={[0, -0.04, 0]}>
            <cylinderGeometry args={[0.068, 0.068, 0.12, 6]} />
            <meshStandardMaterial color="#CBD5E1" metalness={0.9} roughness={0.22} />
          </mesh>
          <mesh position={[0, -0.18, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.18, 10]} />
            <meshStandardMaterial color="#F59E0B" metalness={0.85} roughness={0.25} />
          </mesh>
          <mesh ref={sparkArcRef} position={[0, -0.28, 0]}>
            <sphereGeometry args={[0.07, 12, 12]} />
            <meshBasicMaterial color="#E0F2FE" />
          </mesh>
        </group>

        {/* Combustion / Steam Expansion Volumetric Chamber Glow */}
        <mesh ref={combustionChamberGlowRef} position={[0, 1.22, 0]}>
          <cylinderGeometry args={[0.48, 0.52, 0.36, 24]} />
          <meshStandardMaterial
            color="#FB923C"
            emissive="#EA580C"
            emissiveIntensity={1.2}
            transparent
            opacity={0.55}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* 3. LATHE PISTON, 3 RINGS & WRIST PIN */}
      <group
        ref={pistonGroupRef}
        userData={{ componentId: 'piston' }}
        position={[0, kNow.wristPinY, 0]}
        onClick={handleClick('piston')}
      >
        <mesh geometry={geometries.pistonGeo} castShadow={!isSoftwareGl}>
          <meshStandardMaterial
            color="#E2E8F0"
            metalness={0.9}
            roughness={0.2}
            transparent={isolateSelected && selectedComponentId !== 'piston'}
            opacity={getOpacity('piston', selectedComponentId, isolateSelected)}
            {...getEmissive('piston', selectedComponentId)}
          />
        </mesh>
        {/* 2 Compression Rings + 1 Oil Control Ring */}
        {[0.175, 0.115, 0.055].map((ringY, idx) => (
          <mesh key={`ring-${ringY}`} position={[0, ringY, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[geom.pistonRadius + 0.004, 0.014, 10, 32]} />
            <meshStandardMaterial
              color={idx < 2 ? '#F59E0B' : '#38BDF8'}
              metalness={0.88}
              roughness={0.22}
            />
          </mesh>
        ))}
        {/* Hardened Steel Wrist Pin (along Z) */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.075, 0.075, 0.88, 18]} />
          <meshStandardMaterial color="#64748B" metalness={0.92} roughness={0.18} />
        </mesh>
      </group>

      {/* 4. H-BEAM CONNECTING ROD */}
      <group
        ref={conrodGroupRef}
        userData={{ componentId: 'connecting-rod' }}
        position={[kNow.rodMidpoint[0], kNow.rodMidpoint[1], 0]}
        rotation={[0, 0, -kNow.rodTiltRad]}
        onClick={handleClick('connecting-rod')}
      >
        {/* Central I/H-beam shank */}
        <mesh castShadow={!isSoftwareGl}>
          <boxGeometry args={[0.14, geom.rodLength, 0.12]} />
          <meshStandardMaterial
            color="#94A3B8"
            metalness={0.86}
            roughness={0.26}
            transparent={isolateSelected && selectedComponentId !== 'connecting-rod'}
            opacity={getOpacity('connecting-rod', selectedComponentId, isolateSelected)}
            {...getEmissive('connecting-rod', selectedComponentId)}
          />
        </mesh>
        {/* Web pocket flanges */}
        <mesh position={[0.07, 0, 0]}>
          <boxGeometry args={[0.03, geom.rodLength * 0.72, 0.17]} />
          <meshStandardMaterial color="#64748B" metalness={0.88} roughness={0.24} />
        </mesh>
        <mesh position={[-0.07, 0, 0]}>
          <boxGeometry args={[0.03, geom.rodLength * 0.72, 0.17]} />
          <meshStandardMaterial color="#64748B" metalness={0.88} roughness={0.24} />
        </mesh>
        {/* Small-end Wrist Bearing Eye */}
        <mesh position={[0, geom.rodLength * 0.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.11, 0.11, 0.18, 20]} />
          <meshStandardMaterial color="#CBD5E1" metalness={0.9} roughness={0.2} />
        </mesh>
        {/* Big-end Crankpin Bearing Cap */}
        <mesh position={[0, -geom.rodLength * 0.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.175, 0.175, 0.22, 24]} />
          <meshStandardMaterial color="#D97706" metalness={0.86} roughness={0.24} />
        </mesh>
      </group>

      {/* 5. CRANKSHAFT, COUNTERWEIGHTS, CRANKPIN & TOOTHED FLYWHEEL */}
      <group
        ref={crankGroupRef}
        userData={{ componentId: 'crankshaft' }}
        position={[0, geom.crankCenterY, 0]}
        rotation={[0, 0, -kNow.crankAngleRad]}
        onClick={handleClick('crankshaft')}
      >
        {/* Main Crankshaft Journal along Z */}
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow={!isSoftwareGl}>
          <cylinderGeometry args={[0.13, 0.13, 1.38, 24]} />
          <meshStandardMaterial
            color="#94A3B8"
            metalness={0.9}
            roughness={0.2}
            transparent={isolateSelected && selectedComponentId !== 'crankshaft'}
            opacity={getOpacity('crankshaft', selectedComponentId, isolateSelected)}
            {...getEmissive('crankshaft', selectedComponentId)}
          />
        </mesh>
        {/* Dual Forged Counterweight Webs */}
        <mesh geometry={geometries.counterweightGeo} position={[0, -0.08, -0.22]}>
          <meshStandardMaterial
            color="#475569"
            metalness={0.86}
            roughness={0.28}
            {...getEmissive('crankshaft', selectedComponentId)}
          />
        </mesh>
        <mesh geometry={geometries.counterweightGeo} position={[0, -0.08, 0.22]}>
          <meshStandardMaterial
            color="#475569"
            metalness={0.86}
            roughness={0.28}
            {...getEmissive('crankshaft', selectedComponentId)}
          />
        </mesh>
        {/* Offset Crankpin at Y = +crankRadius (TDC at theta=0) */}
        <mesh position={[0, geom.crankRadius, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.105, 0.105, 0.34, 20]} />
          <meshStandardMaterial color="#38BDF8" metalness={0.88} roughness={0.18} />
        </mesh>
        {/* Rear Toothed Flywheel */}
        <group ref={flywheelExplodeRef}>
          <mesh geometry={geometries.flywheelGeo} position={[0, 0, -0.58]}>
            <meshStandardMaterial color="#1E293B" metalness={0.88} roughness={0.26} />
          </mesh>
        </group>
      </group>

      {/* 6. OVERHEAD CAMSHAFTS, POPPET VALVES & HELICAL SPRINGS */}
      <group userData={{ componentId: 'valves-camtrain' }} onClick={handleClick('valves-camtrain')}>
        {/* Intake Cam & Helical Spring (-X side) */}
        <group ref={intakeCamRef} position={[-0.25, 1.88, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.055, 0.055, 0.65, 16]} />
            <meshStandardMaterial
              color="#CBD5E1"
              metalness={0.9}
              roughness={0.2}
              {...getEmissive('valves-camtrain', selectedComponentId)}
            />
          </mesh>
          <mesh geometry={geometries.camLobeGeo} rotation={[0, 0, Math.PI * 0.5]}>
            <meshStandardMaterial color="#94A3B8" metalness={0.88} roughness={0.22} />
          </mesh>
        </group>

        {/* Exhaust Cam & Helical Spring (+X side) */}
        <group ref={exhaustCamRef} position={[0.25, 1.88, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.055, 0.055, 0.65, 16]} />
            <meshStandardMaterial
              color="#CBD5E1"
              metalness={0.9}
              roughness={0.2}
              {...getEmissive('valves-camtrain', selectedComponentId)}
            />
          </mesh>
          <mesh geometry={geometries.camLobeGeo} rotation={[0, 0, -Math.PI * 0.35]}>
            <meshStandardMaterial color="#94A3B8" metalness={0.88} roughness={0.22} />
          </mesh>
        </group>

        {/* Intake Poppet Valve + Helical Spring */}
        <group ref={intakeValveRef} position={[-0.24, 1.5, 0]}>
          <mesh>
            <cylinderGeometry args={[0.025, 0.135, 0.36, 18]} />
            <meshStandardMaterial
              color="#38BDF8"
              metalness={0.86}
              roughness={0.22}
              {...getEmissive('valves-camtrain', selectedComponentId)}
            />
          </mesh>
          <mesh geometry={geometries.springGeo} position={[0, 0.04, 0]}>
            <meshStandardMaterial color="#E2E8F0" metalness={0.9} roughness={0.22} />
          </mesh>
        </group>

        {/* Exhaust Poppet Valve + Helical Spring */}
        <group ref={exhaustValveRef} position={[0.24, 1.5, 0]}>
          <mesh>
            <cylinderGeometry args={[0.025, 0.135, 0.36, 18]} />
            <meshStandardMaterial
              color="#F97316"
              metalness={0.86}
              roughness={0.22}
              {...getEmissive('valves-camtrain', selectedComponentId)}
            />
          </mesh>
          <mesh geometry={geometries.springGeo} position={[0, 0.04, 0]}>
            <meshStandardMaterial color="#E2E8F0" metalness={0.9} roughness={0.22} />
          </mesh>
        </group>
      </group>

      {/* 7. CURVED INTAKE & EXHAUST MANIFOLD PASSAGES */}
      <group
        ref={manifoldExplodeRef}
        userData={{ componentId: 'intake-exhaust' }}
        onClick={handleClick('intake-exhaust')}
      >
        <mesh geometry={geometries.intakeTubeGeo}>
          <meshStandardMaterial
            color="#0284C7"
            metalness={0.68}
            roughness={0.32}
            transparent={isolateSelected && selectedComponentId !== 'intake-exhaust'}
            opacity={getOpacity('intake-exhaust', selectedComponentId, isolateSelected)}
            {...getEmissive('intake-exhaust', selectedComponentId)}
          />
        </mesh>
        <mesh geometry={geometries.exhaustTubeGeo}>
          <meshStandardMaterial
            color="#B45309"
            metalness={0.84}
            roughness={0.28}
            transparent={isolateSelected && selectedComponentId !== 'intake-exhaust'}
            opacity={getOpacity('intake-exhaust', selectedComponentId, isolateSelected)}
            {...getEmissive('intake-exhaust', selectedComponentId)}
          />
        </mesh>
      </group>

      {/* 8. CONDITIONAL WATER-STEAM INJECTOR (ONLY rendered when crower-water-steam variant is selected!) */}
      {variantMeta.hasWaterInjection && (
        <group
          userData={{ componentId: 'water-injector' }}
          position={[0.42, 1.46, 0.32]}
          rotation={[0.45, 0, -0.65]}
          onClick={handleClick('water-injector')}
        >
          <mesh>
            <cylinderGeometry args={[0.042, 0.055, 0.28, 16]} />
            <meshStandardMaterial
              color="#0EA5E9"
              metalness={0.85}
              roughness={0.2}
              {...getEmissive('water-injector', selectedComponentId)}
            />
          </mesh>
          <mesh ref={waterMistRef} position={[0, -0.22, 0]}>
            <coneGeometry args={[0.16, 0.3, 18, 1, true]} />
            <meshStandardMaterial
              color="#7DD3FC"
              emissive="#38BDF8"
              emissiveIntensity={1.1}
              transparent
              opacity={0.55}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}

      {/* Optional Minimal Educational Labels */}
      {showLabels && (
        <>
          <Html position={[-0.95, 1.55, 0.15]} center distanceFactor={8}>
            <span className="px-1.5 py-0.5 rounded bg-slate-950/95 border border-cyan-500/40 text-[10px] font-mono text-cyan-200 whitespace-nowrap">
              Intake Port
            </span>
          </Html>
          <Html position={[0.98, 1.48, -0.12]} center distanceFactor={8}>
            <span className="px-1.5 py-0.5 rounded bg-slate-950/95 border border-amber-500/40 text-[10px] font-mono text-amber-200 whitespace-nowrap">
              Exhaust Header
            </span>
          </Html>
          <Html position={[0, kNow.wristPinY + 0.12, 0.68]} center distanceFactor={8}>
            <span className="px-1.5 py-0.5 rounded bg-slate-950/95 border border-slate-700 text-[10px] font-mono text-slate-200 whitespace-nowrap">
              Piston & Rings
            </span>
          </Html>
          <Html position={[0, geom.crankCenterY - 0.15, 0.55]} center distanceFactor={8}>
            <span className="px-1.5 py-0.5 rounded bg-slate-950/95 border border-slate-700 text-[10px] font-mono text-slate-200 whitespace-nowrap">
              Crankshaft · {Math.round(kNow.cycleAngleDeg)}°
            </span>
          </Html>
        </>
      )}
    </group>
  );
}
