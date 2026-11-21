export type FourStrokePhase = 'intake' | 'compression' | 'power' | 'exhaust';

export interface InlineSixConfig {
  readonly cylinderCount: 6;
  readonly firingOrder: readonly [number, number, number, number, number, number];
  readonly cylinderSpacing: number;
  readonly crankCenterY: number;
  readonly crankRadius: number;
  readonly rodLength: number;
  readonly cylinderTopY: number;
  readonly camCenterY: number;
}

/**
 * Educational Inline-Six configuration using the 1-5-3-6-2-4 firing sequence.
 * Note: Firing order is configured specifically for this inline-six model and is
 * not assumed to be universal across all engine families.
 */
export const INLINE_SIX_CONFIG: InlineSixConfig = {
  cylinderCount: 6,
  firingOrder: [1, 5, 3, 6, 2, 4],
  cylinderSpacing: 0.78,
  crankCenterY: -0.78,
  crankRadius: 0.28,
  rodLength: 0.96,
  cylinderTopY: 0.86,
  camCenterY: 1.24,
};

export interface InlineSixCylinderState {
  readonly cylinderNumber: 1 | 2 | 3 | 4 | 5 | 6;
  readonly componentId: `cylinder-${1 | 2 | 3 | 4 | 5 | 6}`;
  readonly xPos: number;
  readonly firingOffsetDeg: number;
  readonly localCycleDeg: number;
  readonly crankThrowDeg: number;
  readonly strokePhase: FourStrokePhase;
  readonly crankPinY: number;
  readonly crankPinZ: number;
  readonly pistonPinY: number;
  readonly rodMidY: number;
  readonly rodMidZ: number;
  readonly rodAngleX: number;
  readonly intakeValveLift: number;
  readonly exhaustValveLift: number;
  readonly combustionIntensity: number;
}

export interface InlineSixEngineSnapshot {
  readonly crankAngleDeg: number;
  readonly camAngleDeg: number;
  readonly crankAngleRad: number;
  readonly camAngleRad: number;
  readonly firingOrderLabel: string;
  readonly cylinders: readonly InlineSixCylinderState[];
}

export function getCylinderXPosition(
  cylinderNumber: number,
  config: InlineSixConfig = INLINE_SIX_CONFIG,
): number {
  const halfSpan = ((config.cylinderCount - 1) * config.cylinderSpacing) / 2;
  return Number(((cylinderNumber - 1) * config.cylinderSpacing - halfSpan).toFixed(4));
}

export function getCylinderFiringOffsetDeg(
  cylinderNumber: number,
  firingOrder: readonly number[] = INLINE_SIX_CONFIG.firingOrder,
): number {
  const orderIdx = firingOrder.indexOf(cylinderNumber);
  const safeIdx = orderIdx >= 0 ? orderIdx : 0;
  return (safeIdx * 720) / firingOrder.length;
}

export function classifyFourStrokePhase(localCycleDeg: number): FourStrokePhase {
  const deg = ((localCycleDeg % 720) + 720) % 720;
  if (deg < 180) return 'power';
  if (deg < 360) return 'exhaust';
  if (deg < 540) return 'intake';
  return 'compression';
}

/**
 * Evaluates full inline-six crank-slider piston/conrod positions, half-speed camshaft angle,
 * valve lifts, and firing combustion glow at any crank angle [0..720].
 */
export function evaluateInlineSixKinematics(
  rawCrankAngleDeg: number,
  config: InlineSixConfig = INLINE_SIX_CONFIG,
): InlineSixEngineSnapshot {
  const crankAngleDeg = ((rawCrankAngleDeg % 720) + 720) % 720;
  const camAngleDeg = crankAngleDeg * 0.5;
  const crankAngleRad = (crankAngleDeg * Math.PI) / 180;
  const camAngleRad = (camAngleDeg * Math.PI) / 180;

  const cylinders: InlineSixCylinderState[] = [];

  for (let num = 1; num <= 6; num += 1) {
    const cylinderNumber = num as 1 | 2 | 3 | 4 | 5 | 6;
    const firingOffsetDeg = getCylinderFiringOffsetDeg(cylinderNumber, config.firingOrder);
    // Relative to this cylinder's Power TDC (0 deg = ignition TDC)
    const localCycleDeg = ((crankAngleDeg - firingOffsetDeg) % 720 + 720) % 720;
    const crankThrowDeg = (720 - firingOffsetDeg) % 360;
    const thetaRad = (localCycleDeg * Math.PI) / 180;

    const sinT = Math.sin(thetaRad);
    const cosT = Math.cos(thetaRad);
    const crankPinY = config.crankCenterY + config.crankRadius * cosT;
    const crankPinZ = config.crankRadius * sinT;

    const underRoot = Math.max(
      0.0001,
      config.rodLength * config.rodLength - crankPinZ * crankPinZ,
    );
    const pistonPinY = crankPinY + Math.sqrt(underRoot);

    const rodMidY = (pistonPinY + crankPinY) * 0.5;
    const rodMidZ = crankPinZ * 0.5;
    // Rotation around X so a +Y cylinder aligns from crankPin (Y, Z) to pistonPin (Y, 0)
    const rodAngleX = Math.atan2(-crankPinZ, pistonPinY - crankPinY);

    const strokePhase = classifyFourStrokePhase(localCycleDeg);

    // Valve lift profiles synchronized with 720-deg cycle
    const exhaustValveLift =
      localCycleDeg >= 175 && localCycleDeg <= 365
        ? Math.max(0, Math.sin(((localCycleDeg - 175) / 190) * Math.PI))
        : 0;
    const intakeValveLift =
      localCycleDeg >= 355 && localCycleDeg <= 545
        ? Math.max(0, Math.sin(((localCycleDeg - 355) / 190) * Math.PI))
        : 0;

    // Power stroke ignition flash near TDC (0-70 deg)
    const combustionIntensity =
      localCycleDeg >= 0 && localCycleDeg <= 72
        ? Math.max(0, 1 - localCycleDeg / 72)
        : 0;

    cylinders.push({
      cylinderNumber,
      componentId: `cylinder-${cylinderNumber}`,
      xPos: getCylinderXPosition(cylinderNumber, config),
      firingOffsetDeg,
      localCycleDeg,
      crankThrowDeg,
      strokePhase,
      crankPinY,
      crankPinZ,
      pistonPinY,
      rodMidY,
      rodMidZ,
      rodAngleX,
      intakeValveLift,
      exhaustValveLift,
      combustionIntensity,
    });
  }

  return {
    crankAngleDeg,
    camAngleDeg,
    crankAngleRad,
    camAngleRad,
    firingOrderLabel: config.firingOrder.join('-'),
    cylinders,
  };
}
