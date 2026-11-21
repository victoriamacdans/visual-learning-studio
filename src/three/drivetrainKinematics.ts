export interface PlanetaryGearRatioConfig {
  readonly sunTeeth: number;
  readonly planetTeeth: number;
  readonly ringTeeth: number;
}

export const DRILL_PLANETARY_CONFIG: PlanetaryGearRatioConfig = {
  sunTeeth: 12,
  planetTeeth: 12,
  ringTeeth: 36,
};

export interface PlanetaryGearAngles {
  readonly sunAngleRad: number;
  readonly carrierAndChuckAngleRad: number;
  readonly planetRelativeSpinRad: number;
  readonly reductionRatio: number;
}

/**
 * Computes mathematically consistent planetary gearbox kinematics (fixed outer ring gear):
 * - omega_carrier = omega_sun * Z_s / (Z_s + Z_r)
 * - omega_planet_rel = -omega_carrier * (Z_r / Z_p)
 * Ensures output shaft and chuck spin slower and in strict ratio to the DC motor sun gear.
 */
export function computePlanetaryGearAngles(
  elapsedSec: number,
  motorAngularSpeedRadPerSec: number,
  config: PlanetaryGearRatioConfig = DRILL_PLANETARY_CONFIG,
): PlanetaryGearAngles {
  const { sunTeeth, planetTeeth, ringTeeth } = config;
  const totalTeeth = sunTeeth + ringTeeth;
  const reductionRatio = sunTeeth / totalTeeth; // 12 / (12 + 36) = 0.25 (4:1 reduction)

  const sunAngleRad = elapsedSec * motorAngularSpeedRadPerSec;
  const carrierAndChuckAngleRad = sunAngleRad * reductionRatio;
  // Rolling without slip inside stationary ring gear (relative to rotating carrier)
  const planetRelativeSpinRad = -carrierAndChuckAngleRad * (ringTeeth / planetTeeth);

  return {
    sunAngleRad,
    carrierAndChuckAngleRad,
    planetRelativeSpinRad,
    reductionRatio,
  };
}

export interface ShipPropulsionSnapshot {
  readonly shaftAngleRad: number;
  readonly engineCrankRad: number;
  readonly pistonPhaseOffset: number;
  readonly slipstreamPhase: number;
}

/**
 * Evaluates synchronized direct-drive marine diesel crankshaft, coupling, propeller shaft,
 * propeller, and hydrodynamic slipstream wake phase.
 */
export function computeShipPropulsionState(
  elapsedSec: number,
  shaftSpeedRadPerSec = 4.6,
): ShipPropulsionSnapshot {
  const shaftAngleRad = elapsedSec * shaftSpeedRadPerSec;
  return {
    shaftAngleRad,
    engineCrankRad: shaftAngleRad,
    pistonPhaseOffset: Math.sin(shaftAngleRad),
    slipstreamPhase: (elapsedSec * 1.45) % 1,
  };
}
