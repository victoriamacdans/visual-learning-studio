/**
 * Pure deterministic slider-crank & valve-train kinematics for the
 * Single-Cylinder Engine Cutaway (Six-Stroke Reference & Mechanical Baseline).
 *
 * Truthfulness rule:
 * Because generic text like "Six Stroke Engine" does not specify a patent
 * architecture, we default to `reference-mechanical` (clean crank-slider
 * baseline without assuming water/steam injection) and only render
 * six-stroke water/steam or secondary-scavenging effects when the student
 * explicitly selects one of those labeled reference variants.
 */

export type SixStrokeVariantId =
  | 'reference-mechanical'
  | 'crower-water-steam'
  | 'beare-secondary-piston';

export type SixStrokePhaseName =
  | 'intake'
  | 'compression'
  | 'power'
  | 'exhaust'
  | 'water-steam-power'
  | 'steam-exhaust'
  | 'secondary-scavenge'
  | 'secondary-exhaust';

export interface SixStrokeVariantMeta {
  readonly id: SixStrokeVariantId;
  readonly label: string;
  readonly shortLabel: string;
  readonly cycleDegrees: 720 | 1080;
  readonly hasWaterInjection: boolean;
  readonly truthfulnessNote: string;
}

export const SIX_STROKE_VARIANTS: Readonly<
  Record<SixStrokeVariantId, SixStrokeVariantMeta>
> = {
  'reference-mechanical': {
    id: 'reference-mechanical',
    label: 'Unidentified Variant · Crank-Slider Mechanical Baseline (720°)',
    shortLabel: 'Mechanical Baseline (4-Stroke Ref)',
    cycleDegrees: 720,
    hasWaterInjection: false,
    truthfulnessNote:
      'Title alone does not identify a six-stroke patent design; displaying verified slider-crank & 4-stroke valve kinematics without unverified water/steam injection.',
  },
  'crower-water-steam': {
    id: 'crower-water-steam',
    label: 'Crower-Style Water-Steam Reference Variant (1080°)',
    shortLabel: 'Crower Water-Steam (6-Stroke)',
    cycleDegrees: 1080,
    hasWaterInjection: true,
    truthfulnessNote:
      'Conceptual Crower-style six-stroke cycle (3 crank turns / 1080°): adds water mist injection (Stroke 5) and steam exhaust (Stroke 6) on top of simplified thermodynamics.',
  },
  'beare-secondary-piston': {
    id: 'beare-secondary-piston',
    label: 'Secondary Scavenging Reference Variant (1080° Conceptual)',
    shortLabel: 'Secondary Scavenge (6-Stroke)',
    cycleDegrees: 1080,
    hasWaterInjection: false,
    truthfulnessNote:
      'Conceptual six-stroke scavenging reference (3 crank turns / 1080°): demonstrates two additional gas-exchange strokes using dual-event valve timing without water injection.',
  },
};

export const SIX_STROKE_GEOMETRY = {
  crankCenterY: -0.95,
  crankRadius: 0.46,
  rodLength: 1.42,
  pistonRadius: 0.56,
  pistonHeight: 0.62,
  boreRadius: 0.60,
  deckY: 1.32,
  headTopY: 1.98,
} as const;

export interface SixStrokeKinematicState {
  readonly variant: SixStrokeVariantId;
  readonly cycleAngleDeg: number;
  readonly cycleDegrees: 720 | 1080;
  readonly strokeNumber: number;
  readonly totalStrokes: 4 | 6;
  readonly strokePhase: SixStrokePhaseName;
  readonly strokeLabel: string;
  readonly crankAngleRad: number;
  readonly camAngleRad: number;
  readonly crankPinOffset: readonly [number, number];
  readonly wristPinY: number;
  readonly rodMidpoint: readonly [number, number];
  readonly rodTiltRad: number;
  readonly intakeValveLift: number;
  readonly exhaustValveLift: number;
  readonly waterInjectorActive: number;
  readonly sparkIntensity: number;
  readonly combustionHeatIntensity: number;
  readonly steamExpansionIntensity: number;
  readonly pistonSpeedNorm: number;
}

function smoothPulse(angleDeg: number, startDeg: number, endDeg: number): number {
  if (angleDeg < startDeg || angleDeg > endDeg) return 0;
  const u = (angleDeg - startDeg) / Math.max(1, endDeg - startDeg);
  return Math.sin(u * Math.PI);
}

/**
 * Computes exact, gap-free slider-crank positions, connecting rod tilt,
 * valve lifts, and simplified phase indicators for the single-cylinder cutaway.
 */
export function evaluateSixStrokeKinematics(
  rawAngleDeg: number,
  variant: SixStrokeVariantId = 'reference-mechanical',
): SixStrokeKinematicState {
  const meta = SIX_STROKE_VARIANTS[variant];
  const cycleDegrees = meta.cycleDegrees;
  const wrapped = Number.isFinite(rawAngleDeg)
    ? ((rawAngleDeg % cycleDegrees) + cycleDegrees) % cycleDegrees
    : 0;

  // theta = 0 deg -> TDC (crankpin straight up at +Y)
  const theta = (wrapped * Math.PI) / 180;
  const R = SIX_STROKE_GEOMETRY.crankRadius;
  const L = SIX_STROKE_GEOMETRY.rodLength;
  const baseY = SIX_STROKE_GEOMETRY.crankCenterY;

  const pinX = R * Math.sin(theta);
  const pinY = baseY + R * Math.cos(theta);

  // Exact planar slider-crank constraint along vertical cylinder axis (x = 0):
  // pinX^2 + (wristPinY - pinY)^2 = L^2
  const dx = -pinX;
  const dy = Math.sqrt(Math.max(0.01, L * L - dx * dx));
  const wristPinY = pinY + dy;

  // Rod vector from crankpin -> wristPin tilts by atan2(dx, dy) around Z
  const rodTiltRad = Math.atan2(dx, dy);
  const rodMidX = pinX * 0.5;
  const rodMidY = (pinY + wristPinY) * 0.5;

  const strokeNumber = Math.min(
    cycleDegrees === 1080 ? 6 : 4,
    Math.floor(wrapped / 180) + 1,
  );

  // Camshaft rotates at 1 revolution per full cycle (1/2 crank in 720°, 1/3 crank in 1080°)
  const camRatio = cycleDegrees === 1080 ? 1 / 3 : 0.5;
  const camAngleRad = theta * camRatio;

  let strokePhase: SixStrokePhaseName = 'intake';
  let strokeLabel = 'Stroke 1 · Intake';
  let intakeValveLift = 0;
  let exhaustValveLift = 0;
  let sparkIntensity = 0;
  let combustionHeatIntensity = 0;
  let waterInjectorActive = 0;
  let steamExpansionIntensity = 0;

  if (strokeNumber === 1) {
    strokePhase = 'intake';
    strokeLabel = 'Stroke 1 · Intake (Air-Fuel Charge Drawn In)';
    intakeValveLift = smoothPulse(wrapped, 5, 175);
  } else if (strokeNumber === 2) {
    strokePhase = 'compression';
    strokeLabel = 'Stroke 2 · Compression (Piston Rises, Valves Sealed)';
    if (wrapped > 338) {
      sparkIntensity = Math.min(1, (wrapped - 338) / 22);
    }
  } else if (strokeNumber === 3) {
    strokePhase = 'power';
    strokeLabel = 'Stroke 3 · Combustion Power (Expanding Gas Drives Crank)';
    sparkIntensity = wrapped < 388 ? 1 - (wrapped - 360) / 28 : 0;
    combustionHeatIntensity = Math.max(0.12, 1 - (wrapped - 360) / 170);
  } else if (strokeNumber === 4) {
    strokePhase = 'exhaust';
    strokeLabel =
      variant === 'crower-water-steam'
        ? 'Stroke 4 · Exhaust (Cylinder Retains Thermal Energy)'
        : 'Stroke 4 · Exhaust (Burned Gas Expelled)';
    exhaustValveLift = smoothPulse(wrapped, 535, 715);
    combustionHeatIntensity = Math.max(0, 0.25 * (1 - (wrapped - 540) / 160));
  } else if (strokeNumber === 5) {
    if (variant === 'crower-water-steam') {
      strokePhase = 'water-steam-power';
      strokeLabel = 'Stroke 5 · Water Mist -> Steam Expansion Power (Conceptual)';
      waterInjectorActive = smoothPulse(wrapped, 712, 775);
      steamExpansionIntensity = smoothPulse(wrapped, 725, 900);
    } else {
      strokePhase = 'secondary-scavenge';
      strokeLabel = 'Stroke 5 · Secondary Scavenging Intake (Conceptual)';
      intakeValveLift = 0.72 * smoothPulse(wrapped, 725, 895);
    }
  } else {
    if (variant === 'crower-water-steam') {
      strokePhase = 'steam-exhaust';
      strokeLabel = 'Stroke 6 · Steam Exhaust Stroke (Conceptual)';
      exhaustValveLift = smoothPulse(wrapped, 895, 1075);
      steamExpansionIntensity = Math.max(0, 0.35 * (1 - (wrapped - 900) / 140));
    } else {
      strokePhase = 'secondary-exhaust';
      strokeLabel = 'Stroke 6 · Secondary Exhaust Purge (Conceptual)';
      exhaustValveLift = smoothPulse(wrapped, 895, 1075);
    }
  }

  return {
    variant,
    cycleAngleDeg: wrapped,
    cycleDegrees,
    strokeNumber,
    totalStrokes: cycleDegrees === 1080 ? 6 : 4,
    strokePhase,
    strokeLabel,
    crankAngleRad: theta,
    camAngleRad,
    crankPinOffset: [pinX, pinY - baseY],
    wristPinY,
    rodMidpoint: [rodMidX, rodMidY],
    rodTiltRad,
    intakeValveLift,
    exhaustValveLift,
    waterInjectorActive,
    sparkIntensity,
    combustionHeatIntensity,
    steamExpansionIntensity,
    pistonSpeedNorm: Math.abs(Math.sin(theta)),
  };
}
