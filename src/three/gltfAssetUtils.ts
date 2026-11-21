import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { APP_CONFIG } from '../config/appConfig.ts';
import type {
  AssetPartAnimation,
  AssetPartBoundsFraction,
  AssetPartCameraFraming,
  AssetPartDefinition,
  AssetRegistryEntry,
} from './assetRegistry.ts';

export interface NormalizedModelMetrics {
  readonly size: readonly [number, number, number];
  readonly center: readonly [number, number, number];
  readonly radius: number;
  readonly scaleFactor: number;
  readonly boxMin: readonly [number, number, number];
  readonly boxMax: readonly [number, number, number];
}

export interface ResolvedGlbPart {
  readonly id: string;
  readonly label: string;
  readonly role: string;
  readonly operatingNote: string;
  readonly isVerifiedMesh: boolean;
  readonly isSubRegionOfMesh: boolean;
  readonly matchedNodeNames: readonly string[];
  readonly boundsCenter: readonly [number, number, number];
  readonly boundsSize: readonly [number, number, number];
  readonly animation?: AssetPartAnimation;
  readonly cameraFraming: AssetPartCameraFraming;
}

export interface BoxCameraPreset {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
}

import { computeBox3CameraFraming } from './cameraFraming.ts';

/**
 * Pure aspect-aware camera framing math: given a world-space target box center & size,
 * computes an angled orbit camera position that cleanly frames ~65-80% of the viewport.
 */
export function computeBoxCameraPreset(
  center: readonly [number, number, number],
  size: readonly [number, number, number],
  framing: AssetPartCameraFraming = { azimuthDeg: 48, elevationDeg: 20, distanceScale: 1.55 },
  fovDeg = 38,
  aspect = 1.35,
  fillRatio?: number,
): BoxCameraPreset {
  const effectiveFill =
    fillRatio ??
    THREE.MathUtils.clamp(1.12 / Math.max(0.95, framing.distanceScale), 0.56, 0.78);
  const hx = Math.max(0.12, size[0] * 0.5);
  const hy = Math.max(0.12, size[1] * 0.5);
  const hz = Math.max(0.12, size[2] * 0.5);

  const computed = computeBox3CameraFraming({
    boxMin: [center[0] - hx, center[1] - hy, center[2] - hz],
    boxMax: [center[0] + hx, center[1] + hy, center[2] + hz],
    aspect,
    fovDeg,
    azimuthDeg: framing.azimuthDeg,
    elevationDeg: framing.elevationDeg,
    fillRatio: effectiveFill,
    minDistance: 0.75,
    maxDistance: 28,
  });

  return {
    position: computed.position,
    target: computed.target,
  };
}

/**
 * Computes a sub-region Box3 inside a parent bounding box using normalized [0..1] fractions.
 */
export function computeSubRegionBounds(
  minCorner: readonly [number, number, number],
  maxCorner: readonly [number, number, number],
  fraction: AssetPartBoundsFraction,
): { center: readonly [number, number, number]; size: readonly [number, number, number] } {
  const spanX = maxCorner[0] - minCorner[0];
  const spanY = maxCorner[1] - minCorner[1];
  const spanZ = maxCorner[2] - minCorner[2];

  const x0 = minCorner[0] + spanX * (fraction.minX ?? 0);
  const x1 = minCorner[0] + spanX * (fraction.maxX ?? 1);
  const y0 = minCorner[1] + spanY * (fraction.minY ?? 0);
  const y1 = minCorner[1] + spanY * (fraction.maxY ?? 1);
  const z0 = minCorner[2] + spanZ * (fraction.minZ ?? 0);
  const z1 = minCorner[2] + spanZ * (fraction.maxZ ?? 1);

  return {
    center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
    size: [
      Math.max(0.15, Math.abs(x1 - x0)),
      Math.max(0.15, Math.abs(y1 - y0)),
      Math.max(0.15, Math.abs(z1 - z0)),
    ],
  };
}

/**
 * Scales a loaded Three.js model uniformly so its longest dimension equals `targetExtent`,
 * centers it at X=0, Z=0, and rests its bottom flush on Y=0.
 */
export function normalizeModelToStage(
  root: THREE.Object3D,
  targetExtent = APP_CONFIG.assetDefaults.targetNormalizedExtent,
): NormalizedModelMetrics {
  root.updateMatrixWorld(true);
  const initialBox = new THREE.Box3().setFromObject(root);
  const initialSize = new THREE.Vector3();
  initialBox.getSize(initialSize);

  const maxDim = Math.max(0.001, initialSize.x, initialSize.y, initialSize.z);
  const scaleFactor = targetExtent / maxDim;
  root.scale.multiplyScalar(scaleFactor);
  root.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(root);
  const scaledCenter = new THREE.Vector3();
  scaledBox.getCenter(scaledCenter);

  root.position.x -= scaledCenter.x;
  root.position.z -= scaledCenter.z;
  root.position.y -= scaledBox.min.y;
  root.updateMatrixWorld(true);

  const finalBox = new THREE.Box3().setFromObject(root);
  const finalSize = new THREE.Vector3();
  const finalCenter = new THREE.Vector3();
  finalBox.getSize(finalSize);
  finalBox.getCenter(finalCenter);

  const sphere = new THREE.Sphere();
  finalBox.getBoundingSphere(sphere);

  return {
    size: [finalSize.x, finalSize.y, finalSize.z],
    center: [finalCenter.x, finalCenter.y, finalCenter.z],
    radius: Math.max(0.5, sphere.radius),
    scaleFactor,
    boxMin: [finalBox.min.x, finalBox.min.y, finalBox.min.z],
    boxMax: [finalBox.max.x, finalBox.max.y, finalBox.max.z],
  };
}

function nodeMatchesPattern(nodeName: string, pattern: string): boolean {
  const n = nodeName.toLowerCase();
  const p = pattern.toLowerCase();
  if (p.endsWith('_')) {
    return n.startsWith(p);
  }
  return n === p || n === `${p}_mesh` || n.includes(p);
}

/**
 * Walks a normalized GLB scene graph and maps either registered AssetPartDefinitions
 * or auto-discovered named meshes (for user-uploaded custom GLBs) into selectable parts.
 */
export function discoverAssetParts(
  root: THREE.Object3D,
  entry: AssetRegistryEntry | null,
  metrics: NormalizedModelMetrics,
): ResolvedGlbPart[] {
  root.updateMatrixWorld(true);
  const allNamedNodes: THREE.Object3D[] = [];
  root.traverse((obj) => {
    if (obj !== root && obj.name && obj.name.trim().length > 0) {
      allNamedNodes.push(obj);
    }
  });

  if (entry && entry.knownParts.length > 0) {
    const resolved: ResolvedGlbPart[] = [];
    for (const partDef of entry.knownParts) {
      const matched = allNamedNodes.filter((node) =>
        partDef.meshNamePatterns.some((pat) => nodeMatchesPattern(node.name, pat)),
      );

      // Prefer non-duplicate root node if parent and child *_mesh both matched
      const topMatches = matched.filter(
        (node) => !matched.some((other) => other !== node && other === node.parent),
      );

      let boundsCenter: readonly [number, number, number] = metrics.center;
      let boundsSize: readonly [number, number, number] = metrics.size;

      if (partDef.boundsFraction) {
        const sub = computeSubRegionBounds(metrics.boxMin, metrics.boxMax, partDef.boundsFraction);
        boundsCenter = sub.center;
        boundsSize = sub.size;
      } else if (topMatches.length > 0) {
        const unionBox = new THREE.Box3();
        for (const node of topMatches) {
          unionBox.expandByObject(node);
        }
        if (!unionBox.isEmpty()) {
          const c = new THREE.Vector3();
          const s = new THREE.Vector3();
          unionBox.getCenter(c);
          unionBox.getSize(s);
          boundsCenter = [c.x, c.y, c.z];
          boundsSize = [Math.max(0.18, s.x), Math.max(0.18, s.y), Math.max(0.18, s.z)];
        }
      }

      resolved.push({
        id: partDef.id,
        label: partDef.label,
        role: partDef.role,
        operatingNote: partDef.operatingNote,
        isVerifiedMesh: partDef.isVerifiedMesh && topMatches.length > 0,
        isSubRegionOfMesh: partDef.isSubRegionOfMesh,
        matchedNodeNames: topMatches.map((n) => n.name),
        boundsCenter,
        boundsSize,
        animation: partDef.animation,
        cameraFraming: partDef.cameraFraming,
      });
    }
    return resolved;
  }

  // Generic inspection for custom user-uploaded GLB/glTF files
  const meshCandidates: THREE.Object3D[] = [];
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      meshCandidates.push(obj);
    }
  });

  const seenLabels = new Set<string>();
  const discovered: ResolvedGlbPart[] = [];
  for (let i = 0; i < meshCandidates.length && discovered.length < 24; i += 1) {
    const mesh = meshCandidates[i];
    const rawName = mesh.name || mesh.parent?.name || `Mesh_${i + 1}`;
    const cleanLabel = rawName.replace(/_mesh$/i, '').replace(/[_-]+/g, ' ').trim();
    const id = rawName.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
    if (seenLabels.has(id)) continue;
    seenLabels.add(id);

    const box = new THREE.Box3().setFromObject(mesh);
    const c = new THREE.Vector3();
    const s = new THREE.Vector3();
    box.getCenter(c);
    box.getSize(s);

    discovered.push({
      id,
      label: cleanLabel || `Mesh ${i + 1}`,
      role: `Verified mesh node "${rawName}" extracted from the loaded glTF/GLB hierarchy.`,
      operatingNote: 'Click in 3D or use the part chips to inspect bounds and isolate this mesh.',
      isVerifiedMesh: true,
      isSubRegionOfMesh: false,
      matchedNodeNames: [rawName],
      boundsCenter: [c.x, c.y, c.z],
      boundsSize: [Math.max(0.18, s.x), Math.max(0.18, s.y), Math.max(0.18, s.z)],
      cameraFraming: { azimuthDeg: 48, elevationDeg: 20, distanceScale: 1.9 },
    });
  }

  return discovered;
}

/**
 * Resolves a clicked Three.js mesh inside a loaded GLB back to its matching ResolvedGlbPart.
 */
export function resolveClickedObjectToPart(
  clickedObject: THREE.Object3D,
  parts: readonly ResolvedGlbPart[],
  localHitPoint?: THREE.Vector3,
): ResolvedGlbPart | null {
  const ancestorNames: string[] = [];
  let cursor: THREE.Object3D | null = clickedObject;
  while (cursor) {
    if (cursor.name) {
      ancestorNames.push(cursor.name.toLowerCase());
    }
    cursor = cursor.parent;
  }

  // First check exact non-subregion verified mesh matches (e.g. propeller, rudder, chuck)
  for (const part of parts) {
    if (part.isSubRegionOfMesh) continue;
    const match = part.matchedNodeNames.some((name) =>
      ancestorNames.includes(name.toLowerCase()),
    );
    if (match) {
      return part;
    }
  }

  // Next, if multiple spatial sub-regions map to the same base mesh (e.g. hull vs superstructure on "body"),
  // choose the sub-region closest to the raycast hit point.
  const subRegionCandidates = parts.filter(
    (part) =>
      part.isSubRegionOfMesh &&
      part.matchedNodeNames.some((name) => ancestorNames.includes(name.toLowerCase())),
  );

  if (subRegionCandidates.length === 1) {
    return subRegionCandidates[0];
  }
  if (subRegionCandidates.length > 1 && localHitPoint) {
    let best = subRegionCandidates[0];
    let bestDist = Infinity;
    for (const candidate of subRegionCandidates) {
      const dx = localHitPoint.x - candidate.boundsCenter[0];
      const dy = localHitPoint.y - candidate.boundsCenter[1];
      const dz = localHitPoint.z - candidate.boundsCenter[2];
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestDist) {
        bestDist = d;
        best = candidate;
      }
    }
    return best;
  }

  // Fallback for prefix-grouped meshes like container_001 -> containers
  for (const part of parts) {
    if (
      part.matchedNodeNames.some((pattern) =>
        ancestorNames.some((n) => n.startsWith(pattern.toLowerCase().replace(/_$/, ''))),
      )
    ) {
      return part;
    }
  }

  return parts[0] ?? null;
}

/**
 * Instantiates a GLTFLoader configured with local Basis KTX2, Draco, and Meshopt decoders
 * so CC0 models from tevy.dev and custom user GLBs load offline without CDN requests.
 */
export function createConfiguredGltfLoader(
  gl?: THREE.WebGLRenderer,
  manager?: THREE.LoadingManager,
): { loader: GLTFLoader; dispose: () => void } {
  const loader = new GLTFLoader(manager);
  loader.setMeshoptDecoder(MeshoptDecoder);

  const dracoLoader = new DRACOLoader(manager);
  dracoLoader.setDecoderPath('/draco/');
  loader.setDRACOLoader(dracoLoader);

  let ktx2Loader: KTX2Loader | null = null;
  if (typeof window !== 'undefined' && gl) {
    ktx2Loader = new KTX2Loader(manager);
    ktx2Loader.setTranscoderPath('/basis/');
    ktx2Loader.detectSupport(gl);
    loader.setKTX2Loader(ktx2Loader);
  }

  return {
    loader,
    dispose: () => {
      dracoLoader.dispose();
      ktx2Loader?.dispose();
    },
  };
}
