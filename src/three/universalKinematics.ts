import type {
  Scene3DAnimationSpec,
  Scene3DAxis,
  Scene3DComponentSpec,
  Scene3DShapePart,
  Vec3Tuple,
} from '../types/tutor.ts';

export interface SliderCrankState {
  readonly crankPinOffset: readonly [number, number];
  readonly pistonTravel: number;
  readonly rodTiltAngle: number;
}

export interface EvaluatedAnimationTransform {
  readonly deltaPosition: Vec3Tuple;
  readonly deltaRotation: Vec3Tuple;
  readonly uniformScale: number;
}

export interface SceneBoundingFraming {
  readonly center: Vec3Tuple;
  readonly radius: number;
  readonly overviewCameraPos: Vec3Tuple;
  readonly overviewTarget: Vec3Tuple;
}

/**
 * Computes physically consistent planar slider-crank kinematics around crank angle theta (rad).
 * Crank pin orbits at radius r; piston translates along the slide axis; connecting rod spans
 * between crank pin and wrist pin with tilt arcsin((r * sin(theta)) / l).
 * Note: Reference displacement is zero-centered around mid-stroke (`rodLength`) so parts placed
 * relative to their nominal mid-stroke/TDC positions stay coupled smoothly.
 */
export function computeSliderCrankState(
  thetaRad: number,
  crankRadius: number,
  rodLength: number,
): SliderCrankState {
  const safeR = Math.max(0.05, crankRadius);
  const safeL = Math.max(safeR * 1.35, rodLength);

  const sinT = Math.sin(thetaRad);
  const cosT = Math.cos(thetaRad);

  const pinX = safeR * sinT;
  const pinY = safeR * cosT;

  const ratio = Math.max(-0.95, Math.min(0.95, pinX / safeL));
  const rodTiltAngle = Math.asin(ratio);
  const verticalProjection = Math.sqrt(Math.max(0.0001, safeL * safeL - pinX * pinX));

  // Center piston stroke relative to nominal rodLength so oscillation is symmetric around Y + r*cos(0) - ... -> centered at pinY + verticalProjection - safeL
  const pistonTravel = pinY + verticalProjection - safeL;

  return {
    crankPinOffset: [pinX, pinY],
    pistonTravel,
    rodTiltAngle,
  };
}

function axisVector(axis: Scene3DAxis, magnitude: number): Vec3Tuple {
  if (axis === 'x') return [magnitude, 0, 0];
  if (axis === 'z') return [0, 0, magnitude];
  return [0, magnitude, 0];
}

/**
 * Evaluates declarative animation state for a generated 3D component at time `elapsedSeconds`.
 * Pure deterministic function — executes zero dynamic/arbitrary code.
 */
export function evaluateComponentAnimation(
  animation: Scene3DAnimationSpec,
  elapsedSeconds: number,
  speedMultiplier = 1,
): EvaluatedAnimationTransform {
  const t = elapsedSeconds * speedMultiplier;
  const phase = t * animation.speed + animation.phaseOffset;

  switch (animation.type) {
    case 'spin': {
      return {
        deltaPosition: [0, 0, 0],
        deltaRotation: axisVector(animation.axis, phase),
        uniformScale: 1,
      };
    }

    case 'reciprocate': {
      const disp = Math.sin(phase) * animation.amplitude;
      return {
        deltaPosition: axisVector(animation.axis, disp),
        deltaRotation: [0, 0, 0],
        uniformScale: 1,
      };
    }

    case 'oscillate-rotation': {
      const ang = Math.sin(phase) * animation.amplitude;
      return {
        deltaPosition: [0, 0, 0],
        deltaRotation: axisVector(animation.axis, ang),
        uniformScale: 1,
      };
    }

    case 'pulse-scale': {
      const delta = Math.sin(phase) * Math.min(0.28, animation.amplitude * 0.25);
      return {
        deltaPosition: [0, 0, 0],
        deltaRotation: [0, 0, 0],
        uniformScale: Math.max(0.65, 1 + delta),
      };
    }

    case 'orbit': {
      const r = animation.orbitRadius ?? Math.max(0.25, animation.amplitude);
      const ox = Math.cos(phase) * r;
      const oy = Math.sin(phase) * r;
      if (animation.axis === 'x') {
        return {
          deltaPosition: [0, ox, oy],
          deltaRotation: [0, 0, 0],
          uniformScale: 1,
        };
      }
      if (animation.axis === 'y') {
        return {
          deltaPosition: [ox, 0, oy],
          deltaRotation: [0, 0, 0],
          uniformScale: 1,
        };
      }
      return {
        deltaPosition: [ox, oy, 0],
        deltaRotation: [0, 0, 0],
        uniformScale: 1,
      };
    }

    case 'crank-slider': {
      const r = animation.crankRadius ?? Math.max(0.2, animation.amplitude);
      const l = animation.rodLength ?? r * 2.6;
      const state = computeSliderCrankState(phase, r, l);
      const role = animation.linkageRole ?? 'piston';

      if (role === 'crank') {
        return {
          deltaPosition: [0, 0, 0],
          deltaRotation: [0, 0, -phase],
          uniformScale: 1,
        };
      }

      if (role === 'connecting-rod') {
        // Midpoint shifts along crank-pin + half-piston travel and rocks smoothly by rodTiltAngle
        const midX = state.crankPinOffset[0] * 0.5;
        const midY = (state.crankPinOffset[1] + state.pistonTravel) * 0.5;
        return {
          deltaPosition:
            animation.axis === 'x' ? [midY, midX, 0] : [midX, midY, 0],
          deltaRotation: [0, 0, state.rodTiltAngle],
          uniformScale: 1,
        };
      }

      // Default / piston: pure linear reciprocation coupled to slider-crank geometry
      return {
        deltaPosition:
          animation.axis === 'x'
            ? [state.pistonTravel, 0, 0]
            : animation.axis === 'z'
              ? [0, 0, state.pistonTravel]
              : [0, state.pistonTravel, 0],
        deltaRotation: [0, 0, 0],
        uniformScale: 1,
      };
    }

    case 'none':
    default:
      return {
        deltaPosition: [0, 0, 0],
        deltaRotation: [0, 0, 0],
        uniformScale: 1,
      };
  }
}

/**
 * Estimates a generous local bounding radius for a single shape part so camera framing
 * never clips tall, wide, or helical generated components.
 */
export function estimateShapePartRadius(part: Scene3DShapePart): number {
  const ox = Math.abs(part.offset[0]);
  const oy = Math.abs(part.offset[1]);
  const oz = Math.abs(part.offset[2]);
  const offsetDist = Math.sqrt(ox * ox + oy * oy + oz * oz);

  let localRadius = 0.5;
  switch (part.primitive) {
    case 'box':
    case 'extruded-polygon': {
      const w = part.width ?? 0.6;
      const h = part.height ?? 0.6;
      const d = part.depth ?? 0.6;
      localRadius = 0.5 * Math.sqrt(w * w + h * h + d * d);
      break;
    }
    case 'cylinder':
    case 'cone':
    case 'capsule':
    case 'helix':
    case 'lathe': {
      const r = Math.max(part.radius ?? 0.35, part.radiusTop ?? 0, part.radiusBottom ?? 0);
      const h = part.height ?? 0.8;
      localRadius = Math.sqrt(r * r + (h * 0.5) * (h * 0.5));
      break;
    }
    case 'torus':
    case 'ring':
    case 'gear': {
      localRadius = (part.radius ?? 0.45) + (part.tubeRadius ?? 0.12);
      break;
    }
    case 'tube': {
      const pts = part.pathPoints ?? [];
      let maxPt = 0.5;
      for (const p of pts) {
        const d = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
        if (d > maxPt) maxPt = d;
      }
      localRadius = maxPt + (part.tubeRadius ?? 0.08);
      break;
    }
    case 'sphere':
    default:
      localRadius = part.radius ?? 0.45;
      break;
  }

  return offsetDist + localRadius;
}

/**
 * Resolves nominal world-space positions of each component by accumulating parent offsets.
 */
export function resolveWorldComponentCenters(
  components: readonly Scene3DComponentSpec[],
): Map<string, Vec3Tuple> {
  const byId = new Map(components.map((c) => [c.id, c]));
  const memo = new Map<string, Vec3Tuple>();

  const resolveOne = (id: string, depth = 0): Vec3Tuple => {
    const cached = memo.get(id);
    if (cached) return cached;
    const comp = byId.get(id);
    if (!comp || depth > 16) return [0, 0, 0];

    if (!comp.parentId || !byId.has(comp.parentId)) {
      memo.set(id, comp.position);
      return comp.position;
    }

    const parentPos = resolveOne(comp.parentId, depth + 1);
    const combined: Vec3Tuple = [
      parentPos[0] + comp.position[0],
      parentPos[1] + comp.position[1],
      parentPos[2] + comp.position[2],
    ];
    memo.set(id, combined);
    return combined;
  };

  for (const c of components) {
    resolveOne(c.id);
  }
  return memo;
}

/**
 * Computes exploded offset vector for a generated component. Uses custom `explodeVector` when
 * supplied, or radially separates components cleanly outward from the assembly center.
 */
export function computeDynamicExplodeOffset(
  component: Scene3DComponentSpec,
  assemblyCenter: Vec3Tuple,
  worldCenter: Vec3Tuple,
  explodeFactor: number,
  index = 0,
): Vec3Tuple {
  const factor = Math.max(0, Math.min(1, explodeFactor));
  if (factor === 0) {
    return [0, 0, 0];
  }

  if (component.explodeVector) {
    const [ex, ey, ez] = component.explodeVector;
    if (Math.abs(ex) + Math.abs(ey) + Math.abs(ez) > 0.02) {
      return [ex * factor, ey * factor, ez * factor];
    }
  }

  const dx = worldCenter[0] - assemblyCenter[0];
  const dy = worldCenter[1] - assemblyCenter[1];
  const dz = worldCenter[2] - assemblyCenter[2];
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (dist < 0.08) {
    // Deterministic radial fallback if component sits right at assembly center
    const angle = index * 2.39996;
    return [
      Math.cos(angle) * 0.9 * factor,
      0.45 * factor,
      Math.sin(angle) * 0.9 * factor,
    ];
  }

  const scale = 0.85 * factor;
  return [(dx / dist) * scale, (dy / dist) * scale, (dz / dist) * scale];
}

/**
 * Computes bounding center, radius, and optimal overview camera placement for any
 * generated 3D component list.
 */
export function computeSceneBoundingFraming(
  components: readonly Scene3DComponentSpec[],
  explodeFactor = 0,
): SceneBoundingFraming {
  if (components.length === 0) {
    return {
      center: [0, 0, 0],
      radius: 2.5,
      overviewCameraPos: [3.4, 2.5, 5.2],
      overviewTarget: [0, 0, 0],
    };
  }

  const worldCenters = resolveWorldComponentCenters(components);
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const comp of components) {
    const wc = worldCenters.get(comp.id) ?? comp.position;
    let r = 0.4;
    for (const part of comp.shapes) {
      r = Math.max(r, estimateShapePartRadius(part));
    }
    minX = Math.min(minX, wc[0] - r);
    minY = Math.min(minY, wc[1] - r);
    minZ = Math.min(minZ, wc[2] - r);
    maxX = Math.max(maxX, wc[0] + r);
    maxY = Math.max(maxY, wc[1] + r);
    maxZ = Math.max(maxZ, wc[2] + r);
  }

  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const cz = (minZ + maxZ) * 0.5;

  const halfX = (maxX - minX) * 0.5;
  const halfY = (maxY - minY) * 0.5;
  const halfZ = (maxZ - minZ) * 0.5;
  const radius = Math.max(1.1, Math.sqrt(halfX * halfX + halfY * halfY + halfZ * halfZ));

  const distance = radius * 2.15 + explodeFactor * 1.45;
  return {
    center: [cx, cy, cz],
    radius,
    overviewTarget: [cx, cy, cz],
    overviewCameraPos: [
      cx + distance * 0.48,
      cy + distance * 0.36,
      cz + distance * 0.88,
    ],
  };
}

/**
 * Computes camera position and target focused on an individual generated component.
 */
export function computeComponentFocusCamera(
  component: Scene3DComponentSpec,
  components: readonly Scene3DComponentSpec[],
  assemblyCenter: Vec3Tuple,
  explodeFactor = 0,
  componentIndex = 0,
): { readonly position: Vec3Tuple; readonly target: Vec3Tuple } {
  const worldCenters = resolveWorldComponentCenters(components);
  const wc = worldCenters.get(component.id) ?? component.position;
  const explode = computeDynamicExplodeOffset(
    component,
    assemblyCenter,
    wc,
    explodeFactor,
    componentIndex,
  );

  const tx = wc[0] + explode[0];
  const ty = wc[1] + explode[1];
  const tz = wc[2] + explode[2];

  let partRadius = 0.6;
  for (const part of component.shapes) {
    partRadius = Math.max(partRadius, estimateShapePartRadius(part));
  }

  const dist = Math.max(1.9, partRadius * 2.85);
  return {
    target: [tx, ty, tz],
    position: [tx + dist * 0.46, ty + dist * 0.38, tz + dist * 0.92],
  };
}
