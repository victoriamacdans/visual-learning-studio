import type {
  ExplorationLevel,
  GeneratedScene3DSpec,
  UploadedAssetSummary,
} from '../types/tutor.ts';
import { validateGeneratedScene3DSpec } from '../utils/scene3DValidation.ts';

export interface AssetPartBoundsFraction {
  readonly minX?: number;
  readonly maxX?: number;
  readonly minY?: number;
  readonly maxY?: number;
  readonly minZ?: number;
  readonly maxZ?: number;
}

export interface AssetPartAnimation {
  readonly type: 'spin' | 'oscillate';
  readonly axis: 'x' | 'y' | 'z';
  readonly speed: number;
  readonly amplitude?: number;
}

export interface AssetPartCameraFraming {
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly distanceScale: number;
}

export interface AssetPartDefinition {
  readonly id: string;
  readonly label: string;
  readonly role: string;
  readonly operatingNote: string;
  readonly meshNamePatterns: readonly string[];
  readonly isVerifiedMesh: boolean;
  readonly isSubRegionOfMesh: boolean;
  readonly boundsFraction?: AssetPartBoundsFraction;
  readonly animation?: AssetPartAnimation;
  readonly cameraFraming: AssetPartCameraFraming;
}

export interface IllustrativePathwayNodeSpec {
  readonly id: string;
  readonly label: string;
  readonly kind: 'engine-block' | 'shaft' | 'gearbox' | 'energy-bus';
  /** Normalized fractions inside the asset's bounding box [0..1]. */
  readonly boxStartFraction: readonly [number, number, number];
  readonly boxEndFraction: readonly [number, number, number];
  readonly boxSizeFraction: readonly [number, number, number];
  readonly color: string;
}

export interface IllustrativeInternalOverlaySpec {
  readonly title: string;
  readonly honestyNote: string;
  readonly exteriorOpacity: number;
  readonly nodes: readonly IllustrativePathwayNodeSpec[];
}

export interface IllustrativeSubsystemDefinition {
  readonly id: string;
  readonly label: string;
  readonly parentAssetId: string;
  readonly parentPartId?: string;
  readonly level: ExplorationLevel;
  readonly truthfulnessLabel: string;
  readonly summary: string;
  readonly sceneSpec: GeneratedScene3DSpec;
}

export interface AssetRegistryEntry {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly aliases: readonly string[];
  readonly description: string;
  readonly modelFormat: 'glb' | 'parametric-turbofan';
  readonly modelUrl: string;
  readonly source: string;
  readonly sourceUrl: string;
  readonly license: string;
  readonly attribution: string;
  readonly isBuiltIn: boolean;
  readonly verifiedInternalsNote: string;
  readonly defaultOverviewCamera: AssetPartCameraFraming;
  readonly knownParts: readonly AssetPartDefinition[];
  readonly illustrativeOverlay?: IllustrativeInternalOverlaySpec;
  readonly illustrativeSubsystems: readonly IllustrativeSubsystemDefinition[];
}

function buildValidatedSubsystemSpec(raw: unknown): GeneratedScene3DSpec {
  const validated = validateGeneratedScene3DSpec(raw);
  if (!validated || !validated.feasible) {
    throw new Error('Invalid built-in illustrative subsystem 3D specification.');
  }
  return validated;
}

const MARINE_DIESEL_ENGINE_SPEC = buildValidatedSubsystemSpec({
  feasible: true,
  systemTitle: 'Marine Diesel Propulsion Engine & Shaftline (Illustrative)',
  category: 'marine-propulsion-thermodynamics',
  conceptualNote:
    'Conceptual / Illustrative Subsystem — Ship exterior GLB does not include engine-room CAD geometry.',
  estimatedScaleLabel: 'Conceptual crosshead marine diesel · ~12 m engine frame',
  operatingPrinciple:
    'High-pressure diesel combustion drives the crosshead piston downward, converting linear force through the connecting rod and crankshaft into continuous propeller shaft torque.',
  physicalProcesses: [
    'Compression-ignition combustion expansion',
    'Crank-slider reciprocating-to-rotary conversion',
    'Axial thrust transfer through propeller shaft',
    'Hydrodynamic slipstream acceleration',
  ],
  components: [
    {
      id: 'cylinder-block',
      name: 'Cutaway Cylinder Liner & Frame',
      role: 'Houses the reciprocating piston and withstands peak cylinder combustion pressure (~160–200 bar).',
      position: [0, 0.75, 0],
      rotation: [0, 0, 0],
      explodeVector: [0, 1.5, 0],
      dimensionsEstimate: 'Bore ~0.6 m (conceptual cutaway)',
      operatingNote: 'Rendered semi-transparent so internal piston stroke and crank motion remain legible.',
      shapes: [
        {
          primitive: 'cylinder',
          offset: [0, 0.25, 0],
          rotation: [0, 0, 0],
          radius: 0.72,
          height: 1.85,
          material: { color: '#334155', metalness: 0.6, roughness: 0.4, opacity: 0.3 },
        },
        {
          primitive: 'torus',
          offset: [0, 1.16, 0],
          rotation: [Math.PI / 2, 0, 0],
          radius: 0.72,
          tubeRadius: 0.08,
          material: { color: '#64748B', metalness: 0.85, roughness: 0.25 },
        },
      ],
      animation: { type: 'none', axis: 'y', speed: 0, amplitude: 0, phaseOffset: 0 },
    },
    {
      id: 'combustion-zone',
      name: 'Combustion Chamber & Scavenge Glow',
      role: 'Fuel injection ignites in compressed scavenge air at top dead center, generating downward gas force.',
      position: [0, 1.48, 0],
      rotation: [0, 0, 0],
      explodeVector: [0, 2.2, 0],
      dimensionsEstimate: 'Clearance volume above piston crown',
      operatingNote: 'Pulses to illustrate cyclic power-stroke thermal energy release.',
      shapes: [
        {
          primitive: 'cylinder',
          offset: [0, 0, 0],
          rotation: [0, 0, 0],
          radius: 0.56,
          height: 0.34,
          material: {
            color: '#F97316',
            metalness: 0.1,
            roughness: 0.4,
            opacity: 0.72,
            emissive: '#EA580C',
            emissiveIntensity: 1.1,
          },
        },
      ],
      animation: { type: 'pulse-scale', axis: 'y', speed: 2.6, amplitude: 0.18, phaseOffset: 0 },
    },
    {
      id: 'piston-crown',
      name: 'Piston Crown & Compression Rings',
      role: 'Seals the combustion chamber and transfers downward gas pressure force into the crosshead & connecting rod.',
      position: [0, 0.65, 0],
      rotation: [0, 0, 0],
      explodeVector: [-1.4, 0.9, 0],
      dimensionsEstimate: 'Forged steel crown with triple ring grooves',
      operatingNote: 'Reciprocates vertically in phase with the crankshaft angle.',
      shapes: [
        {
          primitive: 'cylinder',
          offset: [0, 0, 0],
          rotation: [0, 0, 0],
          radius: 0.58,
          height: 0.52,
          material: { color: '#CBD5E1', metalness: 0.88, roughness: 0.22 },
        },
        {
          primitive: 'torus',
          offset: [0, 0.14, 0],
          rotation: [Math.PI / 2, 0, 0],
          radius: 0.59,
          tubeRadius: 0.03,
          material: { color: '#F59E0B', metalness: 0.85, roughness: 0.25 },
        },
      ],
      animation: {
        type: 'crank-slider',
        axis: 'y',
        speed: 2.6,
        amplitude: 0.45,
        phaseOffset: 0,
        crankRadius: 0.42,
        rodLength: 1.32,
        linkageRole: 'piston',
      },
    },
    {
      id: 'connecting-rod',
      name: 'Connecting Rod',
      role: 'Articulates between the reciprocating piston pin and rotating crankpin to transmit thrust.',
      position: [0, -0.2, 0],
      rotation: [0, 0, 0],
      explodeVector: [1.4, 0.3, 0],
      dimensionsEstimate: 'Forged I-beam rod · ~1.3 m scaled span',
      operatingNote: 'Oscillates laterally while tracking crankpin rotation.',
      shapes: [
        {
          primitive: 'box',
          offset: [0, 0, 0],
          rotation: [0, 0, 0],
          width: 0.16,
          height: 1.28,
          depth: 0.18,
          material: { color: '#94A3B8', metalness: 0.85, roughness: 0.28 },
        },
        {
          primitive: 'cylinder',
          offset: [0, -0.62, 0],
          rotation: [Math.PI / 2, 0, 0],
          radius: 0.22,
          height: 0.24,
          material: { color: '#D97706', metalness: 0.85, roughness: 0.24 },
        },
      ],
      animation: {
        type: 'crank-slider',
        axis: 'y',
        speed: 2.6,
        amplitude: 0.45,
        phaseOffset: 0,
        crankRadius: 0.42,
        rodLength: 1.32,
        linkageRole: 'connecting-rod',
      },
    },
    {
      id: 'crankshaft',
      name: 'Marine Crankshaft & Counterweights',
      role: 'Converts connecting-rod thrust into steady rotary torque driving the main propulsion shaft.',
      position: [0, -1.05, 0],
      rotation: [0, 0, 0],
      explodeVector: [0, -1.3, 0],
      dimensionsEstimate: 'Heavy marine crank journal & throw',
      operatingNote: 'Includes offset crankpin so crankshaft rotation is unmistakable.',
      shapes: [
        {
          primitive: 'cylinder',
          offset: [0, 0, 0],
          rotation: [Math.PI / 2, 0, 0],
          radius: 0.22,
          height: 1.8,
          material: { color: '#94A3B8', metalness: 0.9, roughness: 0.2 },
        },
        {
          primitive: 'box',
          offset: [0, 0.2, 0],
          rotation: [0, 0, 0],
          width: 0.34,
          height: 0.62,
          depth: 0.22,
          material: { color: '#475569', metalness: 0.82, roughness: 0.32 },
        },
        {
          primitive: 'cylinder',
          offset: [0, 0.42, 0],
          rotation: [Math.PI / 2, 0, 0],
          radius: 0.14,
          height: 0.42,
          material: { color: '#38BDF8', metalness: 0.8, roughness: 0.25, emissive: '#0284C7', emissiveIntensity: 0.3 },
        },
      ],
      animation: {
        type: 'crank-slider',
        axis: 'y',
        speed: 2.6,
        amplitude: 0.45,
        phaseOffset: 0,
        crankRadius: 0.42,
        rodLength: 1.32,
        linkageRole: 'crank',
      },
    },
    {
      id: 'propeller-shaft-hub',
      name: 'Thrust Shaft & Aft Propeller',
      role: 'Transmits engine shaft torque aft through the stern tube bearing to accelerate seawater and propel the hull.',
      position: [0, -1.05, 2.05],
      rotation: [0, 0, 0],
      explodeVector: [0, 0, 1.9],
      dimensionsEstimate: 'Direct-drive marine shaft & 4-blade propeller',
      operatingNote: 'Synchronized rotation with crankshaft RPM.',
      shapes: [
        {
          primitive: 'cylinder',
          offset: [0, 0, -0.7],
          rotation: [Math.PI / 2, 0, 0],
          radius: 0.14,
          height: 1.6,
          material: { color: '#CBD5E1', metalness: 0.88, roughness: 0.22 },
        },
        {
          primitive: 'cone',
          offset: [0, 0, 0.28],
          rotation: [Math.PI / 2, 0, 0],
          radius: 0.28,
          height: 0.48,
          material: { color: '#D97706', metalness: 0.88, roughness: 0.24 },
        },
        {
          primitive: 'box',
          offset: [0, 0.56, 0.08],
          rotation: [0.35, 0.35, 0],
          width: 0.26,
          height: 0.78,
          depth: 0.08,
          material: { color: '#B45309', metalness: 0.86, roughness: 0.26 },
        },
        {
          primitive: 'box',
          offset: [0, -0.56, 0.08],
          rotation: [-0.35, 0.35, 0],
          width: 0.26,
          height: 0.78,
          depth: 0.08,
          material: { color: '#B45309', metalness: 0.86, roughness: 0.26 },
        },
        {
          primitive: 'box',
          offset: [0.56, 0, 0.08],
          rotation: [0.35, -0.35, Math.PI / 2],
          width: 0.26,
          height: 0.78,
          depth: 0.08,
          material: { color: '#B45309', metalness: 0.86, roughness: 0.26 },
        },
        {
          primitive: 'box',
          offset: [-0.56, 0, 0.08],
          rotation: [-0.35, -0.35, Math.PI / 2],
          width: 0.26,
          height: 0.78,
          depth: 0.08,
          material: { color: '#B45309', metalness: 0.86, roughness: 0.26 },
        },
      ],
      animation: { type: 'spin', axis: 'z', speed: 2.6, amplitude: 1, phaseOffset: 0 },
    },
  ],
  connections: [
    { fromId: 'combustion-zone', toId: 'piston-crown', label: 'Gas expansion force', kind: 'thermal', animatedFlow: true },
    { fromId: 'piston-crown', toId: 'connecting-rod', label: 'Reciprocating thrust', kind: 'mechanical', animatedFlow: true },
    { fromId: 'connecting-rod', toId: 'crankshaft', label: 'Crank throw torque', kind: 'mechanical', animatedFlow: true },
    { fromId: 'crankshaft', toId: 'propeller-shaft-hub', label: 'Shaft RPM & thrust', kind: 'mechanical', animatedFlow: true },
  ],
});

const DRILL_MOTOR_SPEC = buildValidatedSubsystemSpec({
  feasible: true,
  systemTitle: 'Cordless Drill Motor & Planetary Gearbox (Illustrative)',
  category: 'electromechanical-drivetrain',
  conceptualNote:
    'Conceptual / Illustrative Subsystem — Exterior drill GLB does not contain internal motor windings or planetary gears.',
  estimatedScaleLabel: 'Conceptual compact DC drive · ~12 cm internal stack',
  operatingPrinciple:
    'Battery DC energizes the armature windings inside the permanent-magnet stator, spinning the rotor into a compact planetary reduction stage that multiplies torque at the chuck.',
  physicalProcesses: [
    'Lorentz electromagnetic torque',
    'Armature commutation',
    'Planetary gear torque multiplication',
  ],
  components: [
    {
      id: 'stator-casing',
      name: 'Cutaway Stator Housing & Magnets',
      role: 'Provides the stationary radial magnetic field surrounding the spinning rotor.',
      position: [-1.1, 0, 0],
      rotation: [0, 0, Math.PI / 2],
      explodeVector: [-1.4, 0, 0],
      dimensionsEstimate: '48 mm cylindrical stator shell',
      shapes: [
        {
          primitive: 'cylinder',
          offset: [0, 0, 0],
          rotation: [0, 0, 0],
          radius: 0.82,
          height: 1.5,
          material: { color: '#334155', metalness: 0.65, roughness: 0.4, opacity: 0.32 },
        },
      ],
      animation: { type: 'none', axis: 'x', speed: 0, amplitude: 0, phaseOffset: 0 },
    },
    {
      id: 'copper-windings',
      name: 'Rotor Copper Windings',
      role: 'Carries DC current loops that experience Lorentz force inside the stator magnetic field.',
      position: [-1.1, 0, 0],
      rotation: [0, 0, Math.PI / 2],
      explodeVector: [-0.6, 0.9, 0],
      dimensionsEstimate: 'Multi-turn enameled copper coils',
      shapes: [
        {
          primitive: 'helix',
          offset: [0, 0, 0],
          rotation: [0, 0, 0],
          radius: 0.46,
          height: 1.15,
          turns: 6,
          tubeRadius: 0.06,
          material: { color: '#D97706', metalness: 0.88, roughness: 0.22 },
        },
      ],
      animation: { type: 'spin', axis: 'x', speed: 4.5, amplitude: 1, phaseOffset: 0 },
    },
    {
      id: 'rotor-shaft',
      name: 'High-Speed Rotor & Pinion',
      role: 'Delivers high-RPM, low-torque rotation from the electric motor core to the gearbox.',
      position: [-0.35, 0, 0],
      rotation: [0, 0, Math.PI / 2],
      explodeVector: [0, 0, 0],
      dimensionsEstimate: 'Hardened steel armature shaft',
      shapes: [
        {
          primitive: 'cylinder',
          offset: [0, 0, 0],
          rotation: [0, 0, 0],
          radius: 0.16,
          height: 2.3,
          material: { color: '#CBD5E1', metalness: 0.9, roughness: 0.2 },
        },
      ],
      animation: { type: 'spin', axis: 'x', speed: 4.5, amplitude: 1, phaseOffset: 0 },
    },
    {
      id: 'planetary-stage',
      name: 'Planetary Gear Reduction Stage',
      role: 'Steps down motor RPM while multiplying output torque to drive screws or drill bits.',
      position: [0.85, 0, 0],
      rotation: [0, Math.PI / 2, 0],
      explodeVector: [1.0, 0, 0],
      dimensionsEstimate: 'Sun + ring gear reduction stage',
      shapes: [
        {
          primitive: 'gear',
          offset: [0, 0, 0],
          rotation: [0, 0, 0],
          radius: 0.65,
          depth: 0.28,
          teeth: 16,
          material: { color: '#94A3B8', metalness: 0.85, roughness: 0.25 },
        },
      ],
      animation: { type: 'spin', axis: 'x', speed: 1.8, amplitude: 1, phaseOffset: 0 },
    },
    {
      id: 'chuck-output',
      name: 'Keyless Chuck Spindle',
      role: 'Clamps the drill bit concentrically and transfers reduced high-torque rotation to the workpiece.',
      position: [1.85, 0, 0],
      rotation: [0, 0, -Math.PI / 2],
      explodeVector: [1.9, 0, 0],
      dimensionsEstimate: '13 mm three-jaw chuck collar',
      shapes: [
        {
          primitive: 'cylinder',
          offset: [0, 0, 0],
          rotation: [0, 0, 0],
          radius: 0.44,
          height: 0.85,
          material: { color: '#1E293B', metalness: 0.78, roughness: 0.3 },
        },
        {
          primitive: 'cone',
          offset: [0, 0.56, 0],
          rotation: [0, 0, 0],
          radius: 0.34,
          height: 0.36,
          material: { color: '#38BDF8', metalness: 0.7, roughness: 0.3 },
        },
      ],
      animation: { type: 'spin', axis: 'x', speed: 1.8, amplitude: 1, phaseOffset: 0 },
    },
  ],
  connections: [
    { fromId: 'stator-casing', toId: 'copper-windings', label: 'Magnetic flux interaction', kind: 'magnetic', animatedFlow: true },
    { fromId: 'copper-windings', toId: 'rotor-shaft', label: 'High-RPM torque', kind: 'mechanical', animatedFlow: true },
    { fromId: 'rotor-shaft', toId: 'planetary-stage', label: 'Gear reduction', kind: 'mechanical', animatedFlow: true },
    { fromId: 'planetary-stage', toId: 'chuck-output', label: 'Multiplied chuck torque', kind: 'mechanical', animatedFlow: true },
  ],
});

const SEDAN_IC_POWERTRAIN_SPEC = buildValidatedSubsystemSpec({
  feasible: true,
  systemTitle: 'Automotive 4-Stroke Piston & Crankshaft (Illustrative)',
  category: 'automotive-powertrain',
  conceptualNote:
    'Conceptual / Illustrative Subsystem — Exterior sedan GLB does not include engine-bay internal cylinders.',
  estimatedScaleLabel: 'Conceptual single-cylinder cross-section · ~10 cm bore',
  operatingPrinciple:
    'Spark-ignited air-fuel expansion pushes the piston down, spinning the crankshaft and flywheel to deliver rotary power to the drivetrain.',
  physicalProcesses: [
    'Four-stroke Otto cycle gas expansion',
    'Crank-slider kinematics',
    'Rotational inertia smoothing via flywheel',
  ],
  components: [
    {
      id: 'engine-block',
      name: 'Cutaway Cylinder Sleeve',
      role: 'Guides the reciprocating piston and forms the sealed combustion chamber.',
      position: [0, 0.72, 0],
      rotation: [0, 0, 0],
      explodeVector: [0, 1.4, 0],
      shapes: [
        {
          primitive: 'cylinder',
          offset: [0, 0.25, 0],
          rotation: [0, 0, 0],
          radius: 0.68,
          height: 1.75,
          material: { color: '#334155', metalness: 0.65, roughness: 0.4, opacity: 0.3 },
        },
      ],
      animation: { type: 'none', axis: 'y', speed: 0, amplitude: 0, phaseOffset: 0 },
    },
    {
      id: 'piston',
      name: 'Aluminum Piston',
      role: 'Compresses intake charge and captures combustion expansion work.',
      position: [0, 0.6, 0],
      rotation: [0, 0, 0],
      explodeVector: [-1.2, 0.7, 0],
      shapes: [
        {
          primitive: 'cylinder',
          offset: [0, 0, 0],
          rotation: [0, 0, 0],
          radius: 0.54,
          height: 0.46,
          material: { color: '#E2E8F0', metalness: 0.88, roughness: 0.2 },
        },
      ],
      animation: {
        type: 'crank-slider',
        axis: 'y',
        speed: 3.1,
        amplitude: 0.42,
        phaseOffset: 0,
        crankRadius: 0.4,
        rodLength: 1.25,
        linkageRole: 'piston',
      },
    },
    {
      id: 'connecting-rod',
      name: 'Connecting Rod',
      role: 'Transfers piston axial force to the rotating crankpin.',
      position: [0, -0.2, 0],
      rotation: [0, 0, 0],
      explodeVector: [1.2, 0.2, 0],
      shapes: [
        {
          primitive: 'box',
          offset: [0, 0, 0],
          rotation: [0, 0, 0],
          width: 0.14,
          height: 1.22,
          depth: 0.16,
          material: { color: '#94A3B8', metalness: 0.85, roughness: 0.28 },
        },
      ],
      animation: {
        type: 'crank-slider',
        axis: 'y',
        speed: 3.1,
        amplitude: 0.42,
        phaseOffset: 0,
        crankRadius: 0.4,
        rodLength: 1.25,
        linkageRole: 'connecting-rod',
      },
    },
    {
      id: 'crankshaft',
      name: 'Crankshaft & Flywheel',
      role: 'Outputs smooth rotary torque toward the transmission and front/rear axles.',
      position: [0, -1.0, 0],
      rotation: [0, 0, 0],
      explodeVector: [0, -1.3, 0],
      shapes: [
        {
          primitive: 'cylinder',
          offset: [0, 0, 0],
          rotation: [Math.PI / 2, 0, 0],
          radius: 0.2,
          height: 1.5,
          material: { color: '#94A3B8', metalness: 0.9, roughness: 0.22 },
        },
        {
          primitive: 'cylinder',
          offset: [0, 0, 0.82],
          rotation: [Math.PI / 2, 0, 0],
          radius: 0.72,
          height: 0.16,
          material: { color: '#475569', metalness: 0.85, roughness: 0.3 },
        },
        {
          primitive: 'cylinder',
          offset: [0, 0.4, 0],
          rotation: [Math.PI / 2, 0, 0],
          radius: 0.12,
          height: 0.38,
          material: { color: '#38BDF8', metalness: 0.8, roughness: 0.25 },
        },
      ],
      animation: {
        type: 'crank-slider',
        axis: 'y',
        speed: 3.1,
        amplitude: 0.42,
        phaseOffset: 0,
        crankRadius: 0.4,
        rodLength: 1.25,
        linkageRole: 'crank',
      },
    },
  ],
  connections: [
    { fromId: 'piston', toId: 'connecting-rod', label: 'Combustion stroke force', kind: 'mechanical', animatedFlow: true },
    { fromId: 'connecting-rod', toId: 'crankshaft', label: 'Drivetrain torque', kind: 'mechanical', animatedFlow: true },
  ],
});

export const BUILTIN_ASSET_REGISTRY: readonly AssetRegistryEntry[] = [
  {
    id: 'container-ship',
    name: 'Container Ship',
    category: 'marine-vessel',
    aliases: [
      'ship',
      'container ship',
      'cargo ship',
      'feeder vessel',
      'merchant ship',
      'freighter',
      'vessel',
      'marine propeller',
      'ship rudder',
    ],
    description:
      'Gearless feeder container ship (141 m hull) with slate-blue steel hull, red antifouling below the waterline, bulbous bow, aft bridge superstructure, stacked containers, rotating radar scanner, stern rudder, and fixed-pitch marine propeller.',
    modelFormat: 'glb',
    modelUrl: '/models/container-ship.glb',
    source: 'tevy.dev',
    sourceUrl: 'https://tevy.dev/models/container-ship',
    license: 'CC0-1.0',
    attribution:
      'Container Ship CC0-1.0 Public Domain glTF asset from tevy.dev (self-hosted locally for offline reliability).',
    isBuiltIn: true,
    verifiedInternalsNote:
      'Exterior vessel geometry plus individually articulated stern propeller, rudder, deck containers, deck fittings, and aft radar scanner. Engine-room machinery inside the hull is NOT modeled in the GLB.',
    defaultOverviewCamera: { azimuthDeg: 52, elevationDeg: 22, distanceScale: 1.52 },
    knownParts: [
      {
        id: 'hull',
        label: 'Hull & Bulbous Bow',
        role: 'Watertight steel hull structure providing buoyancy, structural longitudinal strength, and wave-drag reduction via the submerged bulbous bow.',
        operatingNote: 'Lower antifouling red coating reduces marine biofouling below the waterline.',
        meshNamePatterns: ['body'],
        isVerifiedMesh: true,
        isSubRegionOfMesh: true,
        boundsFraction: { minY: 0, maxY: 0.48 },
        cameraFraming: { azimuthDeg: 45, elevationDeg: 14, distanceScale: 1.48 },
      },
      {
        id: 'superstructure',
        label: 'Superstructure & Bridge',
        role: 'Aft accommodation deckhouse, navigation bridge wings, and exhaust funnel housing navigation control and crew quarters.',
        operatingNote:
          'Shares the primary "body" vessel mesh; camera frames the aft bridge superstructure region.',
        meshNamePatterns: ['body'],
        isVerifiedMesh: true,
        isSubRegionOfMesh: true,
        boundsFraction: { minZ: 0, maxZ: 0.36, minY: 0.35, maxY: 1.0 },
        cameraFraming: { azimuthDeg: 132, elevationDeg: 22, distanceScale: 1.75 },
      },
      {
        id: 'propeller',
        label: 'Propeller',
        role: 'Stern marine screw propeller converting main engine shaft torque into hydrodynamic thrust pushing water astern.',
        operatingNote: 'Verified individual GLB mesh node ("propeller") animated around its shaft axis.',
        meshNamePatterns: ['propeller', 'propeller_mesh'],
        isVerifiedMesh: true,
        isSubRegionOfMesh: false,
        animation: { type: 'spin', axis: 'z', speed: 5.2 },
        cameraFraming: { azimuthDeg: 144, elevationDeg: -6, distanceScale: 3.1 },
      },
      {
        id: 'rudder',
        label: 'Rudder',
        role: 'Hydrodynamic steering foil mounted directly behind the propeller slipstream to generate yaw turning moments.',
        operatingNote: 'Verified individual GLB mesh node ("rudder") deflecting about its vertical stock.',
        meshNamePatterns: ['rudder', 'rudder_mesh'],
        isVerifiedMesh: true,
        isSubRegionOfMesh: false,
        animation: { type: 'oscillate', axis: 'y', speed: 1.35, amplitude: 0.36 },
        cameraFraming: { azimuthDeg: 158, elevationDeg: 4, distanceScale: 3.1 },
      },
      {
        id: 'radar_scanner',
        label: 'Navigation Radar',
        role: 'X/S-band rotating marine radar array atop the bridge mast scanning surrounding vessel traffic and coastlines.',
        operatingNote: 'Verified individual GLB mesh node ("radar_scanner") rotating atop the bridge.',
        meshNamePatterns: ['radar_scanner', 'radar_scanner_mesh'],
        isVerifiedMesh: true,
        isSubRegionOfMesh: false,
        animation: { type: 'spin', axis: 'y', speed: 2.3 },
        cameraFraming: { azimuthDeg: 130, elevationDeg: 26, distanceScale: 3.5 },
      },
      {
        id: 'containers',
        label: 'Cargo Containers',
        role: 'Intermodal ISO shipping containers stacked in cellular deck bays with lashing bridges.',
        operatingNote: 'Verified container stack instances mounted on the main weather deck.',
        meshNamePatterns: ['containers', 'container_'],
        isVerifiedMesh: true,
        isSubRegionOfMesh: false,
        cameraFraming: { azimuthDeg: 42, elevationDeg: 32, distanceScale: 1.55 },
      },
      {
        id: 'fittings',
        label: 'Deck Fittings & Cranes',
        role: 'Mooring winches, deck railings, lifeboats, and signal masts supporting port operations.',
        operatingNote: 'Verified deck fittings mesh group.',
        meshNamePatterns: ['fittings'],
        isVerifiedMesh: true,
        isSubRegionOfMesh: false,
        cameraFraming: { azimuthDeg: 58, elevationDeg: 24, distanceScale: 1.6 },
      },
      {
        id: 'engine',
        label: 'Marine Engine (Conceptual)',
        role: 'Conceptual aft marine diesel prime mover generating shaft torque inside the machinery room.',
        operatingNote: 'Conceptual cutaway machinery zone aligned below the aft bridge superstructure.',
        meshNamePatterns: ['body'],
        isVerifiedMesh: false,
        isSubRegionOfMesh: true,
        boundsFraction: { minX: 0.32, maxX: 0.68, minY: 0.06, maxY: 0.34, minZ: 0.2, maxZ: 0.42 },
        cameraFraming: { azimuthDeg: 112, elevationDeg: 18, distanceScale: 2.35 },
      },
      {
        id: 'coupling',
        label: 'Shaft Coupling (Conceptual)',
        role: 'Conceptual flexible flange coupling & thrust collar linking engine crankshaft to stern propeller shaft.',
        operatingNote: 'Rotates at exact 1:1 shaft speed with the aft propeller.',
        meshNamePatterns: ['body'],
        isVerifiedMesh: false,
        isSubRegionOfMesh: true,
        boundsFraction: { minX: 0.42, maxX: 0.58, minY: 0.03, maxY: 0.22, minZ: 0.14, maxZ: 0.26 },
        cameraFraming: { azimuthDeg: 118, elevationDeg: 10, distanceScale: 2.7 },
      },
      {
        id: 'propeller-shaft',
        label: 'Propeller Shaft (Conceptual)',
        role: 'Conceptual stern-tube drive shaft transmitting torque from the coupling aft to the verified propeller.',
        operatingNote: 'Runs straight along the keel centerline at exact shaft RPM.',
        meshNamePatterns: ['body'],
        isVerifiedMesh: false,
        isSubRegionOfMesh: true,
        boundsFraction: { minX: 0.44, maxX: 0.56, minY: 0.02, maxY: 0.18, minZ: 0.04, maxZ: 0.2 },
        cameraFraming: { azimuthDeg: 128, elevationDeg: 4, distanceScale: 2.65 },
      },
      {
        id: 'water-thrust',
        label: 'Water Thrust Wake',
        role: 'Hydrodynamic slipstream accelerated astern by the rotating propeller blades to propel the hull forward.',
        operatingNote: 'Conceptual wake rings moving astern synchronized to propeller rotation.',
        meshNamePatterns: ['propeller', 'propeller_mesh'],
        isVerifiedMesh: false,
        isSubRegionOfMesh: true,
        boundsFraction: { minX: 0.38, maxX: 0.62, minY: 0.0, maxY: 0.24, minZ: 0.0, maxZ: 0.12 },
        cameraFraming: { azimuthDeg: 146, elevationDeg: 2, distanceScale: 2.8 },
      },
    ],
    illustrativeOverlay: {
      title: 'Conceptual Propulsion Pathway (Engine -> Coupling -> Shaft -> Propeller -> Thrust)',
      honestyNote:
        'Translucent hull reveals a conceptual engine-room & shaftline placement connecting forward to the verified stern propeller. Internal engine-room CAD is NOT inside the ship GLB.',
      exteriorOpacity: 0.24,
      nodes: [
        {
          id: 'main-engine-envelope',
          label: 'Marine Diesel Engine Zone (Conceptual)',
          kind: 'engine-block',
          boxStartFraction: [0.5, 0.17, 0.25],
          boxEndFraction: [0.5, 0.17, 0.37],
          boxSizeFraction: [0.28, 0.2, 0.14],
          color: '#F59E0B',
        },
        {
          id: 'intermediate-propeller-shaft',
          label: 'Propeller Drive Shaftline (Conceptual)',
          kind: 'shaft',
          boxStartFraction: [0.5, 0.08, 0.06],
          boxEndFraction: [0.5, 0.14, 0.26],
          boxSizeFraction: [0.05, 0.05, 0.2],
          color: '#38BDF8',
        },
      ],
    },
    illustrativeSubsystems: [
      {
        id: 'marine-diesel-engine',
        label: 'Marine Diesel Engine (Illustrative)',
        parentAssetId: 'container-ship',
        parentPartId: 'propeller',
        level: 'component-detail',
        truthfulnessLabel:
          'Conceptual / Illustrative Subsystem — Not extracted from the container ship exterior GLB',
        summary:
          'Explore the conceptual two-stroke marine diesel crosshead piston, connecting rod, crankshaft, and propeller shaft driving the stern screw.',
        sceneSpec: MARINE_DIESEL_ENGINE_SPEC,
      },
    ],
  },
  {
    id: 'cordless-drill',
    name: 'Cordless Electric Drill',
    category: 'power-tool',
    aliases: [
      'drill',
      'cordless drill',
      'electric drill',
      'power drill',
      'hand drill',
      'drill chuck',
    ],
    description:
      'Handheld brushless/brushed cordless electric drill with ergonomic grip, battery pack base, torque clutch collar, and rotating keyless 3-jaw chuck.',
    modelFormat: 'glb',
    modelUrl: '/models/cordless-drill.glb',
    source: 'tevy.dev',
    sourceUrl: 'https://tevy.dev/models/cordless-drill',
    license: 'CC0-1.0',
    attribution:
      'Cordless Drill CC0-1.0 Public Domain glTF asset from tevy.dev (self-hosted locally).',
    isBuiltIn: true,
    verifiedInternalsNote:
      'Exterior tool housing and articulated rotating chuck are real GLB meshes. Internal DC motor, 4:1 planetary gearbox, and output shaft are rendered as a coherent conceptual drivetrain.',
    defaultOverviewCamera: { azimuthDeg: 52, elevationDeg: 18, distanceScale: 1.55 },
    knownParts: [
      {
        id: 'chuck',
        label: 'Keyless Chuck',
        role: 'Rotates and clamps drill bits or driver heads concentrically under reduced planetary gearbox torque.',
        operatingNote: 'Verified GLB mesh node ("chuck") synchronized 1:1 with the gearbox output shaft (4:1 reduction).',
        meshNamePatterns: ['chuck', 'chuck_mesh'],
        isVerifiedMesh: true,
        isSubRegionOfMesh: false,
        animation: { type: 'spin', axis: 'x', speed: 4.0 },
        cameraFraming: { azimuthDeg: 68, elevationDeg: 15, distanceScale: 2.5 },
      },
      {
        id: 'housing',
        label: 'Exterior Housing',
        role: 'Clamshell housing protecting the DC motor, trigger switch, planetary gearbox, and handle grip.',
        operatingNote: 'Verified outer shell mesh ("cordless_drill"); turns translucent in cutaway/internal modes.',
        meshNamePatterns: ['cordless_drill', 'cordless_drill_mesh'],
        isVerifiedMesh: true,
        isSubRegionOfMesh: false,
        cameraFraming: { azimuthDeg: 45, elevationDeg: 18, distanceScale: 1.5 },
      },
      {
        id: 'trigger',
        label: 'Trigger Switch (Conceptual)',
        role: 'Variable-speed trigger modulating battery PWM current delivered to the electric motor.',
        operatingNote: 'Conceptual internal trigger module inside the upper handle grip.',
        meshNamePatterns: ['cordless_drill', 'cordless_drill_mesh'],
        isVerifiedMesh: false,
        isSubRegionOfMesh: true,
        boundsFraction: { minX: 0.38, maxX: 0.58, minY: 0.36, maxY: 0.6, minZ: 0.35, maxZ: 0.65 },
        cameraFraming: { azimuthDeg: 85, elevationDeg: 12, distanceScale: 2.4 },
      },
      {
        id: 'battery',
        label: 'Battery Pack (Conceptual)',
        role: 'Detachable lithium-ion pack supplying DC power upward through the grip to the trigger and motor.',
        operatingNote: 'Base power pack region of the drill.',
        meshNamePatterns: ['cordless_drill', 'cordless_drill_mesh'],
        isVerifiedMesh: false,
        isSubRegionOfMesh: true,
        boundsFraction: { minX: 0.2, maxX: 0.55, minY: 0.0, maxY: 0.28, minZ: 0.25, maxZ: 0.75 },
        cameraFraming: { azimuthDeg: 58, elevationDeg: 6, distanceScale: 2.1 },
      },
      {
        id: 'motor',
        label: 'DC Electric Motor (Conceptual)',
        role: 'High-RPM copper armature rotor spinning the central sun pinion gear.',
        operatingNote: 'Conceptual motor spins at 4x the output chuck speed (16 rad/s vs 4 rad/s).',
        meshNamePatterns: ['cordless_drill', 'cordless_drill_mesh'],
        isVerifiedMesh: false,
        isSubRegionOfMesh: true,
        boundsFraction: { minX: 0.25, maxX: 0.52, minY: 0.58, maxY: 0.88, minZ: 0.28, maxZ: 0.72 },
        cameraFraming: { azimuthDeg: 95, elevationDeg: 16, distanceScale: 2.3 },
      },
      {
        id: 'gearbox',
        label: 'Planetary Gearbox (Conceptual)',
        role: 'Sun, three planet gears, and stationary ring gear stepping motor speed down 4:1 while multiplying torque.',
        operatingNote: 'Planet gears orbit and counter-rotate coherently inside the fixed ring gear.',
        meshNamePatterns: ['cordless_drill', 'cordless_drill_mesh'],
        isVerifiedMesh: false,
        isSubRegionOfMesh: true,
        boundsFraction: { minX: 0.5, maxX: 0.74, minY: 0.58, maxY: 0.88, minZ: 0.28, maxZ: 0.72 },
        cameraFraming: { azimuthDeg: 82, elevationDeg: 18, distanceScale: 2.35 },
      },
      {
        id: 'output-shaft',
        label: 'Output Spindle Shaft (Conceptual)',
        role: 'Carries reduced-speed, high-torque planetary carrier rotation directly into the keyless chuck.',
        operatingNote: 'Locked 1:1 with the real GLB chuck rotation.',
        meshNamePatterns: ['cordless_drill', 'cordless_drill_mesh'],
        isVerifiedMesh: false,
        isSubRegionOfMesh: true,
        boundsFraction: { minX: 0.7, maxX: 0.88, minY: 0.62, maxY: 0.84, minZ: 0.34, maxZ: 0.66 },
        cameraFraming: { azimuthDeg: 74, elevationDeg: 16, distanceScale: 2.45 },
      },
    ],
    illustrativeOverlay: {
      title: 'Conceptual Drivetrain (Trigger -> Motor -> Planetary Gearbox -> Output Shaft -> Chuck)',
      honestyNote:
        'Translucent drill housing reveals conceptual placement of the DC motor and 4:1 planetary reduction stage feeding the verified chuck mesh.',
      exteriorOpacity: 0.24,
      nodes: [
        {
          id: 'dc-motor-zone',
          label: 'Electric Motor Core (Conceptual)',
          kind: 'engine-block',
          boxStartFraction: [0.3, 0.72, 0.5],
          boxEndFraction: [0.55, 0.72, 0.5],
          boxSizeFraction: [0.26, 0.22, 0.45],
          color: '#F59E0B',
        },
        {
          id: 'planetary-gearbox-zone',
          label: 'Planetary Gearbox (Conceptual)',
          kind: 'gearbox',
          boxStartFraction: [0.56, 0.72, 0.5],
          boxEndFraction: [0.74, 0.72, 0.5],
          boxSizeFraction: [0.18, 0.2, 0.4],
          color: '#38BDF8',
        },
      ],
    },
    illustrativeSubsystems: [
      {
        id: 'drill-motor-drivetrain',
        label: 'DC Motor & Planetary Gearbox (Illustrative)',
        parentAssetId: 'cordless-drill',
        parentPartId: 'chuck',
        level: 'component-detail',
        truthfulnessLabel:
          'Conceptual / Illustrative Subsystem — Internal motor and gears are not modeled inside the exterior drill GLB',
        summary:
          'Inspect the conceptual brushed/BLDC rotor windings, stator magnets, planetary gear reduction, and chuck spindle.',
        sceneSpec: DRILL_MOTOR_SPEC,
      },
    ],
  },
  {
    id: 'family-sedan',
    name: 'Family Sedan',
    category: 'automotive-vehicle',
    aliases: [
      'car',
      'sedan',
      'automobile',
      'family sedan',
      'passenger car',
      'vehicle',
    ],
    description:
      'Complete four-door passenger sedan with articulated doors, bonnet, boot lid, steering wheel, and independently rotatable four wheels.',
    modelFormat: 'glb',
    modelUrl: '/models/family-sedan.glb',
    source: 'tevy.dev',
    sourceUrl: 'https://tevy.dev/models/family-sedan',
    license: 'CC0-1.0',
    attribution:
      'Family Sedan (LOD1) CC0-1.0 Public Domain glTF asset from tevy.dev (self-hosted locally).',
    isBuiltIn: true,
    verifiedInternalsNote:
      'Complete vehicle exterior, interior cabin, doors, bonnet, boot, and four wheels are real GLB meshes. Under-hood engine pistons & crankshaft are modeled separately as an illustrative powertrain view.',
    defaultOverviewCamera: { azimuthDeg: 46, elevationDeg: 18, distanceScale: 1.55 },
    knownParts: [
      {
        id: 'body',
        label: 'Chassis & Body Shell',
        role: 'Aerodynamic unibody chassis frame enclosing cabin, bumpers, and lighting assemblies.',
        operatingNote: 'Verified vehicle body & cabin meshes.',
        meshNamePatterns: ['body', 'interior', 'glass_'],
        isVerifiedMesh: true,
        isSubRegionOfMesh: false,
        cameraFraming: { azimuthDeg: 46, elevationDeg: 18, distanceScale: 1.55 },
      },
      {
        id: 'bonnet',
        label: 'Engine Bonnet (Hood)',
        role: 'Hinged forward hood covering the engine bay and front cooling intake.',
        operatingNote: 'Verified "bonnet" mesh group.',
        meshNamePatterns: ['bonnet', 'bonnet_body'],
        isVerifiedMesh: true,
        isSubRegionOfMesh: false,
        cameraFraming: { azimuthDeg: 35, elevationDeg: 28, distanceScale: 2.1 },
      },
      {
        id: 'wheel_FL',
        label: 'Front Left Wheel & Brake',
        role: 'Steerable driven front wheel assembly transmitting traction and braking forces to the road.',
        operatingNote: 'Verified individual GLB wheel mesh ("wheel_FL") rotating about its axle.',
        meshNamePatterns: ['wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR'],
        isVerifiedMesh: true,
        isSubRegionOfMesh: false,
        animation: { type: 'spin', axis: 'x', speed: 4.0 },
        cameraFraming: { azimuthDeg: 62, elevationDeg: 10, distanceScale: 2.3 },
      },
      {
        id: 'door_FL',
        label: 'Front Doors & Cabin',
        role: 'Side passenger doors with wing mirrors and interior trim.',
        operatingNote: 'Verified "door_FL" / "door_FR" meshes.',
        meshNamePatterns: ['door_FL', 'door_FR'],
        isVerifiedMesh: true,
        isSubRegionOfMesh: false,
        cameraFraming: { azimuthDeg: 88, elevationDeg: 16, distanceScale: 1.9 },
      },
    ],
    illustrativeOverlay: {
      title: 'Conceptual Front-Engine Powertrain Placement (Illustrative Overlay)',
      honestyNote:
        'Translucent body reveals conceptual engine-bay and driveshaft placement relative to the verified front wheels.',
      exteriorOpacity: 0.25,
      nodes: [
        {
          id: 'sedan-engine-zone',
          label: 'Engine Block Zone (Conceptual)',
          kind: 'engine-block',
          boxStartFraction: [0.5, 0.45, 0.72],
          boxEndFraction: [0.5, 0.45, 0.88],
          boxSizeFraction: [0.42, 0.28, 0.2],
          color: '#F59E0B',
        },
        {
          id: 'front-axle-shaft',
          label: 'Front Axle & Transaxle (Conceptual)',
          kind: 'shaft',
          boxStartFraction: [0.18, 0.24, 0.74],
          boxEndFraction: [0.82, 0.24, 0.74],
          boxSizeFraction: [0.64, 0.06, 0.06],
          color: '#38BDF8',
        },
      ],
    },
    illustrativeSubsystems: [
      {
        id: 'sedan-ic-powertrain',
        label: '4-Stroke Car Engine & Crankshaft (Illustrative)',
        parentAssetId: 'family-sedan',
        parentPartId: 'bonnet',
        level: 'component-detail',
        truthfulnessLabel:
          'Conceptual / Illustrative Subsystem — Under-hood cylinder internals are not modeled in the sedan GLB',
        summary:
          'Inspect the conceptual reciprocating piston, connecting rod, crankshaft, and flywheel powering the drivetrain.',
        sceneSpec: SEDAN_IC_POWERTRAIN_SPEC,
      },
    ],
  },
  {
    id: 'turbofan-engine',
    name: 'High-Bypass Turbofan Engine',
    category: 'aerospace-propulsion',
    aliases: [
      'turbofan',
      'jet engine',
      'aircraft engine',
      'brayton cycle',
      'turbine engine',
    ],
    description:
      'Complete 8-stage parametric high-bypass turbofan engine featuring Intake, Fan, LP Compressor, HP Compressor, Combustor, Turbine, Exhaust Nozzle, and Bypass Duct.',
    modelFormat: 'parametric-turbofan',
    modelUrl: 'builtin://turbofan-engine',
    source: 'Visual Learning Studio Engineering CAD',
    sourceUrl: 'builtin://turbofan-engine',
    license: 'Apache-2.0',
    attribution: 'Built-in parametric Three.js engineering model created for Visual Learning Studio.',
    isBuiltIn: true,
    verifiedInternalsNote:
      'All 8 engine stages and airflow/thermal layers are genuinely modeled in 3D parametric geometry inside the studio.',
    defaultOverviewCamera: { azimuthDeg: 45, elevationDeg: 18, distanceScale: 1.5 },
    knownParts: [],
    illustrativeSubsystems: [],
  },
];

export function getAssetEntryById(
  assetId: string | undefined | null,
  customAssets: readonly AssetRegistryEntry[] = [],
): AssetRegistryEntry | null {
  if (!assetId) return null;
  const norm = assetId.trim().toLowerCase();
  return (
    BUILTIN_ASSET_REGISTRY.find((a) => a.id === norm) ??
    customAssets.find((a) => a.id.toLowerCase() === norm) ??
    null
  );
}

/**
 * Finds an illustrative subsystem entry across the built-in registry by subsystem id.
 */
export function getIllustrativeSubsystemById(
  subsystemId: string | undefined | null,
): { entry: AssetRegistryEntry; subsystem: IllustrativeSubsystemDefinition } | null {
  if (!subsystemId) return null;
  const norm = subsystemId.trim().toLowerCase();
  for (const entry of BUILTIN_ASSET_REGISTRY) {
    const found = entry.illustrativeSubsystems.find((s) => s.id.toLowerCase() === norm);
    if (found) {
      return { entry, subsystem: found };
    }
  }
  return null;
}

/**
 * Formats the approved 3D Asset Registry (plus any user-uploaded GLBs) cleanly
 * so Gemini performs Retrieval-Before-Generation on every request.
 */
export function formatAssetCatalogForPrompt(
  uploadedAssets: readonly UploadedAssetSummary[] = [],
): string {
  const lines = BUILTIN_ASSET_REGISTRY.map((entry) => {
    const partsText =
      entry.knownParts.length > 0
        ? entry.knownParts.map((p) => p.id).join(', ')
        : 'intake, fan, lp-compressor, hp-compressor, combustor, turbine, nozzle, bypass-duct';
    const subText =
      entry.illustrativeSubsystems.length > 0
        ? ` | IllustrativeSubsystems: ${entry.illustrativeSubsystems.map((s) => s.id).join(', ')}`
        : '';
    return `- id="${entry.id}" | name="${entry.name}" | aliases=[${entry.aliases.slice(0, 6).join(', ')}] | parts=[${partsText}]${subText}`;
  });

  for (const up of uploadedAssets) {
    lines.push(
      `- id="${up.id}" (USER UPLOADED GLB) | name="${up.name}" | category="${up.category}" | parts=[${up.parts.slice(0, 12).join(', ')}]`,
    );
  }

  return lines.join('\n');
}

/**
 * Matches a natural-language query or alias against the approved asset registry
 * when deterministic lookup is needed cleanly.
 */
export function matchAssetIdFromQuery(
  query: string,
  customAssets: readonly AssetRegistryEntry[] = [],
): AssetRegistryEntry | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const all = [...customAssets, ...BUILTIN_ASSET_REGISTRY];
  for (const entry of all) {
    if (entry.id.toLowerCase() === q || entry.name.toLowerCase() === q) {
      return entry;
    }
  }
  for (const entry of all) {
    if (entry.aliases.some((alias) => q.includes(alias.toLowerCase()))) {
      return entry;
    }
  }
  return null;
}
