import { APP_CONFIG } from '../config/appConfig.ts';
import type {
  GeneratedScene3DSpec,
  Scene3DAnimationSpec,
  Scene3DAnimationType,
  Scene3DAxis,
  Scene3DComponentSpec,
  Scene3DConnectionKind,
  Scene3DConnectionSpec,
  Scene3DMaterialSpec,
  Scene3DPrimitiveType,
  Scene3DShapePart,
  Vec2Tuple,
  Vec3Tuple,
} from '../types/tutor.ts';

const VALID_PRIMITIVES = new Set<Scene3DPrimitiveType>([
  'box',
  'cylinder',
  'cone',
  'sphere',
  'capsule',
  'torus',
  'ring',
  'extruded-polygon',
  'lathe',
  'tube',
  'helix',
  'gear',
]);

const VALID_ANIMATIONS = new Set<Scene3DAnimationType>([
  'none',
  'spin',
  'reciprocate',
  'crank-slider',
  'oscillate-rotation',
  'pulse-scale',
  'orbit',
]);

const VALID_AXES = new Set<Scene3DAxis>(['x', 'y', 'z']);

const VALID_CONNECTION_KINDS = new Set<Scene3DConnectionKind>([
  'mechanical',
  'electrical',
  'fluid',
  'thermal',
  'magnetic',
  'signal',
]);

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const SHORT_HEX_RE = /^#[0-9a-fA-F]{3}$/;

function clampNumber(val: unknown, min: number, max: number, fallback: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, val));
}

function sanitizeHexColor(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') {
    return fallback;
  }
  const trimmed = raw.trim();
  if (HEX_COLOR_RE.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  if (SHORT_HEX_RE.test(trimmed)) {
    const r = trimmed[1];
    const g = trimmed[2];
    const b = trimmed[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return fallback;
}

function sanitizeVec3(
  raw: unknown,
  minMag: number,
  maxMag: number,
  fallback: Vec3Tuple = [0, 0, 0],
): Vec3Tuple {
  if (Array.isArray(raw) && raw.length >= 3) {
    return [
      clampNumber(raw[0], minMag, maxMag, fallback[0]),
      clampNumber(raw[1], minMag, maxMag, fallback[1]),
      clampNumber(raw[2], minMag, maxMag, fallback[2]),
    ];
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    return [
      clampNumber(obj.x, minMag, maxMag, fallback[0]),
      clampNumber(obj.y, minMag, maxMag, fallback[1]),
      clampNumber(obj.z, minMag, maxMag, fallback[2]),
    ];
  }
  return fallback;
}

function sanitizeVec2List(
  raw: unknown,
  maxPoints: number,
  minVal: number,
  maxVal: number,
): Vec2Tuple[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const result: Vec2Tuple[] = [];
  for (const pt of raw.slice(0, maxPoints)) {
    if (Array.isArray(pt) && pt.length >= 2) {
      const x = clampNumber(pt[0], minVal, maxVal, 0);
      const y = clampNumber(pt[1], minVal, maxVal, 0);
      result.push([x, y]);
    } else if (pt && typeof pt === 'object') {
      const obj = pt as Record<string, unknown>;
      const x = clampNumber(obj.x, minVal, maxVal, 0);
      const y = clampNumber(obj.y, minVal, maxVal, 0);
      result.push([x, y]);
    }
  }
  return result;
}

function sanitizeVec3List(
  raw: unknown,
  maxPoints: number,
  minVal: number,
  maxVal: number,
): Vec3Tuple[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const result: Vec3Tuple[] = [];
  for (const pt of raw.slice(0, maxPoints)) {
    result.push(sanitizeVec3(pt, minVal, maxVal, [0, 0, 0]));
  }
  return result;
}

function sanitizeMaterial(raw: unknown): Scene3DMaterialSpec {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const opacity = clampNumber(obj.opacity, 0.1, 1, 1);
  const emissiveIntensity = clampNumber(obj.emissiveIntensity, 0, 2.5, 0);
  const emissive =
    emissiveIntensity > 0 ? sanitizeHexColor(obj.emissive, '#38BDF8') : undefined;

  return {
    color: sanitizeHexColor(obj.color, '#94A3B8'),
    metalness: clampNumber(obj.metalness, 0, 1, 0.45),
    roughness: clampNumber(obj.roughness, 0.05, 1, 0.42),
    opacity: opacity < 0.99 ? opacity : undefined,
    emissive,
    emissiveIntensity: emissive ? emissiveIntensity : undefined,
    wireframe: typeof obj.wireframe === 'boolean' ? obj.wireframe : false,
  };
}

function sanitizeShapePart(raw: unknown): Scene3DShapePart | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const limits = APP_CONFIG.scene3DLimits;

  const rawPrimitive =
    typeof obj.primitive === 'string' ? obj.primitive.trim().toLowerCase() : 'box';
  const primitive: Scene3DPrimitiveType = VALID_PRIMITIVES.has(
    rawPrimitive as Scene3DPrimitiveType,
  )
    ? (rawPrimitive as Scene3DPrimitiveType)
    : 'box';

  const offset = sanitizeVec3(obj.offset, -limits.maxCoordinateMagnitude, limits.maxCoordinateMagnitude);
  const rotation = sanitizeVec3(obj.rotation, -Math.PI * 2, Math.PI * 2);
  const material = sanitizeMaterial(obj.material);

  const width = clampNumber(obj.width, limits.minDimension, limits.maxDimension, 0.6);
  const height = clampNumber(obj.height, limits.minDimension, limits.maxDimension, 0.6);
  const depth = clampNumber(obj.depth, limits.minDimension, limits.maxDimension, 0.6);
  const radius = clampNumber(obj.radius, limits.minDimension, limits.maxDimension, 0.38);
  const radiusTop =
    obj.radiusTop !== undefined
      ? clampNumber(obj.radiusTop, limits.minDimension, limits.maxDimension, radius)
      : undefined;
  const radiusBottom =
    obj.radiusBottom !== undefined
      ? clampNumber(obj.radiusBottom, limits.minDimension, limits.maxDimension, radius)
      : undefined;
  const tubeRadius = clampNumber(obj.tubeRadius, 0.015, 2.5, 0.08);
  const turns = clampNumber(obj.turns, 1, 14, 5);
  const teeth = Math.round(clampNumber(obj.teeth, 6, 40, 14));

  let profilePoints = sanitizeVec2List(
    obj.profilePoints,
    limits.maxPointsPerProfile,
    -limits.maxDimension,
    limits.maxDimension,
  );
  if (primitive === 'lathe') {
    // Lathe requires positive radial coordinates >= 0.01 and at least 2 points
    profilePoints = profilePoints
      .map(([r, y]): Vec2Tuple => [Math.max(0.01, Math.abs(r)), y])
      .filter((_, idx) => idx < limits.maxPointsPerProfile);
    if (profilePoints.length < 2) {
      profilePoints = [
        [0.01, -height / 2],
        [radius, -height / 2],
        [radius * 0.78, height / 2],
        [0.01, height / 2],
      ];
    }
  } else if (primitive === 'extruded-polygon' && profilePoints.length < 3) {
    profilePoints = [
      [-width / 2, -height / 2],
      [width / 2, -height / 2],
      [width / 2, height / 2],
      [-width / 2, height / 2],
    ];
  }

  let pathPoints = sanitizeVec3List(
    obj.pathPoints,
    limits.maxPointsPerProfile,
    -limits.maxCoordinateMagnitude,
    limits.maxCoordinateMagnitude,
  );
  if (primitive === 'tube' && pathPoints.length < 2) {
    pathPoints = [
      [-width / 2, 0, 0],
      [0, height * 0.25, 0],
      [width / 2, 0, 0],
    ];
  }

  return {
    primitive,
    offset,
    rotation,
    material,
    width,
    height,
    depth,
    radius,
    radiusTop,
    radiusBottom,
    tubeRadius,
    turns,
    teeth,
    profilePoints: profilePoints.length > 0 ? profilePoints : undefined,
    pathPoints: pathPoints.length > 0 ? pathPoints : undefined,
  };
}

function sanitizeAnimation(raw: unknown): Scene3DAnimationSpec {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const limits = APP_CONFIG.scene3DLimits;

  const rawType = typeof obj.type === 'string' ? obj.type.trim().toLowerCase() : 'none';
  const type: Scene3DAnimationType = VALID_ANIMATIONS.has(rawType as Scene3DAnimationType)
    ? (rawType as Scene3DAnimationType)
    : 'none';

  const rawAxis = typeof obj.axis === 'string' ? obj.axis.trim().toLowerCase() : 'y';
  const axis: Scene3DAxis = VALID_AXES.has(rawAxis as Scene3DAxis)
    ? (rawAxis as Scene3DAxis)
    : 'y';

  const speed = clampNumber(obj.speed, -limits.maxAnimationSpeed, limits.maxAnimationSpeed, 2.2);
  const amplitude = clampNumber(obj.amplitude, 0, 3.5, 0.35);
  const phaseOffset = clampNumber(obj.phaseOffset, -Math.PI * 2, Math.PI * 2, 0);

  const crankRadius =
    obj.crankRadius !== undefined
      ? clampNumber(obj.crankRadius, 0.08, 2.5, 0.45)
      : undefined;
  const rodLength =
    obj.rodLength !== undefined
      ? clampNumber(obj.rodLength, 0.2, 6, 1.4)
      : undefined;
  const rawRole = typeof obj.linkageRole === 'string' ? obj.linkageRole.trim().toLowerCase() : '';
  const linkageRole =
    rawRole === 'crank' || rawRole === 'connecting-rod' || rawRole === 'piston'
      ? rawRole
      : undefined;
  const orbitRadius =
    obj.orbitRadius !== undefined
      ? clampNumber(obj.orbitRadius, 0.1, 6, 0.8)
      : undefined;

  return {
    type,
    axis,
    speed,
    amplitude,
    phaseOffset,
    crankRadius,
    rodLength,
    linkageRole,
    orbitRadius,
  };
}

/**
 * Breaks any cycles or dangling references in component `parentId` hierarchy so
 * scene traversal is strictly an acyclic forest.
 */
function breakHierarchyCycles(components: Scene3DComponentSpec[]): Scene3DComponentSpec[] {
  const byId = new Map(components.map((c) => [c.id, c]));

  return components.map((comp) => {
    if (!comp.parentId || comp.parentId === comp.id || !byId.has(comp.parentId)) {
      return comp.parentId ? { ...comp, parentId: undefined } : comp;
    }

    const visited = new Set<string>([comp.id]);
    let cursor: string | undefined = comp.parentId;
    let hasCycle = false;

    while (cursor) {
      if (visited.has(cursor)) {
        hasCycle = true;
        break;
      }
      visited.add(cursor);
      cursor = byId.get(cursor)?.parentId;
    }

    return hasCycle ? { ...comp, parentId: undefined } : comp;
  });
}

/**
 * Validates and sanitizes Gemini's structured 3D scene specification, enforcing
 * complexity limits, numeric bounds, valid materials, and acyclic parenting.
 */
export function validateGeneratedScene3DSpec(
  rawScene: unknown,
): GeneratedScene3DSpec | undefined {
  if (!rawScene || typeof rawScene !== 'object') {
    return undefined;
  }

  const obj = rawScene as Record<string, unknown>;
  const limits = APP_CONFIG.scene3DLimits;

  const feasible = typeof obj.feasible === 'boolean' ? obj.feasible : false;
  const systemTitle =
    typeof obj.systemTitle === 'string' && obj.systemTitle.trim()
      ? obj.systemTitle.trim().slice(0, 100)
      : 'Conceptual 3D System';
  const category =
    typeof obj.category === 'string' && obj.category.trim()
      ? obj.category.trim().slice(0, 48)
      : 'physical-system';
  const conceptualNote =
    typeof obj.conceptualNote === 'string' && obj.conceptualNote.trim()
      ? obj.conceptualNote.trim().slice(0, 240)
      : 'Simplified educational 3D representation with estimated proportions.';
  const estimatedScaleLabel =
    typeof obj.estimatedScaleLabel === 'string' && obj.estimatedScaleLabel.trim()
      ? obj.estimatedScaleLabel.trim().slice(0, 80)
      : 'Conceptual educational scale';
  const operatingPrinciple =
    typeof obj.operatingPrinciple === 'string' && obj.operatingPrinciple.trim()
      ? obj.operatingPrinciple.trim().slice(0, 400)
      : 'Interactive component assembly and motion overview.';

  const infeasibilityReason =
    typeof obj.infeasibilityReason === 'string' && obj.infeasibilityReason.trim()
      ? obj.infeasibilityReason.trim().slice(0, 280)
      : undefined;

  const physicalProcesses = Array.isArray(obj.physicalProcesses)
    ? obj.physicalProcesses
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim().slice(0, 120))
        .slice(0, 6)
    : [];

  if (!feasible) {
    return {
      feasible: false,
      infeasibilityReason:
        infeasibilityReason ??
        'This topic is primarily abstract or non-spatial, so a 3D mechanical model is not generated.',
      systemTitle,
      category,
      conceptualNote,
      estimatedScaleLabel,
      operatingPrinciple,
      physicalProcesses,
      components: [],
      connections: [],
    };
  }

  const rawComponents = Array.isArray(obj.components) ? obj.components : [];
  const components: Scene3DComponentSpec[] = [];
  const seenIds = new Set<string>();

  for (const item of rawComponents.slice(0, limits.maxComponents)) {
    if (!item || typeof item !== 'object') continue;
    const comp = item as Record<string, unknown>;

    const id = typeof comp.id === 'string' ? comp.id.trim().slice(0, 64) : '';
    const name = typeof comp.name === 'string' ? comp.name.trim().slice(0, 72) : '';
    if (!id || !name || seenIds.has(id)) continue;

    const rawShapes = Array.isArray(comp.shapes) ? comp.shapes : [];
    const shapes: Scene3DShapePart[] = [];
    for (const s of rawShapes.slice(0, limits.maxSubShapesPerComponent)) {
      const sanitized = sanitizeShapePart(s);
      if (sanitized) shapes.push(sanitized);
    }
    if (shapes.length === 0) {
      shapes.push({
        primitive: 'box',
        offset: [0, 0, 0],
        rotation: [0, 0, 0],
        material: { color: '#64748B', metalness: 0.5, roughness: 0.4 },
        width: 0.6,
        height: 0.6,
        depth: 0.6,
      });
    }

    seenIds.add(id);
    components.push({
      id,
      name,
      role:
        typeof comp.role === 'string' && comp.role.trim()
          ? comp.role.trim().slice(0, 260)
          : name,
      parentId:
        typeof comp.parentId === 'string' && comp.parentId.trim()
          ? comp.parentId.trim().slice(0, 64)
          : undefined,
      position: sanitizeVec3(
        comp.position,
        -limits.maxCoordinateMagnitude,
        limits.maxCoordinateMagnitude,
      ),
      rotation: sanitizeVec3(comp.rotation, -Math.PI * 2, Math.PI * 2),
      explodeVector: comp.explodeVector
        ? sanitizeVec3(
            comp.explodeVector,
            -limits.maxExplodeDistance,
            limits.maxExplodeDistance,
          )
        : undefined,
      dimensionsEstimate:
        typeof comp.dimensionsEstimate === 'string' && comp.dimensionsEstimate.trim()
          ? comp.dimensionsEstimate.trim().slice(0, 80)
          : undefined,
      operatingNote:
        typeof comp.operatingNote === 'string' && comp.operatingNote.trim()
          ? comp.operatingNote.trim().slice(0, 220)
          : undefined,
      shapes,
      animation: sanitizeAnimation(comp.animation),
    });
  }

  if (components.length === 0) {
    return {
      feasible: false,
      infeasibilityReason:
        'Gemini could not produce valid 3D component geometry for this concept.',
      systemTitle,
      category,
      conceptualNote,
      estimatedScaleLabel,
      operatingPrinciple,
      physicalProcesses,
      components: [],
      connections: [],
    };
  }

  const acyclicComponents = breakHierarchyCycles(components);

  const rawConnections = Array.isArray(obj.connections) ? obj.connections : [];
  const connections: Scene3DConnectionSpec[] = [];
  for (const item of rawConnections.slice(0, limits.maxConnections)) {
    if (!item || typeof item !== 'object') continue;
    const conn = item as Record<string, unknown>;
    const fromId = typeof conn.fromId === 'string' ? conn.fromId.trim() : '';
    const toId = typeof conn.toId === 'string' ? conn.toId.trim() : '';
    const label = typeof conn.label === 'string' ? conn.label.trim().slice(0, 60) : '';
    const rawKind =
      typeof conn.kind === 'string' ? conn.kind.trim().toLowerCase() : 'mechanical';
    const kind: Scene3DConnectionKind = VALID_CONNECTION_KINDS.has(
      rawKind as Scene3DConnectionKind,
    )
      ? (rawKind as Scene3DConnectionKind)
      : 'mechanical';

    if (seenIds.has(fromId) && seenIds.has(toId) && fromId !== toId) {
      connections.push({
        fromId,
        toId,
        label: label || `${kind} link`,
        kind,
        animatedFlow: typeof conn.animatedFlow === 'boolean' ? conn.animatedFlow : true,
      });
    }
  }

  return {
    feasible: true,
    systemTitle,
    category,
    conceptualNote,
    estimatedScaleLabel,
    operatingPrinciple,
    physicalProcesses,
    components: acyclicComponents,
    connections,
  };
}
