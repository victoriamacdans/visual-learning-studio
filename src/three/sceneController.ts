import { APP_CONFIG } from '../config/appConfig.ts';
import type { SceneActionPlan, ShowcaseSceneId } from '../types/tutor.ts';
import { SIX_STROKE_VARIANTS, type SixStrokeVariantId } from './sixStrokeKinematics.ts';

export type SceneViewMode = 'full' | 'cutaway' | 'internal' | 'airflow' | 'thermal';
export type SceneHighlightMode = 'none' | 'highlight' | 'isolate';

export interface SceneComponentDescriptor {
  readonly id: string;
  readonly name: string;
  readonly parentId?: string;
  readonly role: string;
  readonly kinematicNote?: string;
  readonly isSubRegion?: boolean;
}

export interface SceneTimelineEvent {
  readonly progress: number;
  readonly phaseLabel: string;
  readonly componentId: string;
  readonly cameraAction: 'overview' | 'focus-component';
  readonly highlightAction: 'none' | 'highlight' | 'isolate';
  readonly toolMode?: 'gripper' | 'cutter';
}

export interface SceneSequenceDescriptor {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly isConceptualNotice?: string;
  readonly toolMode?: 'gripper' | 'cutter';
  readonly durationSeconds: number;
  readonly events: readonly SceneTimelineEvent[];
}

export interface ShowcaseSceneDescriptor {
  readonly sceneId: ShowcaseSceneId;
  readonly title: string;
  readonly shortLabel: string;
  readonly categoryLabel: string;
  readonly simulationTruthLabel: string;
  readonly description: string;
  readonly hierarchy: readonly SceneComponentDescriptor[];
  readonly kinematicRelationships: readonly string[];
  readonly sequences: readonly SceneSequenceDescriptor[];
  readonly defaultViewMode: SceneViewMode;
  readonly supportedViewModes: readonly SceneViewMode[];
}

export interface SceneControllerState {
  readonly sceneId: ShowcaseSceneId;
  readonly activeComponentId: string | null;
  readonly highlightedComponentId: string | null;
  readonly highlightMode: SceneHighlightMode;
  readonly cameraTarget: string | 'overview';
  readonly focusNonce: number;
  readonly activeSequenceId: string | null;
  readonly isPlaying: boolean;
  readonly sequenceProgress: number;
  readonly playbackSpeed: number;
  readonly viewMode: SceneViewMode;
  readonly isExploded: boolean;
  readonly showLabels: boolean;
  readonly crankAngleDeg: number;
  readonly focusedCylinder: number | null;
  readonly sixStrokeVariant: SixStrokeVariantId;
  readonly throttlePercent: number;
  readonly baseTurnDeg: number;
  readonly activeTool: 'gripper' | 'cutter';
  readonly pausedByVoice: boolean;
}

export const SHOWCASE_SCENE_DESCRIPTORS: Readonly<
  Record<ShowcaseSceneId, ShowcaseSceneDescriptor>
> = {
  turbofan: {
    sceneId: 'turbofan',
    title: 'High-Bypass Turbofan Engine',
    shortLabel: 'Jet Engine',
    categoryLabel: 'Aerospace Propulsion',
    simulationTruthLabel: 'Simplified educational Brayton-cycle visualization',
    description:
      'Eight-station high-bypass turbofan demonstrating intake capture, bypass fan thrust, multi-stage axial compression, combustion energy addition, turbine shaft drive, and nozzle acceleration.',
    defaultViewMode: 'cutaway',
    supportedViewModes: ['full', 'cutaway', 'airflow', 'thermal'],
    kinematicRelationships: [
      'Turbine extracts energy from hot core exhaust to spin the coaxial main shaft driving the Fan and Compressors',
      'Bypass duct channels ~80% of cold intake air pushed by the Fan around the hot core for high propulsive efficiency',
      'Sequential station progression: Intake -> Fan -> LP/HP Compressor -> Combustion Chamber -> Turbine -> Exhaust Nozzle',
    ],
    hierarchy: [
      { id: 'intake', name: 'Air Intake', role: 'Captures and decelerates ambient air smoothly toward the fan face.' },
      { id: 'fan', name: 'Bypass Fan', role: 'Accelerates a large cold air mass; produces majority of high-bypass thrust.' },
      { id: 'lp-compressor', name: 'LP Compressor', parentId: 'fan', role: 'Pre-compresses core air entering the inner engine duct.' },
      { id: 'hp-compressor', name: 'HP Compressor', parentId: 'lp-compressor', role: 'Raises core pressure and temperature prior to fuel injection.' },
      { id: 'combustor', name: 'Combustion Chamber', role: 'Mixes fuel with compressed air for continuous constant-pressure heat addition.' },
      { id: 'turbine', name: 'Turbine Stages', role: 'Expands hot gas to spin the coaxial drive shafts powering fan and compressors.' },
      { id: 'nozzle', name: 'Exhaust Nozzle', role: 'Accelerates core exhaust rearward to generate net reactive thrust.' },
      { id: 'bypass-duct', name: 'Bypass Duct', role: 'Channels cold fan air smoothly around the core casing to the exit.' },
    ],
    sequences: [
      {
        id: 'propulsion-tour',
        label: 'Sequential Propulsion Walkthrough',
        description: 'Follows air smoothly through Intake -> Fan -> Compressors -> Combustor -> Turbine -> Nozzle.',
        durationSeconds: 18,
        events: [
          { progress: 0.0, phaseLabel: '1. Air Intake', componentId: 'intake', cameraAction: 'focus-component', highlightAction: 'highlight' },
          { progress: 0.16, phaseLabel: '2. Bypass Fan', componentId: 'fan', cameraAction: 'focus-component', highlightAction: 'highlight' },
          { progress: 0.34, phaseLabel: '3. Axial Compressors', componentId: 'hp-compressor', cameraAction: 'focus-component', highlightAction: 'highlight' },
          { progress: 0.54, phaseLabel: '4. Combustion Chamber', componentId: 'combustor', cameraAction: 'focus-component', highlightAction: 'highlight' },
          { progress: 0.72, phaseLabel: '5. Turbine Drive', componentId: 'turbine', cameraAction: 'focus-component', highlightAction: 'highlight' },
          { progress: 0.88, phaseLabel: '6. Exhaust Nozzle Thrust', componentId: 'nozzle', cameraAction: 'focus-component', highlightAction: 'highlight' },
        ],
      },
    ],
  },

  'inline-six': {
    sceneId: 'inline-six',
    title: 'Inline-Six Car Engine',
    shortLabel: 'Inline-6 Engine',
    categoryLabel: 'Automotive Four-Stroke Kinematics',
    simulationTruthLabel: 'Educational crank-slider kinematic model · Firing order 1-5-3-6-2-4 (configured for this engine)',
    description:
      'Interactive inline-six four-stroke engine with transparent cutaway cylinder block, six pistons and connecting rods, six-throw counterweighted crankshaft, half-speed overhead camshaft, intake/exhaust manifolds, and 720-degree cycle control.',
    defaultViewMode: 'cutaway',
    supportedViewModes: ['full', 'cutaway', 'internal'],
    kinematicRelationships: [
      'Crankshaft completes two full revolutions (720 degrees) per complete four-stroke cycle',
      'Overhead camshaft rotates at exactly half crankshaft speed (0.5x) via timing drive',
      '1-5-3-6-2-4 firing sequence (for this specific inline-6 configuration) delivers one power stroke every 120 crank degrees',
      'Paired mirror crank throws (1-6, 2-5, 3-4) at 120-degree planes balance primary and secondary reciprocating forces',
    ],
    hierarchy: [
      { id: 'cylinder-block', name: 'Engine Block & Cutaway Housing', role: 'Structural crankcase and water-jacketed six-cylinder casting with cutaway window.' },
      { id: 'cylinder-1', name: 'Cylinder 1 (Piston, Rod & Valves)', parentId: 'cylinder-block', role: 'Front cylinder firing at 0 deg reference in the 1-5-3-6-2-4 configuration.' },
      { id: 'cylinder-2', name: 'Cylinder 2 (Piston, Rod & Valves)', parentId: 'cylinder-block', role: 'Second inline cylinder firing at 480 deg in the 1-5-3-6-2-4 sequence.' },
      { id: 'cylinder-3', name: 'Cylinder 3 (Piston, Rod & Valves)', parentId: 'cylinder-block', role: 'Third inline cylinder firing at 240 deg in the 1-5-3-6-2-4 sequence.' },
      { id: 'cylinder-4', name: 'Cylinder 4 (Piston, Rod & Valves)', parentId: 'cylinder-block', role: 'Fourth inline cylinder firing at 600 deg in the 1-5-3-6-2-4 sequence.' },
      { id: 'cylinder-5', name: 'Cylinder 5 (Piston, Rod & Valves)', parentId: 'cylinder-block', role: 'Fifth inline cylinder firing at 120 deg in the 1-5-3-6-2-4 sequence.' },
      { id: 'cylinder-6', name: 'Cylinder 6 (Piston, Rod & Valves)', parentId: 'cylinder-block', role: 'Rear inline cylinder firing at 360 deg in the 1-5-3-6-2-4 sequence.' },
      { id: 'crankshaft', name: 'Six-Throw Crankshaft & Crankpins', role: 'Converts linear piston forces via connecting rods into continuous flywheel torque.' },
      { id: 'camshaft', name: 'Overhead Camshaft & Valve Train', role: 'Driven at half crankshaft speed (0.5x) to actuate intake and exhaust valves on time.' },
      { id: 'intake-manifold', name: 'Intake Manifold & Runners', role: 'Distributes fresh air-fuel charge into each cylinder head intake port.' },
      { id: 'exhaust-manifold', name: 'Exhaust Manifold Headers', role: 'Collects high-temperature burned exhaust gases from each cylinder exhaust port.' },
    ],
    sequences: [
      {
        id: 'four-stroke-cycle',
        label: '720° Four-Stroke Cycle',
        description: 'Sweeps through 0°–720° crank angle showing Intake, Compression, Power, and Exhaust across all six cylinders.',
        durationSeconds: 16,
        events: [
          { progress: 0.0, phaseLabel: 'Cylinder 1 Power Ignition (0°)', componentId: 'cylinder-1', cameraAction: 'focus-component', highlightAction: 'highlight' },
          { progress: 0.17, phaseLabel: 'Cylinder 5 Power Stroke (120°)', componentId: 'cylinder-5', cameraAction: 'focus-component', highlightAction: 'highlight' },
          { progress: 0.34, phaseLabel: 'Cylinder 3 Power Stroke (240°)', componentId: 'cylinder-3', cameraAction: 'focus-component', highlightAction: 'highlight' },
          { progress: 0.5, phaseLabel: 'Cylinder 6 & Half-Speed Cam (360°)', componentId: 'camshaft', cameraAction: 'focus-component', highlightAction: 'highlight' },
          { progress: 0.67, phaseLabel: 'Cylinder 2 Power Stroke (480°)', componentId: 'cylinder-2', cameraAction: 'focus-component', highlightAction: 'highlight' },
          { progress: 0.84, phaseLabel: 'Cylinder 4 Power Stroke (600°)', componentId: 'cylinder-4', cameraAction: 'focus-component', highlightAction: 'highlight' },
        ],
      },
      {
        id: 'crank-cam-sync',
        label: 'Crankshaft & Camshaft Timing',
        description: 'Focuses on crankpin rotation driving piston stroke and 0.5x camshaft valve timing.',
        durationSeconds: 12,
        events: [
          { progress: 0.0, phaseLabel: 'Six-Throw Crankshaft', componentId: 'crankshaft', cameraAction: 'focus-component', highlightAction: 'highlight' },
          { progress: 0.35, phaseLabel: 'Half-Speed Camshaft & Valves', componentId: 'camshaft', cameraAction: 'focus-component', highlightAction: 'highlight' },
          { progress: 0.7, phaseLabel: 'Intake & Exhaust Breathing', componentId: 'intake-manifold', cameraAction: 'focus-component', highlightAction: 'highlight' },
        ],
      },
    ],
  },

  'six-stroke': {
    sceneId: 'six-stroke',
    title: 'Single-Cylinder Engine Cutaway (Six-Stroke Ref)',
    shortLabel: 'Six-Stroke Cutaway',
    categoryLabel: 'Reciprocating Thermodynamics & Linkage',
    simulationTruthLabel:
      'Conceptual educational cutaway · Defaults to crank-slider mechanical baseline unless a six-stroke variant is selected',
    description:
      'Detailed single-cylinder cutaway showing piston, compression rings, wrist pin, H-beam connecting rod, counterweighted crankshaft, overhead camshaft with helical valve springs, and selectable conceptual six-stroke cycles.',
    defaultViewMode: 'cutaway',
    supportedViewModes: ['full', 'cutaway', 'internal'],
    kinematicRelationships: [
      'Exact planar slider-crank geometry keeps piston wrist pin locked to connecting rod and crankpin radius',
      'Without an identified patent variant, the baseline displays verified 720-degree 4-stroke crank-slider mechanics',
      'Crower-style variant (1080° / 3 crank turns) illustrates conceptual water mist injection on Stroke 5 and steam exhaust on Stroke 6',
      'Secondary-scavenging variant (1080°) illustrates dual-event scavenging strokes without water injection',
    ],
    hierarchy: [
      { id: 'cylinder-block', name: 'Cutaway Cylinder Block & Fins', role: 'Honed cylinder bore liner with cooling fins and cutaway window revealing internal motion.' },
      { id: 'cylinder-head', name: 'Cylinder Head & Spark Plug', role: 'Houses combustion dome, ignition spark plug electrode, and valve seats.' },
      { id: 'piston', name: 'Lathe Piston, Rings & Wrist Pin', role: 'Reciprocates vertically inside the bore, sealing gas pressure with three piston rings.' },
      { id: 'connecting-rod', name: 'H-Beam Connecting Rod', role: 'Links linear piston wrist-pin travel to circular crankpin rotation.' },
      { id: 'crankshaft', name: 'Crankshaft & Toothed Flywheel', role: 'Counterweighted crank throw converting piston force into smooth rotary torque.' },
      { id: 'valves-camtrain', name: 'Valves, Cam Lobes & Helical Springs', role: 'Synchronized overhead cam lobes depressing intake and exhaust poppet valves against coil springs.' },
      { id: 'intake-exhaust', name: 'Intake & Exhaust Port Passages', role: 'Curved manifolds guiding fresh charge in and burned combustion/steam gases out.' },
      { id: 'water-injector', name: 'Conceptual Water Injector (Crower Variant)', role: 'Active ONLY when the Crower Water-Steam six-stroke reference variant is selected.' },
    ],
    sequences: [
      {
        id: 'crank-slider-cycle',
        label: 'Stroke-by-Stroke Cycle Walkthrough',
        description: 'Walks sequentially through Piston -> Connecting Rod -> Crankshaft -> Valves & Cycle Phases.',
        durationSeconds: 16,
        events: [
          { progress: 0.0, phaseLabel: '1. Intake Charge & Valve Lift', componentId: 'valves-camtrain', cameraAction: 'focus-component', highlightAction: 'highlight' },
          { progress: 0.22, phaseLabel: '2. Piston Compression Upstroke', componentId: 'piston', cameraAction: 'focus-component', highlightAction: 'highlight' },
          { progress: 0.44, phaseLabel: '3. Combustion Ignition & Force', componentId: 'cylinder-head', cameraAction: 'focus-component', highlightAction: 'highlight' },
          { progress: 0.66, phaseLabel: '4. Connecting Rod Torque Transfer', componentId: 'connecting-rod', cameraAction: 'focus-component', highlightAction: 'highlight' },
          { progress: 0.84, phaseLabel: '5. Crankshaft & Flywheel Inertia', componentId: 'crankshaft', cameraAction: 'focus-component', highlightAction: 'highlight' },
        ],
      },
    ],
  },

  'cordless-drill': {
    sceneId: 'cordless-drill',
    title: 'Cordless Drill & Planetary Drivetrain',
    shortLabel: 'Cordless Drill',
    categoryLabel: 'Electromechanical Power Tool',
    simulationTruthLabel: 'Verified exterior GLB + conceptual internal planetary drivetrain demonstration',
    description:
      'Complete cordless drill exterior paired with a cutaway internal drivetrain illustrating Trigger -> Electric Motor -> Planetary Reduction Gearbox -> Output Shaft -> Keyless Chuck with mathematically consistent gear ratios.',
    defaultViewMode: 'internal',
    supportedViewModes: ['full', 'cutaway', 'internal'],
    kinematicRelationships: [
      'Trigger modulates PWM power from the battery pack to the DC motor armature',
      'High-speed, low-torque motor sun gear drives planetary gears inside a fixed ring gear',
      'Planetary carrier steps speed down (~4:1 educational ratio) and multiplies torque on the output shaft',
      'Output spindle locks directly to the keyless three-jaw chuck at the reduced output speed',
    ],
    hierarchy: [
      { id: 'housing', name: 'Ergonomic Housing & Cutaway Shell', role: 'Clamshell casing supporting motor bearings, gearbox ring, and grip.' },
      { id: 'trigger', name: 'Variable-Speed Trigger Switch', parentId: 'housing', role: 'Modulates electrical current delivered from battery to motor.' },
      { id: 'battery', name: 'Lithium-Ion Battery Pack', parentId: 'housing', role: 'Stores DC electrical energy at the tool base.' },
      { id: 'motor', name: 'DC Electric Motor & Sun Pinion', parentId: 'housing', role: 'Converts DC electrical power into high-RPM rotor spin driving the sun gear.' },
      { id: 'gearbox', name: 'Planetary Reduction Gearbox', parentId: 'motor', role: 'Reduces motor RPM while multiplying torque through sun, planet, and ring gears.' },
      { id: 'output-shaft', name: 'Hardened Output Spindle Shaft', parentId: 'gearbox', role: 'Transmits reduced-speed, high-torque rotation out of the planetary carrier.' },
      { id: 'chuck', name: 'Keyless Three-Jaw Chuck', parentId: 'output-shaft', role: 'Clamps drill bits coaxially and rotates locked to the output shaft speed.' },
    ],
    sequences: [
      {
        id: 'powertrain-chain',
        label: 'Trigger to Chuck Drivetrain',
        description: 'Traces energy conversion along Trigger -> Motor -> Planetary Gearbox -> Output Shaft -> Chuck.',
        durationSeconds: 14,
        events: [
          { progress: 0.0, phaseLabel: '1. Variable Trigger Switch', componentId: 'trigger', cameraAction: 'focus-component', highlightAction: 'highlight' },
          { progress: 0.2, phaseLabel: '2. High-RPM Motor Rotor', componentId: 'motor', cameraAction: 'focus-component', highlightAction: 'highlight' },
          { progress: 0.45, phaseLabel: '3. Planetary Gearbox Reduction', componentId: 'gearbox', cameraAction: 'focus-component', highlightAction: 'highlight' },
          { progress: 0.7, phaseLabel: '4. Output Spindle Shaft', componentId: 'output-shaft', cameraAction: 'focus-component', highlightAction: 'highlight' },
          { progress: 0.85, phaseLabel: '5. Coaxial Chuck Torque', componentId: 'chuck', cameraAction: 'focus-component', highlightAction: 'highlight' },
        ],
      },
    ],
  },

  'ship-propulsion': {
    sceneId: 'ship-propulsion',
    title: 'Container Ship & Marine Propulsion',
    shortLabel: 'Ship Propulsion',
    categoryLabel: 'Marine Naval Architecture',
    simulationTruthLabel: 'Verified exterior ship GLB + conceptual engine-room & shaftline overlay',
    description:
      'Complete ocean container vessel demonstrating propulsion flow from the conceptual marine engine room through flexible shaft coupling, stern propeller shaft, rotating aft propeller, and hydrodynamic water thrust.',
    defaultViewMode: 'cutaway',
    supportedViewModes: ['full', 'cutaway', 'internal'],
    kinematicRelationships: [
      'Marine diesel prime mover generates shaft torque in the aft machinery space',
      'Flexible coupling absorbs alignment vibration and links engine crankshaft to stern shaft',
      'Long steel propeller shaft runs aft through hull bearings and stern tube seal',
      'Propeller blades accelerate seawater astern, producing forward hull thrust via reaction',
    ],
    hierarchy: [
      { id: 'hull', name: 'Ship Hull & Container Deck', role: 'Streamlined displacement hull and cargo structure.' },
      { id: 'superstructure', name: 'Bridge & Superstructure', parentId: 'hull', role: 'Navigation bridge perched above the aft machinery space.' },
      { id: 'engine', name: 'Marine Propulsion Engine (Conceptual)', parentId: 'hull', role: 'Heavy diesel prime mover inside the aft engine room generating rotational torque.' },
      { id: 'coupling', name: 'Shaft Coupling & Thrust Block (Conceptual)', parentId: 'engine', role: 'Transmits torque to the shaft while absorbing forward propeller thrust against the hull.' },
      { id: 'propeller-shaft', name: 'Stern Propeller Shaft (Conceptual)', parentId: 'coupling', role: 'Transfers torque cleanly aft through the stern tube bearing to the propeller hub.' },
      { id: 'propeller', name: 'Aft Marine Propeller', parentId: 'propeller-shaft', role: 'Hydrofoil blades converting shaft torque into axial seawater acceleration.' },
      { id: 'rudder', name: 'Steering Rudder', parentId: 'hull', role: 'Deflects propeller slipstream laterally to steer the vessel.' },
      { id: 'water-thrust', name: 'Propeller Slipstream & Water Thrust', parentId: 'propeller', role: 'Rearward-accelerated seawater wake producing forward reactive thrust.' },
    ],
    sequences: [
      {
        id: 'marine-propulsion',
        label: 'Engine to Water Thrust Chain',
        description: 'Follows propulsion energy along Engine -> Coupling -> Propeller Shaft -> Propeller -> Water Thrust.',
        durationSeconds: 16,
        events: [
          { progress: 0.0, phaseLabel: '1. Complete Vessel Overview', componentId: 'hull', cameraAction: 'overview', highlightAction: 'none' },
          { progress: 0.18, phaseLabel: '2. Conceptual Marine Engine', componentId: 'engine', cameraAction: 'focus-component', highlightAction: 'highlight' },
          { progress: 0.36, phaseLabel: '3. Shaft Coupling & Thrust Bearing', componentId: 'coupling', cameraAction: 'focus-component', highlightAction: 'highlight' },
          { progress: 0.54, phaseLabel: '4. Stern Propeller Shaft', componentId: 'propeller-shaft', cameraAction: 'focus-component', highlightAction: 'highlight' },
          { progress: 0.72, phaseLabel: '5. Rotating Aft Propeller', componentId: 'propeller', cameraAction: 'focus-component', highlightAction: 'highlight' },
          { progress: 0.88, phaseLabel: '6. Rearward Water Thrust', componentId: 'water-thrust', cameraAction: 'focus-component', highlightAction: 'highlight' },
        ],
      },
    ],
  },

  'robotic-arm': {
    sceneId: 'robotic-arm',
    title: 'Industrial Robotic Arm & Apple',
    shortLabel: 'Robotic Arm',
    categoryLabel: 'Articulated Robotics & Tooling',
    simulationTruthLabel: 'Joint-limited educational kinematic simulation (Sequence B cutting is conceptual)',
    description:
      'Articulated robotic manipulator mounted on an engineering worktable with interchangeable parallel gripper and conceptual cutting blade tool, performing Pick-Turn-90°-Place and separate Conceptual Apple Cutting demonstrations.',
    defaultViewMode: 'full',
    supportedViewModes: ['full', 'internal'],
    kinematicRelationships: [
      'Connected hierarchical joints: Base Yaw -> Shoulder Pitch -> Elbow Pitch -> Wrist Pitch -> Wrist Roll -> End-Effector',
      'Parallel gripper holds and transports the apple cleanly without table penetration during Sequence A',
      '90-degree base rotation visibly turns the grasped apple from pickup pad to drop pad',
      'Dedicated conceptual cutter attachment handles Sequence B apple splitting cleanly separated from the gripper',
    ],
    hierarchy: [
      { id: 'worktable', name: 'Engineering Worktable & Pads', role: 'Calibrated benchtop with pickup station and 90-degree target placement zone.' },
      { id: 'base', name: 'Rotary Base Pedestal (J1 Yaw)', parentId: 'worktable', role: 'Rotates the entire arm assembly horizontally around the vertical Y axis.' },
      { id: 'shoulder', name: 'Shoulder Joint & Servo (J2 Pitch)', parentId: 'base', role: 'Raises and extends the lower arm boom forward over the worktable.' },
      { id: 'upper-arm', name: 'Upper Arm Link', parentId: 'shoulder', role: 'Rigid structural arm segment connecting shoulder servo to elbow axis.' },
      { id: 'elbow', name: 'Elbow Joint Actuator (J3 Pitch)', parentId: 'upper-arm', role: 'Articulates forearm angle to control radial reach and end-effector height.' },
      { id: 'forearm', name: 'Forearm Tube & Harness', parentId: 'elbow', role: 'Reaches out to the wrist assembly with routed internal actuator cabling.' },
      { id: 'wrist', name: '2-Axis Wrist Assembly (J4/J5)', parentId: 'forearm', role: 'Maintains vertical tool orientation above the apple throughout arm motion.' },
      { id: 'gripper', name: 'Parallel Jaw Gripper (Sequence A)', parentId: 'wrist', role: 'Dual opposing fingers that close cleanly around the apple for pick-and-place.' },
      { id: 'cutter', name: 'Conceptual Cutting Blade Tool (Sequence B)', parentId: 'wrist', role: 'Separate conceptual blade head swapped onto the wrist exclusively for Sequence B.' },
      { id: 'apple', name: 'Target Apple (Whole / Splittable Halves)', role: 'Manipulated object resting on the pickup pad, attaching to gripper or splitting cleanly in Sequence B.' },
    ],
    sequences: [
      {
        id: 'sequence-a-pick-place',
        label: 'Sequence A · Pick, Turn 90° & Place',
        description: 'Reaches apple, closes parallel gripper, lifts, turns base 90°, lowers to target pad, opens jaws, and returns home.',
        toolMode: 'gripper',
        durationSeconds: 14,
        events: [
          { progress: 0.0, phaseLabel: '1. Home Ready Pose', componentId: 'base', cameraAction: 'overview', highlightAction: 'none', toolMode: 'gripper' },
          { progress: 0.14, phaseLabel: '2. Reach Toward Apple', componentId: 'shoulder', cameraAction: 'focus-component', highlightAction: 'highlight', toolMode: 'gripper' },
          { progress: 0.28, phaseLabel: '3. Align & Close Gripper', componentId: 'gripper', cameraAction: 'focus-component', highlightAction: 'highlight', toolMode: 'gripper' },
          { progress: 0.42, phaseLabel: '4. Lift Apple Clear of Table', componentId: 'elbow', cameraAction: 'overview', highlightAction: 'highlight', toolMode: 'gripper' },
          { progress: 0.58, phaseLabel: '5. Rotate Base 90°', componentId: 'base', cameraAction: 'overview', highlightAction: 'highlight', toolMode: 'gripper' },
          { progress: 0.72, phaseLabel: '6. Lower to Target Pad & Release', componentId: 'apple', cameraAction: 'focus-component', highlightAction: 'highlight', toolMode: 'gripper' },
          { progress: 0.88, phaseLabel: '7. Retract & Return Home', componentId: 'wrist', cameraAction: 'overview', highlightAction: 'none', toolMode: 'gripper' },
        ],
      },
      {
        id: 'sequence-b-cut',
        label: 'Sequence B · Conceptual Apple Cut',
        description: 'Switches to the dedicated cutter tool, descends cleanly through the apple crown, splits it into two halves, and retracts.',
        isConceptualNotice: 'Conceptual educational demonstration — illustrates tool-path sequencing and geometric split, not physical fracture mechanics.',
        toolMode: 'cutter',
        durationSeconds: 11,
        events: [
          { progress: 0.0, phaseLabel: '1. Equip Dedicated Cutter Tool', componentId: 'cutter', cameraAction: 'focus-component', highlightAction: 'highlight', toolMode: 'cutter' },
          { progress: 0.22, phaseLabel: '2. Position Above Apple Crown', componentId: 'wrist', cameraAction: 'focus-component', highlightAction: 'highlight', toolMode: 'cutter' },
          { progress: 0.46, phaseLabel: '3. Downward Conceptual Cut', componentId: 'cutter', cameraAction: 'focus-component', highlightAction: 'highlight', toolMode: 'cutter' },
          { progress: 0.68, phaseLabel: '4. Separate Two Apple Halves', componentId: 'apple', cameraAction: 'focus-component', highlightAction: 'highlight', toolMode: 'cutter' },
          { progress: 0.88, phaseLabel: '5. Retract Cutter Safely', componentId: 'shoulder', cameraAction: 'overview', highlightAction: 'none', toolMode: 'cutter' },
        ],
      },
    ],
  },
};

export const SHOWCASE_SCENE_LIST: readonly ShowcaseSceneDescriptor[] = [
  SHOWCASE_SCENE_DESCRIPTORS.turbofan,
  SHOWCASE_SCENE_DESCRIPTORS['inline-six'],
  SHOWCASE_SCENE_DESCRIPTORS['six-stroke'],
  SHOWCASE_SCENE_DESCRIPTORS['cordless-drill'],
  SHOWCASE_SCENE_DESCRIPTORS['ship-propulsion'],
  SHOWCASE_SCENE_DESCRIPTORS['robotic-arm'],
];

export function isValidShowcaseSceneId(raw: unknown): raw is ShowcaseSceneId {
  return typeof raw === 'string' && raw in SHOWCASE_SCENE_DESCRIPTORS;
}

export function getSceneDescriptor(sceneId: ShowcaseSceneId): ShowcaseSceneDescriptor {
  return SHOWCASE_SCENE_DESCRIPTORS[sceneId];
}

export function isValidComponentForScene(
  sceneId: ShowcaseSceneId,
  componentId: unknown,
): componentId is string {
  if (typeof componentId !== 'string' || !componentId.trim()) return false;
  const desc = SHOWCASE_SCENE_DESCRIPTORS[sceneId];
  return desc.hierarchy.some((c) => c.id === componentId);
}

export function resolveComponentForScene(
  sceneId: ShowcaseSceneId,
  candidateId: unknown,
): string | null {
  if (typeof candidateId !== 'string' || !candidateId.trim()) return null;
  const norm = candidateId.trim().toLowerCase();
  const desc = SHOWCASE_SCENE_DESCRIPTORS[sceneId];
  const exact = desc.hierarchy.find((c) => c.id.toLowerCase() === norm);
  if (exact) return exact.id;
  const byName = desc.hierarchy.find((c) => c.name.toLowerCase() === norm);
  if (byName) return byName.id;
  const partial = desc.hierarchy.find(
    (c) => c.id.toLowerCase().includes(norm) || c.name.toLowerCase().includes(norm),
  );
  return partial ? partial.id : null;
}

export function getActiveTimelineEvent(
  sceneId: ShowcaseSceneId,
  sequenceId: string | null,
  progress01: number,
): SceneTimelineEvent | null {
  if (!sequenceId) return null;
  const desc = SHOWCASE_SCENE_DESCRIPTORS[sceneId];
  const seq = desc.sequences.find((s) => s.id === sequenceId);
  if (!seq || seq.events.length === 0) return null;
  const clamped = Math.max(0, Math.min(1, progress01));
  let matched = seq.events[0];
  for (const evt of seq.events) {
    if (clamped >= evt.progress) {
      matched = evt;
    }
  }
  return matched;
}

export function createInitialSceneControllerState(
  sceneId: ShowcaseSceneId = 'turbofan',
): SceneControllerState {
  const desc = SHOWCASE_SCENE_DESCRIPTORS[sceneId];
  const defaultSequence = desc.sequences[0] ?? null;
  return {
    sceneId,
    activeComponentId: sceneId === 'turbofan' ? 'fan' : null,
    highlightedComponentId: null,
    highlightMode: 'none',
    cameraTarget: 'overview',
    focusNonce: 0,
    activeSequenceId: defaultSequence?.id ?? null,
    isPlaying: true,
    sequenceProgress: 0,
    playbackSpeed: APP_CONFIG.showcaseDefaults.defaultPlaybackSpeed,
    viewMode: desc.defaultViewMode,
    isExploded: false,
    showLabels: false,
    crankAngleDeg: 0,
    focusedCylinder: null,
    sixStrokeVariant: 'reference-mechanical',
    throttlePercent: APP_CONFIG.simulationDefaults.initialThrottlePercent,
    baseTurnDeg: APP_CONFIG.showcaseDefaults.robotDefaultBaseTurnDeg,
    activeTool: defaultSequence?.toolMode ?? 'gripper',
    pausedByVoice: false,
  };
}

export function clampPlaybackSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return APP_CONFIG.showcaseDefaults.defaultPlaybackSpeed;
  return Math.max(
    APP_CONFIG.showcaseDefaults.minPlaybackSpeed,
    Math.min(APP_CONFIG.showcaseDefaults.maxPlaybackSpeed, Number(speed.toFixed(2))),
  );
}

export function loadScene(
  prevState: SceneControllerState,
  sceneId: ShowcaseSceneId,
  options?: {
    componentId?: string | null;
    sequenceId?: string | null;
    viewMode?: SceneViewMode;
    isPlaying?: boolean;
    focusedCylinder?: number | null;
    sixStrokeVariant?: SixStrokeVariantId;
    baseTurnDeg?: number;
  },
): SceneControllerState {
  const desc = SHOWCASE_SCENE_DESCRIPTORS[sceneId];
  const base = createInitialSceneControllerState(sceneId);
  const validSeq =
    options?.sequenceId && desc.sequences.some((s) => s.id === options.sequenceId)
      ? desc.sequences.find((s) => s.id === options.sequenceId)!
      : desc.sequences[0] ?? null;

  const validComp = options?.componentId
    ? resolveComponentForScene(sceneId, options.componentId)
    : base.activeComponentId;

  const validViewMode =
    options?.viewMode && desc.supportedViewModes.includes(options.viewMode)
      ? options.viewMode
      : base.viewMode;

  const focusedCylinder =
    sceneId === 'inline-six' &&
    typeof options?.focusedCylinder === 'number' &&
    options.focusedCylinder >= 1 &&
    options.focusedCylinder <= 6
      ? Math.round(options.focusedCylinder)
      : validComp?.startsWith('cylinder-') && /^cylinder-[1-6]$/.test(validComp)
        ? Number(validComp.replace('cylinder-', ''))
        : null;

  const resolvedComp =
    focusedCylinder !== null ? `cylinder-${focusedCylinder}` : validComp;

  const baseTurnDeg =
    typeof options?.baseTurnDeg === 'number' && Number.isFinite(options.baseTurnDeg)
      ? Math.max(-180, Math.min(180, Math.round(options.baseTurnDeg)))
      : base.baseTurnDeg;

  const sixStrokeVariant: SixStrokeVariantId =
    options?.sixStrokeVariant && options.sixStrokeVariant in SIX_STROKE_VARIANTS
      ? options.sixStrokeVariant
      : base.sixStrokeVariant;

  return {
    ...base,
    focusNonce: prevState.focusNonce + 1,
    activeComponentId: resolvedComp,
    highlightedComponentId: resolvedComp,
    highlightMode: resolvedComp ? 'highlight' : 'none',
    cameraTarget: resolvedComp ?? 'overview',
    activeSequenceId: validSeq?.id ?? null,
    activeTool: validSeq?.toolMode ?? base.activeTool,
    viewMode: validViewMode,
    isPlaying: options?.isPlaying ?? base.isPlaying,
    focusedCylinder,
    sixStrokeVariant,
    baseTurnDeg,
  };
}

export function focusComponent(
  state: SceneControllerState,
  componentId: string | 'overview',
): SceneControllerState {
  if (componentId === 'overview') {
    return {
      ...state,
      cameraTarget: 'overview',
      highlightedComponentId: null,
      highlightMode: 'none',
      focusedCylinder: null,
      focusNonce: state.focusNonce + 1,
    };
  }

  const resolved = resolveComponentForScene(state.sceneId, componentId);
  if (!resolved) {
    return state;
  }

  const cylMatch = /^cylinder-([1-6])$/.exec(resolved);
  return {
    ...state,
    activeComponentId: resolved,
    highlightedComponentId: resolved,
    highlightMode: state.highlightMode === 'isolate' ? 'isolate' : 'highlight',
    cameraTarget: resolved,
    focusedCylinder: cylMatch ? Number(cylMatch[1]) : null,
    focusNonce: state.focusNonce + 1,
  };
}

export function highlightComponent(
  state: SceneControllerState,
  componentId: string | null,
  mode: SceneHighlightMode = 'highlight',
): SceneControllerState {
  if (!componentId || mode === 'none') {
    return {
      ...state,
      highlightedComponentId: null,
      highlightMode: 'none',
    };
  }
  const resolved = resolveComponentForScene(state.sceneId, componentId);
  if (!resolved) return state;
  return {
    ...state,
    activeComponentId: resolved,
    highlightedComponentId: resolved,
    highlightMode: mode,
  };
}

export function isolateComponent(
  state: SceneControllerState,
  componentId: string | null,
): SceneControllerState {
  if (!componentId) {
    return {
      ...state,
      highlightMode: state.highlightedComponentId ? 'highlight' : 'none',
    };
  }
  const resolved = resolveComponentForScene(state.sceneId, componentId);
  if (!resolved) return state;
  return {
    ...state,
    activeComponentId: resolved,
    highlightedComponentId: resolved,
    highlightMode: 'isolate',
    cameraTarget: resolved,
    focusNonce: state.focusNonce + 1,
  };
}

export function playSequence(
  state: SceneControllerState,
  sequenceId?: string | null,
): SceneControllerState {
  const desc = SHOWCASE_SCENE_DESCRIPTORS[state.sceneId];
  const targetSeq =
    (sequenceId && desc.sequences.find((s) => s.id === sequenceId)) ||
    desc.sequences.find((s) => s.id === state.activeSequenceId) ||
    desc.sequences[0] ||
    null;

  const isSwitching = Boolean(targetSeq && targetSeq.id !== state.activeSequenceId);
  return {
    ...state,
    activeSequenceId: targetSeq?.id ?? null,
    activeTool: targetSeq?.toolMode ?? state.activeTool,
    sequenceProgress: isSwitching ? 0 : state.sequenceProgress >= 0.995 ? 0 : state.sequenceProgress,
    isPlaying: true,
    pausedByVoice: false,
  };
}

export function pauseSequence(
  state: SceneControllerState,
  byVoice = false,
): SceneControllerState {
  return {
    ...state,
    isPlaying: false,
    pausedByVoice: byVoice ? true : state.pausedByVoice,
  };
}

export function resumeSequence(
  state: SceneControllerState,
  fromVoice = false,
): SceneControllerState {
  if (fromVoice && !state.pausedByVoice) {
    return state;
  }
  return {
    ...state,
    isPlaying: true,
    pausedByVoice: false,
  };
}

export function seekSequence(
  state: SceneControllerState,
  progress01: number,
): SceneControllerState {
  if (!Number.isFinite(progress01)) return state;
  const clamped = Math.max(0, Math.min(1, progress01));
  const maxDeg =
    state.sceneId === 'six-stroke'
      ? SIX_STROKE_VARIANTS[state.sixStrokeVariant].cycleDegrees
      : 720;
  return {
    ...state,
    sequenceProgress: clamped,
    crankAngleDeg:
      state.sceneId === 'inline-six' || state.sceneId === 'six-stroke'
        ? Math.round(clamped * maxDeg)
        : state.crankAngleDeg,
  };
}

export function setPlaybackSpeed(
  state: SceneControllerState,
  speed: number,
): SceneControllerState {
  return {
    ...state,
    playbackSpeed: clampPlaybackSpeed(speed),
  };
}

export function setSceneViewMode(
  state: SceneControllerState,
  viewMode: SceneViewMode,
): SceneControllerState {
  const desc = SHOWCASE_SCENE_DESCRIPTORS[state.sceneId];
  if (!desc.supportedViewModes.includes(viewMode)) {
    return state;
  }
  return {
    ...state,
    viewMode,
  };
}

export function setCrankAngle(
  state: SceneControllerState,
  angleDeg: number,
): SceneControllerState {
  if (!Number.isFinite(angleDeg)) return state;
  const maxDeg =
    state.sceneId === 'six-stroke'
      ? SIX_STROKE_VARIANTS[state.sixStrokeVariant].cycleDegrees
      : 720;
  const wrapped = ((angleDeg % maxDeg) + maxDeg) % maxDeg;
  return {
    ...state,
    crankAngleDeg: wrapped,
    sequenceProgress: wrapped / maxDeg,
  };
}

export function setSixStrokeVariant(
  state: SceneControllerState,
  variant: SixStrokeVariantId,
): SceneControllerState {
  if (!(variant in SIX_STROKE_VARIANTS)) return state;
  const maxDeg = SIX_STROKE_VARIANTS[variant].cycleDegrees;
  const wrapped = state.crankAngleDeg % maxDeg;
  return {
    ...state,
    sixStrokeVariant: variant,
    crankAngleDeg: wrapped,
    sequenceProgress: wrapped / maxDeg,
    focusNonce: state.focusNonce + 1,
  };
}

export function resetScene(state: SceneControllerState): SceneControllerState {
  const fresh = createInitialSceneControllerState(state.sceneId);
  return {
    ...fresh,
    focusNonce: state.focusNonce + 1,
  };
}

/**
 * Validates and applies a structured Gemini SceneActionPlan without executing arbitrary code.
 */
export function applyValidatedScenePlan(
  prevState: SceneControllerState,
  plan: SceneActionPlan,
): SceneControllerState {
  if (!isValidShowcaseSceneId(plan.sceneId)) {
    return prevState;
  }

  let next =
    plan.sceneId === prevState.sceneId
      ? prevState
      : loadScene(prevState, plan.sceneId, {
          sequenceId: plan.sequenceId,
          viewMode: plan.viewMode,
          focusedCylinder: plan.focusedCylinder,
          sixStrokeVariant: plan.sixStrokeVariant,
          baseTurnDeg: plan.baseTurnDeg,
        });

  if (plan.sixStrokeVariant && next.sceneId === 'six-stroke') {
    next = setSixStrokeVariant(next, plan.sixStrokeVariant);
  }

  if (plan.sequenceId) {
    const desc = SHOWCASE_SCENE_DESCRIPTORS[next.sceneId];
    const seq = desc.sequences.find((s) => s.id === plan.sequenceId);
    if (seq) {
      next = {
        ...next,
        activeSequenceId: seq.id,
        activeTool: seq.toolMode ?? next.activeTool,
        sequenceProgress:
          typeof plan.seekProgress === 'number'
            ? Math.max(0, Math.min(1, plan.seekProgress))
            : 0,
      };
    }
  } else if (typeof plan.seekProgress === 'number') {
    next = seekSequence(next, plan.seekProgress);
  }

  if (plan.viewMode) {
    next = setSceneViewMode(next, plan.viewMode);
  }

  if (typeof plan.crankAngleDeg === 'number') {
    next = setCrankAngle(next, plan.crankAngleDeg);
  }

  if (typeof plan.focusedCylinder === 'number' && next.sceneId === 'inline-six') {
    const cyl = Math.max(1, Math.min(6, Math.round(plan.focusedCylinder)));
    next = focusComponent(next, `cylinder-${cyl}`);
  } else if (plan.componentId) {
    next = focusComponent(next, plan.componentId);
  }

  if (plan.isolate && next.activeComponentId) {
    next = isolateComponent(next, next.activeComponentId);
  }

  if (typeof plan.baseTurnDeg === 'number' && Number.isFinite(plan.baseTurnDeg)) {
    next = {
      ...next,
      baseTurnDeg: Math.max(-180, Math.min(180, Math.round(plan.baseTurnDeg))),
    };
  }

  if (typeof plan.play === 'boolean') {
    next = plan.play ? resumeSequence(next) : pauseSequence(next);
  }

  return next;
}
