import type { EngineComponentId } from '../types/tutor.ts';

export type Vector3Tuple = readonly [number, number, number];

export interface ComponentCameraPreset {
  readonly target: Vector3Tuple;
  readonly cameraOffset: Vector3Tuple;
  readonly explodeOffset: Vector3Tuple;
}

export interface EngineThermalStyle {
  readonly baseHex: string;
  readonly hotHex: string;
  readonly emissiveHex: string;
  readonly hotEmissiveIntensity: number;
}

export const OVERVIEW_CAMERA_PRESET: {
  readonly position: Vector3Tuple;
  readonly target: Vector3Tuple;
} = {
  position: [-1.45, 2.35, 7.65],
  target: [0.05, 0.0, 0.0],
};

export const ENGINE_COMPONENT_PRESETS: Readonly<
  Record<EngineComponentId, ComponentCameraPreset>
> = {
  intake: {
    target: [-3.15, 0.05, 0.0],
    cameraOffset: [-1.35, 1.25, 3.65],
    explodeOffset: [-1.55, 0.0, 0.0],
  },
  fan: {
    target: [-2.25, 0.0, 0.0],
    cameraOffset: [-1.65, 1.05, 3.45],
    explodeOffset: [-1.0, 0.0, 0.0],
  },
  'lp-compressor': {
    target: [-1.22, 0.04, 0.0],
    cameraOffset: [-0.35, 1.25, 2.95],
    explodeOffset: [-0.5, 0.0, 0.0],
  },
  'hp-compressor': {
    target: [-0.22, 0.04, 0.0],
    cameraOffset: [-0.2, 1.15, 2.65],
    explodeOffset: [-0.1, 0.0, 0.0],
  },
  combustor: {
    target: [0.88, 0.05, 0.0],
    cameraOffset: [0.35, 1.18, 2.75],
    explodeOffset: [0.38, 0.0, 0.0],
  },
  turbine: {
    target: [1.9, 0.04, 0.0],
    cameraOffset: [0.65, 1.18, 2.8],
    explodeOffset: [0.92, 0.0, 0.0],
  },
  nozzle: {
    target: [3.12, 0.02, 0.0],
    cameraOffset: [1.35, 1.1, 3.35],
    explodeOffset: [1.55, 0.0, 0.0],
  },
  'bypass-duct': {
    target: [-0.2, 0.35, 0.0],
    cameraOffset: [-0.45, 2.15, 5.45],
    explodeOffset: [0.0, 1.32, -0.52],
  },
};

export const ENGINE_THERMAL_STYLES: Readonly<
  Record<EngineComponentId, EngineThermalStyle>
> = {
  intake: {
    baseHex: '#334155',
    hotHex: '#0EA5E9',
    emissiveHex: '#0284C7',
    hotEmissiveIntensity: 0.14,
  },
  fan: {
    baseHex: '#94A3B8',
    hotHex: '#38BDF8',
    emissiveHex: '#0EA5E9',
    hotEmissiveIntensity: 0.12,
  },
  'lp-compressor': {
    baseHex: '#7C8BA1',
    hotHex: '#38BDF8',
    emissiveHex: '#0369A1',
    hotEmissiveIntensity: 0.18,
  },
  'hp-compressor': {
    baseHex: '#64748B',
    hotHex: '#F59E0B',
    emissiveHex: '#D97706',
    hotEmissiveIntensity: 0.28,
  },
  combustor: {
    baseHex: '#785A3C',
    hotHex: '#FB923C',
    emissiveHex: '#F97316',
    hotEmissiveIntensity: 0.95,
  },
  turbine: {
    baseHex: '#9CA3AF',
    hotHex: '#F97316',
    emissiveHex: '#EA580C',
    hotEmissiveIntensity: 0.68,
  },
  nozzle: {
    baseHex: '#475569',
    hotHex: '#EF4444',
    emissiveHex: '#DC2626',
    hotEmissiveIntensity: 0.44,
  },
  'bypass-duct': {
    baseHex: '#1E293B',
    hotHex: '#0284C7',
    emissiveHex: '#0369A1',
    hotEmissiveIntensity: 0.1,
  },
};

export interface SpoolSpeeds {
  readonly lpAngularVelocity: number;
  readonly hpAngularVelocity: number;
  readonly airflowSpeed: number;
  readonly heatFactor: number;
}

/**
 * Computes educational spool angular velocities (rad/s) and normalized heat factor
 * from throttle percentage [15..100].
 */
export function computeSpoolSpeeds(throttlePercent: number): SpoolSpeeds {
  const clamped = Math.max(15, Math.min(100, throttlePercent));
  const norm = (clamped - 15) / 85;
  return {
    lpAngularVelocity: 2.2 + norm * 7.8,
    hpAngularVelocity: (2.2 + norm * 7.8) * 1.62,
    airflowSpeed: 3.4 + norm * 7.5,
    heatFactor: 0.25 + Math.pow(norm, 1.15) * 0.75,
  };
}

/**
 * Computes world-space translation offset for a component given explodeAmount in [0..1].
 */
export function computeExplodedOffset(
  componentId: EngineComponentId,
  explodeAmount: number,
): Vector3Tuple {
  const factor = Math.max(0, Math.min(1, explodeAmount));
  if (factor === 0) {
    return [0, 0, 0];
  }
  const [ex, ey, ez] = ENGINE_COMPONENT_PRESETS[componentId].explodeOffset;
  return [ex * factor || 0, ey * factor || 0, ez * factor || 0];
}

/**
 * Returns camera position and look-at target for either overview or a focused 3D component,
 * smoothly accounting for the current exploded-view factor.
 */
export function getCameraPresetForStage(
  stageId: EngineComponentId | 'overview',
  explodeAmount: number,
): { readonly position: Vector3Tuple; readonly target: Vector3Tuple } {
  const factor = Math.max(0, Math.min(1, explodeAmount));

  if (stageId === 'overview') {
    const [ox, oy, oz] = OVERVIEW_CAMERA_PRESET.position;
    return {
      position: [ox, oy + factor * 0.45, oz + factor * 2.45],
      target: OVERVIEW_CAMERA_PRESET.target,
    };
  }

  const preset = ENGINE_COMPONENT_PRESETS[stageId];
  const [dx, dy, dz] = computeExplodedOffset(stageId, factor);
  const tx = preset.target[0] + dx;
  const ty = preset.target[1] + dy;
  const tz = preset.target[2] + dz;

  return {
    target: [tx, ty, tz],
    position: [
      tx + preset.cameraOffset[0],
      ty + preset.cameraOffset[1],
      tz + preset.cameraOffset[2] + factor * 0.45,
    ],
  };
}
