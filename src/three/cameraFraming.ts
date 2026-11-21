import * as THREE from 'three';

export interface Box3FramingInput {
  readonly boxMin: readonly [number, number, number];
  readonly boxMax: readonly [number, number, number];
  readonly aspect: number;
  readonly fovDeg?: number;
  readonly azimuthDeg?: number;
  readonly elevationDeg?: number;
  readonly fillRatio?: number;
  readonly minDistance?: number;
  readonly maxDistance?: number;
}

export interface ComputedCameraFraming {
  readonly center: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly distance: number;
}

const _tempBox = new THREE.Box3();
const _tempSubBox = new THREE.Box3();
const _tempVec = new THREE.Vector3();

/**
 * Pure aspect-aware Box3 camera framing math.
 * Projects all 8 corners of the axis-aligned Box3 onto the camera's view plane
 * for the given viewing direction (azimuth, elevation) and computes the exact
 * distance so the object occupies ~65-80% (default fillRatio = 0.72) of the
 * limiting viewport axis without cropping.
 */
export function computeBox3CameraFraming({
  boxMin,
  boxMax,
  aspect,
  fovDeg = 38,
  azimuthDeg = 38,
  elevationDeg = 20,
  fillRatio = 0.72,
  minDistance = 0.75,
  maxDistance = 32,
}: Box3FramingInput): ComputedCameraFraming {
  const safeMinX = Math.min(boxMin[0], boxMax[0]);
  const safeMinY = Math.min(boxMin[1], boxMax[1]);
  const safeMinZ = Math.min(boxMin[2], boxMax[2]);
  const safeMaxX = Math.max(boxMin[0], boxMax[0]);
  const safeMaxY = Math.max(boxMin[1], boxMax[1]);
  const safeMaxZ = Math.max(boxMin[2], boxMax[2]);

  const cx = (safeMinX + safeMaxX) * 0.5;
  const cy = (safeMinY + safeMaxY) * 0.5;
  const cz = (safeMinZ + safeMaxZ) * 0.5;

  const sx = Math.max(0.18, safeMaxX - safeMinX);
  const sy = Math.max(0.18, safeMaxY - safeMinY);
  const sz = Math.max(0.18, safeMaxZ - safeMinZ);

  const hx = sx * 0.5;
  const hy = sy * 0.5;
  const hz = sz * 0.5;

  const az = THREE.MathUtils.degToRad(azimuthDeg);
  const el = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(elevationDeg, -55, 78));
  const cosEl = Math.cos(el);

  // Unit vector pointing FROM target TOWARD camera
  const dirX = Math.sin(az) * cosEl;
  const dirY = Math.sin(el);
  const dirZ = Math.cos(az) * cosEl;

  // Orthonormal camera basis (right = worldUp x dir, up = dir x right)
  let rx = dirZ;
  let ry = 0;
  let rz = -dirX;
  const rLen = Math.hypot(rx, ry, rz);
  if (rLen < 1e-5) {
    rx = 1;
    ry = 0;
    rz = 0;
  } else {
    rx /= rLen;
    ry /= rLen;
    rz /= rLen;
  }

  const ux = dirY * rz - dirZ * ry;
  const uy = dirZ * rx - dirX * rz;
  const uz = dirX * ry - dirY * rx;

  // Project the box half-extents onto camera right, up, and view axes
  const projHalfW = Math.abs(rx) * hx + Math.abs(ry) * hy + Math.abs(rz) * hz;
  const projHalfH = Math.abs(ux) * hx + Math.abs(uy) * hy + Math.abs(uz) * hz;
  const projHalfD = Math.abs(dirX) * hx + Math.abs(dirY) * hy + Math.abs(dirZ) * hz;

  const safeAspect = Number.isFinite(aspect) && aspect > 0.15 ? aspect : 1.35;
  const safeFill = THREE.MathUtils.clamp(fillRatio, 0.4, 0.9);
  const vHalfTan = Math.tan(THREE.MathUtils.degToRad(THREE.MathUtils.clamp(fovDeg, 16, 80)) * 0.5);
  const hHalfTan = vHalfTan * safeAspect;

  const distForHeight = projHalfH / (safeFill * vHalfTan);
  const distForWidth = projHalfW / (safeFill * hHalfTan);

  // Add front half-depth so the near face doesn't clip or exceed the target fill ratio
  const rawDistance = Math.max(distForHeight, distForWidth) + projHalfD * 0.85;
  const distance = THREE.MathUtils.clamp(rawDistance, minDistance, maxDistance);

  return {
    center: [cx, cy, cz],
    size: [sx, sy, sz],
    target: [Number(cx.toFixed(3)), Number(cy.toFixed(3)), Number(cz.toFixed(3))],
    position: [
      Number((cx + dirX * distance).toFixed(3)),
      Number((cy + dirY * distance).toFixed(3)),
      Number((cz + dirZ * distance).toFixed(3)),
    ],
    distance: Number(distance.toFixed(3)),
  };
}

/**
 * Measures the actual world-space Box3 of a Three.js Object3D hierarchy,
 * ignoring objects explicitly tagged `userData.excludeFromBounds = true`
 * (such as ground grids, shadow planes, or distant background helpers).
 */
export function measureObjectWorldBox3(
  root: THREE.Object3D,
): { boxMin: [number, number, number]; boxMax: [number, number, number] } | null {
  root.updateMatrixWorld(true);
  _tempBox.makeEmpty();

  root.traverse((obj) => {
    if (!obj.visible) return;
    if (obj.userData?.excludeFromBounds) return;
    if (
      obj instanceof THREE.GridHelper ||
      obj instanceof THREE.Sprite ||
      obj instanceof THREE.Light ||
      obj instanceof THREE.Points
    ) {
      return;
    }
    if (obj instanceof THREE.Mesh) {
      const geo = obj.geometry;
      if (!geo) return;
      if (!geo.boundingBox) {
        geo.computeBoundingBox();
      }
      if (!geo.boundingBox || geo.boundingBox.isEmpty()) return;
      _tempSubBox.copy(geo.boundingBox).applyMatrix4(obj.matrixWorld);
      if (
        Number.isFinite(_tempSubBox.min.x) &&
        Number.isFinite(_tempSubBox.max.x)
      ) {
        _tempBox.union(_tempSubBox);
      }
    }
  });

  if (_tempBox.isEmpty()) {
    return null;
  }

  _tempBox.getSize(_tempVec);
  if (_tempVec.lengthSq() < 1e-6) {
    return null;
  }

  return {
    boxMin: [_tempBox.min.x, _tempBox.min.y, _tempBox.min.z],
    boxMax: [_tempBox.max.x, _tempBox.max.y, _tempBox.max.z],
  };
}

/**
 * Finds the combined world-space Box3 for all visible meshes under nodes tagged
 * with `userData.componentId === componentId`.
 */
export function measureComponentWorldBox3(
  root: THREE.Object3D,
  componentId: string,
): { boxMin: [number, number, number]; boxMax: [number, number, number] } | null {
  root.updateMatrixWorld(true);
  const matchingRoots: THREE.Object3D[] = [];

  root.traverse((obj) => {
    if (!obj.visible) return;
    if (obj.userData?.componentId === componentId) {
      matchingRoots.push(obj);
    }
  });

  if (matchingRoots.length === 0) {
    return null;
  }

  const union = new THREE.Box3();
  for (const node of matchingRoots) {
    const sub = measureObjectWorldBox3(node);
    if (sub) {
      union.expandByPoint(new THREE.Vector3(...sub.boxMin));
      union.expandByPoint(new THREE.Vector3(...sub.boxMax));
    }
  }

  if (union.isEmpty()) {
    return null;
  }

  return {
    boxMin: [union.min.x, union.min.y, union.min.z],
    boxMax: [union.max.x, union.max.y, union.max.z],
  };
}
