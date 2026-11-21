import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizationLayerMode } from '../../config/appConfig';
import type { EngineComponentId } from '../../types/tutor';
import {
  ENGINE_COMPONENT_PRESETS,
  ENGINE_THERMAL_STYLES,
  computeExplodedOffset,
  computeSpoolSpeeds,
} from '../../three/engineConfig';
import {
  createBrushedMetalTexture,
  createSpinnerSpiralTexture,
} from '../../three/proceduralTextures';

interface TurbofanEngine3DProps {
  rootRef?: RefObject<THREE.Group | null>;
  selectedStageId: EngineComponentId;
  layerMode: VisualizationLayerMode;
  throttlePercent: number;
  isPlaying: boolean;
  isExploded: boolean;
  isSoftwareGl: boolean;
  onSelectStage: (stageId: EngineComponentId) => void;
}

interface BladeRingSpec {
  readonly x: number;
  readonly innerR: number;
  readonly outerR: number;
  readonly count: number;
  readonly chord: number;
  readonly twist: number;
  readonly pitchOffset?: number;
}

interface ParticleSeed {
  readonly isBypass: boolean;
  readonly phase: number;
  readonly angle: number;
  readonly radialMix: number;
}

const SCRATCH_OBJ = new THREE.Object3D();
const SCRATCH_COLOR = new THREE.Color();
const COLOR_COOL = new THREE.Color('#22d3ee');
const COLOR_WARM = new THREE.Color('#f59e0b');
const COLOR_HOT = new THREE.Color('#fb7185');
const COLOR_THERMAL_TARGET = new THREE.Color();
const COLOR_EMISSIVE_TARGET = new THREE.Color();

// Cutaway opening leaves the upper-front quadrant (facing +Y, +Z camera) open:
// Solid cutaway shell runs from phiStart = 0.18*PI around bottom & back to 1.48*PI.
const CUTAWAY_PHI_START = Math.PI * 0.18;
const CUTAWAY_PHI_LEN = Math.PI * 1.3;
const CAP_PHI_START = CUTAWAY_PHI_START + CUTAWAY_PHI_LEN;
const CAP_PHI_LEN = Math.PI * 2 - CUTAWAY_PHI_LEN;

/**
 * Creates a thick-walled closed-profile LatheGeometry aligned along the +X engine axis.
 */
function createAxialShellGeometry(
  outerPoints: readonly [number, number][],
  innerPoints: readonly [number, number][],
  radialSegments: number,
  phiStart = 0,
  phiLength = Math.PI * 2,
): THREE.BufferGeometry {
  const profile: THREE.Vector2[] = [];
  for (const [x, r] of outerPoints) {
    profile.push(new THREE.Vector2(r, x));
  }
  for (let i = innerPoints.length - 1; i >= 0; i -= 1) {
    const [x, r] = innerPoints[i];
    profile.push(new THREE.Vector2(r, x));
  }
  if (outerPoints.length > 0) {
    profile.push(new THREE.Vector2(outerPoints[0][1], outerPoints[0][0]));
  }
  const geom = new THREE.LatheGeometry(profile, radialSegments, phiStart, phiLength);
  geom.rotateZ(-Math.PI / 2);
  geom.computeVertexNormals();
  return geom;
}

/**
 * Creates a solid nose cone / tailcone plug aligned along the +X axis.
 */
function createAxialConeGeometry(
  points: readonly [number, number][],
  radialSegments: number,
): THREE.BufferGeometry {
  const profile = points.map(([x, r]) => new THREE.Vector2(r, x));
  const geom = new THREE.LatheGeometry(profile, radialSegments);
  geom.rotateZ(-Math.PI / 2);
  geom.computeVertexNormals();
  return geom;
}

/**
 * Creates a sculpted, twisted airfoil blade geometry extending along +Y from 0..1
 * so InstancedMesh scales easily per stage.
 */
function createUnitTwistedBladeGeometry(): THREE.BufferGeometry {
  const geom = new THREE.BoxGeometry(1, 1, 0.18, 2, 5, 1);
  geom.translate(0, 0.5, 0);
  const pos = geom.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);

    // Taper slightly toward tip and add camber + pitch twist
    const taper = 1 - y * 0.22;
    const sweepX = y * y * 0.12;
    const twistAngle = (y - 0.35) * 0.65;
    const cosA = Math.cos(twistAngle);
    const sinA = Math.sin(twistAngle);

    const sx = x * taper;
    const camberZ = z + (1 - Math.abs(sx) * 1.4) * 0.035;

    const rx = sx * cosA - camberZ * sinA + sweepX;
    const rz = sx * sinA + camberZ * cosA;
    pos.setXYZ(i, rx, y, rz);
  }
  geom.computeVertexNormals();
  return geom;
}

/**
 * Populates an InstancedMesh with multiple concentric blade rings around the X axis.
 */
function populateBladeRings(
  mesh: THREE.InstancedMesh,
  rings: readonly BladeRingSpec[],
): void {
  let idx = 0;
  for (const ring of rings) {
    const span = ring.outerR - ring.innerR;
    for (let i = 0; i < ring.count; i += 1) {
      const angle = (i / ring.count) * Math.PI * 2 + (ring.pitchOffset ?? 0);
      SCRATCH_OBJ.position.set(ring.x, 0, 0);
      SCRATCH_OBJ.rotation.set(angle, ring.twist, 0);
      SCRATCH_OBJ.scale.set(ring.chord, span, ring.chord * 0.85);
      SCRATCH_OBJ.updateMatrix();
      mesh.setMatrixAt(idx, SCRATCH_OBJ.matrix);
      idx += 1;
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
}

const LP_ROTOR_RINGS: readonly BladeRingSpec[] = [
  { x: -1.52, innerR: 0.43, outerR: 0.78, count: 24, chord: 0.11, twist: 0.48 },
  { x: -1.25, innerR: 0.45, outerR: 0.74, count: 26, chord: 0.1, twist: 0.5 },
  { x: -0.98, innerR: 0.46, outerR: 0.69, count: 28, chord: 0.09, twist: 0.52 },
];

const LP_STATOR_RINGS: readonly BladeRingSpec[] = [
  { x: -1.39, innerR: 0.45, outerR: 0.75, count: 24, chord: 0.085, twist: -0.35, pitchOffset: 0.08 },
  { x: -1.12, innerR: 0.46, outerR: 0.71, count: 24, chord: 0.08, twist: -0.35, pitchOffset: 0.08 },
];

const HP_ROTOR_RINGS: readonly BladeRingSpec[] = [
  { x: -0.64, innerR: 0.46, outerR: 0.65, count: 28, chord: 0.085, twist: 0.54 },
  { x: -0.42, innerR: 0.47, outerR: 0.62, count: 30, chord: 0.078, twist: 0.56 },
  { x: -0.2, innerR: 0.47, outerR: 0.59, count: 30, chord: 0.072, twist: 0.58 },
  { x: 0.02, innerR: 0.48, outerR: 0.57, count: 32, chord: 0.068, twist: 0.6 },
  { x: 0.24, innerR: 0.48, outerR: 0.55, count: 32, chord: 0.064, twist: 0.62 },
];

const HP_STATOR_RINGS: readonly BladeRingSpec[] = [
  { x: -0.53, innerR: 0.47, outerR: 0.63, count: 26, chord: 0.07, twist: -0.4, pitchOffset: 0.05 },
  { x: -0.31, innerR: 0.47, outerR: 0.6, count: 26, chord: 0.068, twist: -0.4, pitchOffset: 0.05 },
  { x: -0.09, innerR: 0.48, outerR: 0.58, count: 28, chord: 0.064, twist: -0.4, pitchOffset: 0.05 },
  { x: 0.13, innerR: 0.48, outerR: 0.56, count: 28, chord: 0.06, twist: -0.4, pitchOffset: 0.05 },
];

const HP_TURBINE_RINGS: readonly BladeRingSpec[] = [
  { x: 1.54, innerR: 0.42, outerR: 0.61, count: 30, chord: 0.09, twist: -0.52 },
];

const LP_TURBINE_RINGS: readonly BladeRingSpec[] = [
  { x: 1.82, innerR: 0.42, outerR: 0.66, count: 30, chord: 0.095, twist: -0.46 },
  { x: 2.06, innerR: 0.42, outerR: 0.72, count: 32, chord: 0.1, twist: -0.42 },
  { x: 2.3, innerR: 0.42, outerR: 0.77, count: 32, chord: 0.105, twist: -0.38 },
];

const TURBINE_STATOR_RINGS: readonly BladeRingSpec[] = [
  { x: 1.42, innerR: 0.43, outerR: 0.6, count: 26, chord: 0.075, twist: 0.42 },
  { x: 1.68, innerR: 0.43, outerR: 0.64, count: 26, chord: 0.08, twist: 0.4 },
  { x: 1.94, innerR: 0.43, outerR: 0.69, count: 28, chord: 0.082, twist: 0.38 },
  { x: 2.18, innerR: 0.43, outerR: 0.74, count: 28, chord: 0.084, twist: 0.36 },
];

const FAN_RING: readonly BladeRingSpec[] = [
  { x: -2.22, innerR: 0.41, outerR: 1.32, count: 22, chord: 0.34, twist: 0.42 },
];

const BYPASS_OGV_RING: readonly BladeRingSpec[] = [
  { x: -1.72, innerR: 0.82, outerR: 1.33, count: 24, chord: 0.14, twist: -0.22 },
];

export function TurbofanEngine3D({
  rootRef,
  selectedStageId,
  layerMode,
  throttlePercent,
  isPlaying,
  isExploded,
  isSoftwareGl,
  onSelectStage,
}: TurbofanEngine3DProps) {
  const [hoveredStage, setHoveredStage] = useState<EngineComponentId | null>(null);

  useEffect(() => {
    document.body.style.cursor = hoveredStage ? 'pointer' : 'auto';
    return () => {
      document.body.style.cursor = 'auto';
    };
  }, [hoveredStage]);

  const radialSegs = isSoftwareGl ? 28 : 40;
  const isThermal = layerMode === 'thermal';
  const isAirflow = layerMode === 'airflow';
  const isCutawayOpen = layerMode === 'cutaway' || isThermal;

  // Group refs for smooth damped Exploded View transitions
  const stageGroupRefs = useRef<Record<EngineComponentId, THREE.Group | null>>({
    intake: null,
    fan: null,
    'lp-compressor': null,
    'hp-compressor': null,
    combustor: null,
    turbine: null,
    nozzle: null,
    'bypass-duct': null,
  });

  // Rotating spool refs
  const fanRotorGroupRef = useRef<THREE.Group | null>(null);
  const lpCompRotorGroupRef = useRef<THREE.Group | null>(null);
  const hpCompRotorGroupRef = useRef<THREE.Group | null>(null);
  const hpTurbineRotorGroupRef = useRef<THREE.Group | null>(null);
  const lpTurbineRotorGroupRef = useRef<THREE.Group | null>(null);
  const lpShaftRef = useRef<THREE.Mesh | null>(null);
  const hpShaftRef = useRef<THREE.Mesh | null>(null);

  // InstancedMesh refs
  const fanBladesRef = useRef<THREE.InstancedMesh | null>(null);
  const ogvBladesRef = useRef<THREE.InstancedMesh | null>(null);
  const lpRotorRef = useRef<THREE.InstancedMesh | null>(null);
  const lpStatorRef = useRef<THREE.InstancedMesh | null>(null);
  const hpRotorRef = useRef<THREE.InstancedMesh | null>(null);
  const hpStatorRef = useRef<THREE.InstancedMesh | null>(null);
  const hpTurbineRef = useRef<THREE.InstancedMesh | null>(null);
  const lpTurbineRef = useRef<THREE.InstancedMesh | null>(null);
  const turbineStatorRef = useRef<THREE.InstancedMesh | null>(null);
  const fuelNozzlesRef = useRef<THREE.InstancedMesh | null>(null);
  const nozzlePetalsRef = useRef<THREE.InstancedMesh | null>(null);
  const airflowParticlesRef = useRef<THREE.InstancedMesh | null>(null);

  // Dynamic flame & plume refs
  const combustorFlameRef = useRef<THREE.Mesh | null>(null);
  const combustorLightRef = useRef<THREE.PointLight | null>(null);
  const exhaustPlumeRef = useRef<THREE.Mesh | null>(null);
  const shockDiamondsRef = useRef<THREE.Group | null>(null);

  // Mutable animation state (no React state mutations in useFrame)
  const animStateRef = useRef({
    lpAngle: 0,
    hpAngle: 0,
    explodeFactor: isExploded ? 1 : 0,
    timeAcc: 0,
  });

  // Textures
  const textures = useMemo(() => {
    return {
      brushedMetal: createBrushedMetalTexture(),
      spinnerSpiral: createSpinnerSpiralTexture(),
    };
  }, []);

  useEffect(() => {
    return () => {
      textures.brushedMetal.dispose();
      textures.spinnerSpiral.dispose();
    };
  }, [textures]);

  // Procedural geometries
  const geometries = useMemo(() => {
    const blade = createUnitTwistedBladeGeometry();

    // Intake outer lip & acoustic barrel (cutaway & cap)
    const intakeOuter: [number, number][] = [
      [-3.68, 1.48],
      [-3.58, 1.56],
      [-3.32, 1.62],
      [-2.62, 1.66],
    ];
    const intakeInner: [number, number][] = [
      [-3.68, 1.43],
      [-3.56, 1.36],
      [-3.18, 1.35],
      [-2.62, 1.37],
    ];
    const intakeCutaway = createAxialShellGeometry(
      intakeOuter,
      intakeInner,
      radialSegs,
      CUTAWAY_PHI_START,
      CUTAWAY_PHI_LEN,
    );
    const intakeCap = createAxialShellGeometry(
      intakeOuter,
      intakeInner,
      radialSegs,
      CAP_PHI_START,
      CAP_PHI_LEN,
    );
    const intakeLipRing = new THREE.TorusGeometry(1.45, 0.085, 16, radialSegs);
    intakeLipRing.rotateY(Math.PI / 2);

    // Spinner nose cone
    const spinnerCone = createAxialConeGeometry(
      [
        [-2.94, 0.01],
        [-2.82, 0.14],
        [-2.66, 0.28],
        [-2.48, 0.39],
        [-2.35, 0.43],
      ],
      radialSegs,
    );

    // Bypass duct outer nacelle barrel (cutaway & cap)
    const bypassOuter: [number, number][] = [
      [-2.6, 1.66],
      [-1.4, 1.68],
      [0.2, 1.58],
      [1.45, 1.44],
      [2.22, 1.24],
    ];
    const bypassInner: [number, number][] = [
      [-2.6, 1.37],
      [-1.4, 1.39],
      [0.2, 1.32],
      [1.45, 1.22],
      [2.22, 1.07],
    ];
    const bypassCutaway = createAxialShellGeometry(
      bypassOuter,
      bypassInner,
      radialSegs,
      CUTAWAY_PHI_START,
      CUTAWAY_PHI_LEN,
    );
    const bypassCap = createAxialShellGeometry(
      bypassOuter,
      bypassInner,
      radialSegs,
      CAP_PHI_START,
      CAP_PHI_LEN,
    );

    // LP Compressor casing & hub drum
    const lpcCaseOuter: [number, number][] = [
      [-1.68, 0.85],
      [-0.84, 0.74],
    ];
    const lpcCaseInner: [number, number][] = [
      [-1.68, 0.79],
      [-0.84, 0.69],
    ];
    const lpcCutaway = createAxialShellGeometry(
      lpcCaseOuter,
      lpcCaseInner,
      radialSegs,
      CUTAWAY_PHI_START,
      CUTAWAY_PHI_LEN,
    );
    const lpcCap = createAxialShellGeometry(
      lpcCaseOuter,
      lpcCaseInner,
      radialSegs,
      CAP_PHI_START,
      CAP_PHI_LEN,
    );
    const lpcHub = createAxialConeGeometry(
      [
        [-1.66, 0.41],
        [-0.86, 0.46],
      ],
      radialSegs,
    );

    // HP Compressor casing & hub drum
    const hpcCaseOuter: [number, number][] = [
      [-0.8, 0.72],
      [0.36, 0.61],
    ];
    const hpcCaseInner: [number, number][] = [
      [-0.8, 0.66],
      [0.36, 0.56],
    ];
    const hpcCutaway = createAxialShellGeometry(
      hpcCaseOuter,
      hpcCaseInner,
      radialSegs,
      CUTAWAY_PHI_START,
      CUTAWAY_PHI_LEN,
    );
    const hpcCap = createAxialShellGeometry(
      hpcCaseOuter,
      hpcCaseInner,
      radialSegs,
      CAP_PHI_START,
      CAP_PHI_LEN,
    );
    const hpcHub = createAxialConeGeometry(
      [
        [-0.78, 0.46],
        [0.34, 0.48],
      ],
      radialSegs,
    );

    // Combustor outer casing + inner annular flame liner
    const combCaseOuter: [number, number][] = [
      [0.4, 0.64],
      [0.88, 0.74],
      [1.36, 0.68],
    ];
    const combCaseInner: [number, number][] = [
      [0.4, 0.58],
      [0.88, 0.68],
      [1.36, 0.62],
    ];
    const combCutaway = createAxialShellGeometry(
      combCaseOuter,
      combCaseInner,
      radialSegs,
      CUTAWAY_PHI_START,
      CUTAWAY_PHI_LEN,
    );
    const combCap = createAxialShellGeometry(
      combCaseOuter,
      combCaseInner,
      radialSegs,
      CAP_PHI_START,
      CAP_PHI_LEN,
    );
    const combLiner = createAxialShellGeometry(
      [
        [0.48, 0.52],
        [0.88, 0.59],
        [1.3, 0.54],
      ],
      [
        [0.48, 0.49],
        [0.88, 0.56],
        [1.3, 0.51],
      ],
      radialSegs,
      CUTAWAY_PHI_START,
      CUTAWAY_PHI_LEN + 0.35,
    );
    const combFlameRing = new THREE.TorusGeometry(0.46, 0.085, 14, 32);
    combFlameRing.rotateY(Math.PI / 2);

    // Turbine outer shroud
    const turbCaseOuter: [number, number][] = [
      [1.38, 0.66],
      [2.44, 0.85],
    ];
    const turbCaseInner: [number, number][] = [
      [1.38, 0.61],
      [2.44, 0.79],
    ];
    const turbCutaway = createAxialShellGeometry(
      turbCaseOuter,
      turbCaseInner,
      radialSegs,
      CUTAWAY_PHI_START,
      CUTAWAY_PHI_LEN,
    );
    const turbCap = createAxialShellGeometry(
      turbCaseOuter,
      turbCaseInner,
      radialSegs,
      CAP_PHI_START,
      CAP_PHI_LEN,
    );

    // Exhaust nozzle tailcone plug + outer cowling + plume
    const nozzlePlug = createAxialConeGeometry(
      [
        [2.46, 0.42],
        [3.15, 0.33],
        [3.75, 0.16],
        [4.12, 0.015],
      ],
      radialSegs,
    );
    const nozzleCowl = createAxialShellGeometry(
      [
        [2.46, 0.84],
        [3.0, 0.75],
        [3.42, 0.63],
      ],
      [
        [2.46, 0.78],
        [3.0, 0.69],
        [3.42, 0.58],
      ],
      radialSegs,
    );
    const exhaustPlume = createAxialConeGeometry(
      [
        [0.0, 0.52],
        [0.85, 0.41],
        [1.95, 0.16],
        [2.35, 0.01],
      ],
      24,
    );

    // Simple particle capsule & petal & nozzle tip
    const particleGeom = new THREE.CapsuleGeometry(0.022, 0.14, 4, 6);
    particleGeom.rotateZ(Math.PI / 2);

    const fuelNozzleGeom = new THREE.CylinderGeometry(0.022, 0.032, 0.13, 8);
    fuelNozzleGeom.rotateZ(Math.PI / 2);

    const petalGeom = new THREE.BoxGeometry(0.42, 0.04, 0.18);

    const shockRingGeom = new THREE.TorusGeometry(0.24, 0.025, 8, 20);
    shockRingGeom.rotateY(Math.PI / 2);

    const selectRingGeom = new THREE.TorusGeometry(1.08, 0.011, 10, 48);
    selectRingGeom.rotateY(Math.PI / 2);

    return {
      blade,
      intakeCutaway,
      intakeCap,
      intakeLipRing,
      spinnerCone,
      bypassCutaway,
      bypassCap,
      lpcCutaway,
      lpcCap,
      lpcHub,
      hpcCutaway,
      hpcCap,
      hpcHub,
      combCutaway,
      combCap,
      combLiner,
      combFlameRing,
      turbCutaway,
      turbCap,
      nozzlePlug,
      nozzleCowl,
      exhaustPlume,
      particleGeom,
      fuelNozzleGeom,
      petalGeom,
      shockRingGeom,
      selectRingGeom,
    };
  }, [radialSegs]);

  useEffect(() => {
    return () => {
      Object.values(geometries).forEach((g) => g.dispose());
    };
  }, [geometries]);

  // Populate static / rotor InstancedMeshes once geometries are mounted
  useEffect(() => {
    if (fanBladesRef.current) {
      populateBladeRings(fanBladesRef.current, FAN_RING);
    }
    if (ogvBladesRef.current) {
      populateBladeRings(ogvBladesRef.current, BYPASS_OGV_RING);
    }
    if (lpRotorRef.current) {
      populateBladeRings(lpRotorRef.current, LP_ROTOR_RINGS);
    }
    if (lpStatorRef.current) {
      populateBladeRings(lpStatorRef.current, LP_STATOR_RINGS);
    }
    if (hpRotorRef.current) {
      populateBladeRings(hpRotorRef.current, HP_ROTOR_RINGS);
    }
    if (hpStatorRef.current) {
      populateBladeRings(hpStatorRef.current, HP_STATOR_RINGS);
    }
    if (hpTurbineRef.current) {
      populateBladeRings(hpTurbineRef.current, HP_TURBINE_RINGS);
    }
    if (lpTurbineRef.current) {
      populateBladeRings(lpTurbineRef.current, LP_TURBINE_RINGS);
    }
    if (turbineStatorRef.current) {
      populateBladeRings(turbineStatorRef.current, TURBINE_STATOR_RINGS);
    }

    if (fuelNozzlesRef.current) {
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * Math.PI * 2;
        SCRATCH_OBJ.position.set(0.49, Math.cos(a) * 0.48, Math.sin(a) * 0.48);
        SCRATCH_OBJ.rotation.set(a, 0, -0.25);
        SCRATCH_OBJ.scale.set(1, 1, 1);
        SCRATCH_OBJ.updateMatrix();
        fuelNozzlesRef.current.setMatrixAt(i, SCRATCH_OBJ.matrix);
      }
      fuelNozzlesRef.current.instanceMatrix.needsUpdate = true;
    }

    if (nozzlePetalsRef.current) {
      for (let i = 0; i < 16; i += 1) {
        const a = (i / 16) * Math.PI * 2;
        SCRATCH_OBJ.position.set(3.45, Math.cos(a) * 0.58, Math.sin(a) * 0.58);
        SCRATCH_OBJ.rotation.set(a, 0, -0.18);
        SCRATCH_OBJ.scale.set(1, 1, 1);
        SCRATCH_OBJ.updateMatrix();
        nozzlePetalsRef.current.setMatrixAt(i, SCRATCH_OBJ.matrix);
      }
      nozzlePetalsRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [geometries]);

  // Pre-seeded airflow streamline particles
  const particleSeeds = useMemo<readonly ParticleSeed[]>(() => {
    const seeds: ParticleSeed[] = [];
    for (let i = 0; i < 112; i += 1) {
      const isBypass = i < 56;
      const laneIdx = isBypass ? i : i - 56;
      seeds.push({
        isBypass,
        phase: (laneIdx / 56 + (laneIdx % 7) * 0.017) % 1,
        angle: ((laneIdx * 137.5) % 360) * (Math.PI / 180),
        radialMix: (laneIdx % 5) / 4,
      });
    }
    return seeds;
  }, []);

  // Helper to compute material props for each of the 8 components
  const getStageSurfaceProps = (
    stageId: EngineComponentId,
    defaultRoughness: number,
    defaultMetalness: number,
    isCasingCap = false,
  ) => {
    const style = ENGINE_THERMAL_STYLES[stageId];
    const isSelected = selectedStageId === stageId;
    const isHovered = hoveredStage === stageId;
    const { heatFactor } = computeSpoolSpeeds(throttlePercent);

    if (isAirflow && isCasingCap) {
      return {
        color: '#38bdf8',
        emissive: isSelected ? '#22d3ee' : '#0ea5e9',
        emissiveIntensity: isSelected ? 0.3 : 0.05,
        roughness: 0.35,
        metalness: 0.4,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
      };
    }

    if (isThermal) {
      SCRATCH_COLOR.set(style.baseHex);
      COLOR_THERMAL_TARGET.set(style.hotHex);
      SCRATCH_COLOR.lerp(COLOR_THERMAL_TARGET, 0.35 + heatFactor * 0.65);

      COLOR_EMISSIVE_TARGET.set(style.emissiveHex);
      const thermalEmissive =
        style.hotEmissiveIntensity * (0.45 + heatFactor * 0.75) +
        (isSelected ? 0.35 : isHovered ? 0.15 : 0);

      return {
        color: `#${SCRATCH_COLOR.getHexString()}`,
        emissive: `#${COLOR_EMISSIVE_TARGET.getHexString()}`,
        emissiveIntensity: thermalEmissive,
        roughness: defaultRoughness,
        metalness: defaultMetalness,
        transparent: false,
        opacity: 1,
        depthWrite: true,
      };
    }

    return {
      color: style.baseHex,
      emissive: isSelected
        ? stageId === 'combustor'
          ? '#f59e0b'
          : '#22d3ee'
        : isHovered
          ? '#38bdf8'
          : '#000000',
      emissiveIntensity: isSelected ? 0.42 : isHovered ? 0.18 : 0,
      roughness: defaultRoughness,
      metalness: defaultMetalness,
      transparent: isAirflow && stageId === 'bypass-duct',
      opacity: isAirflow && stageId === 'bypass-duct' ? 0.24 : 1,
      depthWrite: !(isAirflow && stageId === 'bypass-duct'),
    };
  };

  const makeHandlers = (stageId: EngineComponentId) => ({
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      onSelectStage(stageId);
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setHoveredStage(stageId);
    },
    onPointerOut: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setHoveredStage((prev) => (prev === stageId ? null : prev));
    },
  });

  // Main real-time animation & damped exploded-view loop
  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.08);
    const anim = animStateRef.current;
    const speeds = computeSpoolSpeeds(throttlePercent);

    // 1. Smoothly damp exploded view factor
    const targetExplode = isExploded ? 1 : 0;
    anim.explodeFactor = THREE.MathUtils.damp(anim.explodeFactor, targetExplode, 6.5, delta);

    (Object.keys(ENGINE_COMPONENT_PRESETS) as EngineComponentId[]).forEach((id) => {
      const grp = stageGroupRefs.current[id];
      if (!grp) return;
      const [ox, oy, oz] = computeExplodedOffset(id, anim.explodeFactor);
      grp.position.set(ox, oy, oz);
    });

    // 2. Spool rotation & flame pulse
    if (isPlaying) {
      anim.lpAngle = (anim.lpAngle + speeds.lpAngularVelocity * delta) % (Math.PI * 2);
      anim.hpAngle = (anim.hpAngle + speeds.hpAngularVelocity * delta) % (Math.PI * 2);
      anim.timeAcc += delta;
    }

    if (fanRotorGroupRef.current) fanRotorGroupRef.current.rotation.x = anim.lpAngle;
    if (lpCompRotorGroupRef.current) lpCompRotorGroupRef.current.rotation.x = anim.lpAngle;
    if (lpTurbineRotorGroupRef.current) lpTurbineRotorGroupRef.current.rotation.x = anim.lpAngle;
    if (lpShaftRef.current) lpShaftRef.current.rotation.x = anim.lpAngle;

    if (hpCompRotorGroupRef.current) hpCompRotorGroupRef.current.rotation.x = anim.hpAngle;
    if (hpTurbineRotorGroupRef.current) hpTurbineRotorGroupRef.current.rotation.x = anim.hpAngle;
    if (hpShaftRef.current) hpShaftRef.current.rotation.x = anim.hpAngle;

    // 3. Combustor flame glow & exhaust plume scaling
    const pulse = isPlaying ? 0.92 + Math.sin(anim.timeAcc * 14) * 0.08 : 1;
    if (combustorFlameRef.current) {
      const mat = combustorFlameRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = (1.1 + speeds.heatFactor * 2.2) * pulse;
    }
    if (combustorLightRef.current) {
      combustorLightRef.current.intensity = (1.2 + speeds.heatFactor * 3.0) * pulse;
    }
    if (exhaustPlumeRef.current) {
      const plumeScaleX = 0.45 + speeds.heatFactor * 0.85 * pulse;
      const plumeScaleYZ = 0.72 + speeds.heatFactor * 0.35;
      exhaustPlumeRef.current.scale.set(plumeScaleX, plumeScaleYZ, plumeScaleYZ);
      const mat = exhaustPlumeRef.current.material as THREE.MeshStandardMaterial;
      mat.opacity = isPlaying ? 0.18 + speeds.heatFactor * 0.38 : 0.14;
    }
    if (shockDiamondsRef.current) {
      shockDiamondsRef.current.visible = speeds.heatFactor > 0.55;
      shockDiamondsRef.current.scale.setScalar(0.85 + speeds.heatFactor * 0.25);
    }

    // 4. Airflow & exhaust particles (zero allocations)
    const particleMesh = airflowParticlesRef.current;
    if (particleMesh) {
      const showParticles = isAirflow || isPlaying;
      particleMesh.visible = showParticles;
      if (showParticles) {
        const flowOffset = (anim.timeAcc * speeds.airflowSpeed * 0.14) % 1;
        const pLen = isAirflow ? 1.35 : 0.9;
        const pThick = isAirflow ? 1.15 : 0.75;

        for (let i = 0; i < particleSeeds.length; i += 1) {
          const seed = particleSeeds[i];
          const progress = (seed.phase + flowOffset) % 1;
          const x = -4.25 + progress * 9.8;

          // Offset swirl slightly downstream of fan / rotors
          const swirl = seed.angle + progress * (seed.isBypass ? 0.35 : 0.95);

          let radius: number;
          if (seed.isBypass) {
            if (x < -2.4) {
              radius = 0.85 + seed.radialMix * 0.38;
            } else if (x < 2.2) {
              radius = 0.94 + seed.radialMix * 0.28 - Math.max(0, x) * 0.04;
            } else {
              radius = 0.88 - (x - 2.2) * 0.08 + seed.radialMix * 0.18;
            }
          } else {
            if (x < -1.8) {
              radius = 0.48 + seed.radialMix * 0.18;
            } else if (x < 0.35) {
              radius = 0.52 + seed.radialMix * 0.08;
            } else if (x < 1.35) {
              radius = 0.47 + seed.radialMix * 0.09;
            } else if (x < 2.45) {
              radius = 0.5 + seed.radialMix * 0.12;
            } else {
              radius = Math.max(0.12, 0.46 - (x - 2.45) * 0.11);
            }
          }

          SCRATCH_OBJ.position.set(x, Math.cos(swirl) * radius, Math.sin(swirl) * radius);
          SCRATCH_OBJ.rotation.set(0, 0, 0);
          SCRATCH_OBJ.scale.set(pLen * (0.7 + speeds.heatFactor * 0.6), pThick, pThick);
          SCRATCH_OBJ.updateMatrix();
          particleMesh.setMatrixAt(i, SCRATCH_OBJ.matrix);

          if (seed.isBypass) {
            SCRATCH_COLOR.copy(COLOR_COOL);
          } else if (x < 0.4) {
            SCRATCH_COLOR.copy(COLOR_COOL).lerp(
              COLOR_WARM,
              Math.max(0, (x + 1.5) / 2.2) * 0.45,
            );
          } else if (x < 1.4) {
            SCRATCH_COLOR.copy(COLOR_WARM).lerp(
              COLOR_HOT,
              Math.max(0, (x - 0.4)) * 0.85,
            );
          } else {
            SCRATCH_COLOR.copy(COLOR_HOT).lerp(
              COLOR_WARM,
              Math.min(1, (x - 1.4) / 3.5) * 0.65,
            );
          }
          particleMesh.setColorAt(i, SCRATCH_COLOR);
        }

        particleMesh.instanceMatrix.needsUpdate = true;
        if (particleMesh.instanceColor) {
          particleMesh.instanceColor.needsUpdate = true;
        }
      }
    }
  });

  const intakeMat = getStageSurfaceProps('intake', 0.46, 0.72);
  const intakeCapMat = getStageSurfaceProps('intake', 0.46, 0.72, true);
  const fanMat = getStageSurfaceProps('fan', 0.22, 0.9);
  const bypassMat = getStageSurfaceProps('bypass-duct', 0.52, 0.55);
  const bypassCapMat = getStageSurfaceProps('bypass-duct', 0.52, 0.55, true);
  const lpcMat = getStageSurfaceProps('lp-compressor', 0.25, 0.88);
  const lpcCapMat = getStageSurfaceProps('lp-compressor', 0.42, 0.75, true);
  const hpcMat = getStageSurfaceProps('hp-compressor', 0.24, 0.9);
  const hpcCapMat = getStageSurfaceProps('hp-compressor', 0.42, 0.78, true);
  const combMat = getStageSurfaceProps('combustor', 0.38, 0.82);
  const combCapMat = getStageSurfaceProps('combustor', 0.44, 0.76, true);
  const turbMat = getStageSurfaceProps('turbine', 0.32, 0.86);
  const turbCapMat = getStageSurfaceProps('turbine', 0.42, 0.78, true);
  const nozzleMat = getStageSurfaceProps('nozzle', 0.36, 0.82);

  return (
    <group ref={rootRef} name="turbofan-engine-root">
      {/* Concentric LP & HP Drive Shafts (mechanical backbone) */}
      <mesh
        ref={lpShaftRef}
        position={[-0.1, 0, 0]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow={!isSoftwareGl}
      >
        <cylinderGeometry args={[0.11, 0.11, 4.9, 18]} />
        <meshStandardMaterial color="#64748b" metalness={0.92} roughness={0.22} />
      </mesh>
      <mesh
        ref={hpShaftRef}
        position={[0.45, 0, 0]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow={!isSoftwareGl}
      >
        <cylinderGeometry args={[0.18, 0.18, 2.5, 18]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.88} roughness={0.28} />
      </mesh>

      {/* 1. AIR INTAKE (Station 0-1) */}
      <group
        userData={{ componentId: 'intake' }}
        ref={(el) => {
          stageGroupRefs.current.intake = el;
        }}
        {...makeHandlers('intake')}
      >
        <mesh geometry={geometries.intakeCutaway} castShadow={!isSoftwareGl} receiveShadow={!isSoftwareGl}>
          <meshStandardMaterial
            {...intakeMat}
            roughnessMap={textures.brushedMetal}
            side={THREE.DoubleSide}
          />
        </mesh>
        {!isCutawayOpen && (
          <mesh geometry={geometries.intakeCap}>
            <meshStandardMaterial {...intakeCapMat} side={THREE.DoubleSide} />
          </mesh>
        )}
        {/* Anti-ice polished titanium intake lip */}
        <mesh geometry={geometries.intakeLipRing} position={[-3.68, 0, 0]}>
          <meshStandardMaterial
            color="#cbd5e1"
            emissive={selectedStageId === 'intake' ? '#22d3ee' : '#000000'}
            emissiveIntensity={selectedStageId === 'intake' ? 0.4 : 0}
            metalness={0.94}
            roughness={0.14}
          />
        </mesh>
        {selectedStageId === 'intake' && (
          <mesh geometry={geometries.selectRingGeom} position={[-3.2, 0, 0]} scale={[1, 1.69, 1.69]}>
            <meshBasicMaterial color="#22d3ee" transparent opacity={0.75} />
          </mesh>
        )}
      </group>

      {/* 2. BYPASS FAN (Station 2-13) */}
      <group
        userData={{ componentId: 'fan' }}
        ref={(el) => {
          stageGroupRefs.current.fan = el;
        }}
        {...makeHandlers('fan')}
      >
        <group ref={fanRotorGroupRef}>
          <mesh geometry={geometries.spinnerCone} castShadow={!isSoftwareGl}>
            <meshStandardMaterial
              map={textures.spinnerSpiral}
              emissive={selectedStageId === 'fan' ? '#0ea5e9' : '#000000'}
              emissiveIntensity={selectedStageId === 'fan' ? 0.35 : 0}
              roughness={0.34}
              metalness={0.45}
            />
          </mesh>
          <mesh position={[-2.22, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.42, 0.44, 0.34, 24]} />
            <meshStandardMaterial color="#475569" metalness={0.88} roughness={0.28} />
          </mesh>
          <instancedMesh
            ref={fanBladesRef}
            args={[geometries.blade, undefined, 22]}
            castShadow={!isSoftwareGl}
          >
            <meshStandardMaterial {...fanMat} roughnessMap={textures.brushedMetal} />
          </instancedMesh>
        </group>
        {selectedStageId === 'fan' && (
          <mesh geometry={geometries.selectRingGeom} position={[-2.22, 0, 0]} scale={[1, 1.4, 1.4]}>
            <meshBasicMaterial color="#22d3ee" transparent opacity={0.78} />
          </mesh>
        )}
      </group>

      {/* 3. BYPASS DUCT (Station 13-19) */}
      <group
        userData={{ componentId: 'bypass-duct' }}
        ref={(el) => {
          stageGroupRefs.current['bypass-duct'] = el;
        }}
        {...makeHandlers('bypass-duct')}
      >
        <mesh geometry={geometries.bypassCutaway} castShadow={!isSoftwareGl} receiveShadow={!isSoftwareGl}>
          <meshStandardMaterial
            {...bypassMat}
            roughnessMap={textures.brushedMetal}
            side={THREE.DoubleSide}
          />
        </mesh>
        {!isCutawayOpen && (
          <mesh geometry={geometries.bypassCap}>
            <meshStandardMaterial {...bypassCapMat} side={THREE.DoubleSide} />
          </mesh>
        )}
        {/* Outlet Guide Vanes (OGVs) inside bypass stream */}
        <instancedMesh ref={ogvBladesRef} args={[geometries.blade, undefined, 24]}>
          <meshStandardMaterial
            color="#64748b"
            emissive={selectedStageId === 'bypass-duct' ? '#22d3ee' : '#000000'}
            emissiveIntensity={selectedStageId === 'bypass-duct' ? 0.35 : 0}
            metalness={0.82}
            roughness={0.34}
          />
        </instancedMesh>
        {/* Aerodynamic bifurcation struts inside bypass channel */}
        {[-1, 1].map((sign) => (
          <mesh key={sign} position={[-0.45, sign * 1.08, 0]}>
            <boxGeometry args={[1.45, 0.44, 0.06]} />
            <meshStandardMaterial color="#334155" metalness={0.78} roughness={0.38} />
          </mesh>
        ))}
        {selectedStageId === 'bypass-duct' && (
          <mesh geometry={geometries.selectRingGeom} position={[0.1, 0, 0]} scale={[1, 1.65, 1.65]}>
            <meshBasicMaterial color="#22d3ee" transparent opacity={0.75} />
          </mesh>
        )}
      </group>

      {/* 4. LOW-PRESSURE COMPRESSOR (Station 2-2.5) */}
      <group
        userData={{ componentId: 'lp-compressor' }}
        ref={(el) => {
          stageGroupRefs.current['lp-compressor'] = el;
        }}
        {...makeHandlers('lp-compressor')}
      >
        <mesh geometry={geometries.lpcCutaway}>
          <meshStandardMaterial {...lpcCapMat} side={THREE.DoubleSide} />
        </mesh>
        {!isCutawayOpen && (
          <mesh geometry={geometries.lpcCap}>
            <meshStandardMaterial {...lpcCapMat} side={THREE.DoubleSide} />
          </mesh>
        )}
        <instancedMesh ref={lpStatorRef} args={[geometries.blade, undefined, 48]}>
          <meshStandardMaterial color="#475569" metalness={0.84} roughness={0.32} />
        </instancedMesh>
        <group ref={lpCompRotorGroupRef}>
          <mesh geometry={geometries.lpcHub}>
            <meshStandardMaterial color="#334155" metalness={0.86} roughness={0.3} />
          </mesh>
          <instancedMesh ref={lpRotorRef} args={[geometries.blade, undefined, 78]}>
            <meshStandardMaterial {...lpcMat} />
          </instancedMesh>
        </group>
        {selectedStageId === 'lp-compressor' && (
          <mesh geometry={geometries.selectRingGeom} position={[-1.25, 0, 0]} scale={[1, 0.88, 0.88]}>
            <meshBasicMaterial color="#22d3ee" transparent opacity={0.85} />
          </mesh>
        )}
      </group>

      {/* 5. HIGH-PRESSURE COMPRESSOR (Station 2.5-3) */}
      <group
        userData={{ componentId: 'hp-compressor' }}
        ref={(el) => {
          stageGroupRefs.current['hp-compressor'] = el;
        }}
        {...makeHandlers('hp-compressor')}
      >
        <mesh geometry={geometries.hpcCutaway}>
          <meshStandardMaterial {...hpcCapMat} side={THREE.DoubleSide} />
        </mesh>
        {!isCutawayOpen && (
          <mesh geometry={geometries.hpcCap}>
            <meshStandardMaterial {...hpcCapMat} side={THREE.DoubleSide} />
          </mesh>
        )}
        <instancedMesh ref={hpStatorRef} args={[geometries.blade, undefined, 108]}>
          <meshStandardMaterial color="#475569" metalness={0.84} roughness={0.32} />
        </instancedMesh>
        <group ref={hpCompRotorGroupRef}>
          <mesh geometry={geometries.hpcHub}>
            <meshStandardMaterial color="#334155" metalness={0.88} roughness={0.26} />
          </mesh>
          <instancedMesh ref={hpRotorRef} args={[geometries.blade, undefined, 150]}>
            <meshStandardMaterial {...hpcMat} />
          </instancedMesh>
        </group>
        {selectedStageId === 'hp-compressor' && (
          <mesh geometry={geometries.selectRingGeom} position={[-0.22, 0, 0]} scale={[1, 0.78, 0.78]}>
            <meshBasicMaterial color="#22d3ee" transparent opacity={0.85} />
          </mesh>
        )}
      </group>

      {/* 6. COMBUSTION CHAMBER (Station 3-4) */}
      <group
        userData={{ componentId: 'combustor' }}
        ref={(el) => {
          stageGroupRefs.current.combustor = el;
        }}
        {...makeHandlers('combustor')}
      >
        <mesh geometry={geometries.combCutaway}>
          <meshStandardMaterial {...combCapMat} side={THREE.DoubleSide} />
        </mesh>
        {!isCutawayOpen && (
          <mesh geometry={geometries.combCap}>
            <meshStandardMaterial {...combCapMat} side={THREE.DoubleSide} />
          </mesh>
        )}
        {/* Annular perforated flame liner */}
        <mesh geometry={geometries.combLiner}>
          <meshStandardMaterial {...combMat} side={THREE.DoubleSide} />
        </mesh>
        {/* 12 Radial fuel injector nozzles */}
        <instancedMesh ref={fuelNozzlesRef} args={[geometries.fuelNozzleGeom, undefined, 12]}>
          <meshStandardMaterial color="#d97706" metalness={0.85} roughness={0.28} />
        </instancedMesh>
        {/* Glowing annular combustion plasma core */}
        <mesh ref={combustorFlameRef} geometry={geometries.combFlameRing} position={[0.88, 0, 0]}>
          <meshStandardMaterial
            color="#fbbf24"
            emissive="#ff5500"
            emissiveIntensity={2.2}
            roughness={0.4}
            metalness={0.1}
          />
        </mesh>
        <pointLight
          ref={combustorLightRef}
          position={[0.88, 0.15, 0.25]}
          color="#ff7a18"
          intensity={2.4}
          distance={4.2}
          decay={2}
        />
        {selectedStageId === 'combustor' && (
          <mesh geometry={geometries.selectRingGeom} position={[0.88, 0, 0]} scale={[1, 0.84, 0.84]}>
            <meshBasicMaterial color="#f59e0b" transparent opacity={0.9} />
          </mesh>
        )}
      </group>

      {/* 7. TURBINE STAGES (Station 4-5) */}
      <group
        userData={{ componentId: 'turbine' }}
        ref={(el) => {
          stageGroupRefs.current.turbine = el;
        }}
        {...makeHandlers('turbine')}
      >
        <mesh geometry={geometries.turbCutaway}>
          <meshStandardMaterial {...turbCapMat} side={THREE.DoubleSide} />
        </mesh>
        {!isCutawayOpen && (
          <mesh geometry={geometries.turbCap}>
            <meshStandardMaterial {...turbCapMat} side={THREE.DoubleSide} />
          </mesh>
        )}
        <instancedMesh ref={turbineStatorRef} args={[geometries.blade, undefined, 108]}>
          <meshStandardMaterial color="#78716c" metalness={0.82} roughness={0.34} />
        </instancedMesh>
        <group ref={hpTurbineRotorGroupRef}>
          <instancedMesh ref={hpTurbineRef} args={[geometries.blade, undefined, 30]}>
            <meshStandardMaterial {...turbMat} />
          </instancedMesh>
        </group>
        <group ref={lpTurbineRotorGroupRef}>
          <instancedMesh ref={lpTurbineRef} args={[geometries.blade, undefined, 94]}>
            <meshStandardMaterial {...turbMat} />
          </instancedMesh>
        </group>
        {selectedStageId === 'turbine' && (
          <mesh geometry={geometries.selectRingGeom} position={[1.9, 0, 0]} scale={[1, 0.86, 0.86]}>
            <meshBasicMaterial color="#22d3ee" transparent opacity={0.85} />
          </mesh>
        )}
      </group>

      {/* 8. EXHAUST NOZZLE (Station 7-9) */}
      <group
        userData={{ componentId: 'nozzle' }}
        ref={(el) => {
          stageGroupRefs.current.nozzle = el;
        }}
        {...makeHandlers('nozzle')}
      >
        <mesh geometry={geometries.nozzlePlug} castShadow={!isSoftwareGl}>
          <meshStandardMaterial {...nozzleMat} roughnessMap={textures.brushedMetal} />
        </mesh>
        <mesh geometry={geometries.nozzleCowl} castShadow={!isSoftwareGl}>
          <meshStandardMaterial {...nozzleMat} side={THREE.DoubleSide} />
        </mesh>
        <instancedMesh ref={nozzlePetalsRef} args={[geometries.petalGeom, undefined, 16]}>
          <meshStandardMaterial color="#1e293b" metalness={0.78} roughness={0.44} />
        </instancedMesh>

        {/* Animated translucent exhaust plume & Mach shock diamonds */}
        <mesh
          ref={exhaustPlumeRef}
          userData={{ excludeFromBounds: true }}
          geometry={geometries.exhaustPlume}
          position={[3.35, 0, 0]}
        >
          <meshStandardMaterial
            color="#fb923c"
            emissive="#f97316"
            emissiveIntensity={1.6}
            transparent
            opacity={0.32}
            depthWrite={false}
          />
        </mesh>
        <group ref={shockDiamondsRef} userData={{ excludeFromBounds: true }} position={[3.45, 0, 0]}>
          {[0.4, 0.85, 1.3].map((xOffset, idx) => (
            <mesh
              key={xOffset}
              geometry={geometries.shockRingGeom}
              position={[xOffset, 0, 0]}
              scale={[1, 1 - idx * 0.22, 1 - idx * 0.22]}
            >
              <meshBasicMaterial color="#fde047" transparent opacity={0.45 - idx * 0.1} />
            </mesh>
          ))}
        </group>

        {selectedStageId === 'nozzle' && (
          <mesh geometry={geometries.selectRingGeom} position={[3.05, 0, 0]} scale={[1, 0.88, 0.88]}>
            <meshBasicMaterial color="#22d3ee" transparent opacity={0.85} />
          </mesh>
        )}
      </group>

      {/* Airflow & Core-Thermal Streamline Particles */}
      <instancedMesh
        ref={airflowParticlesRef}
        userData={{ excludeFromBounds: true }}
        args={[geometries.particleGeom, undefined, particleSeeds.length]}
        frustumCulled={false}
      >
        <meshBasicMaterial toneMapped={false} transparent opacity={0.88} />
      </instancedMesh>
    </group>
  );
}
