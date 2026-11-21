import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { ExplorationLevel } from '../../types/tutor';
import { APP_CONFIG } from '../../config/appConfig';
import type { AssetRegistryEntry } from '../../three/assetRegistry';
import {
  computeSubRegionBounds,
  createConfiguredGltfLoader,
  discoverAssetParts,
  normalizeModelToStage,
  resolveClickedObjectToPart,
  type NormalizedModelMetrics,
  type ResolvedGlbPart,
} from '../../three/gltfAssetUtils';
import { AssetDrivetrainOverlay3D } from './AssetDrivetrainOverlay3D';

export interface LoadedGlbAssetSummary {
  readonly metrics: NormalizedModelMetrics;
  readonly parts: readonly ResolvedGlbPart[];
  readonly meshCount: number;
  readonly triangleCount: number;
}

interface AssetModel3DProps {
  assetEntry: AssetRegistryEntry | null;
  modelUrl: string;
  explorationLevel: ExplorationLevel;
  selectedPartId: string | null;
  isolateSelected: boolean;
  isPlaying: boolean;
  isExploded: boolean;
  speedMultiplier: number;
  isSoftwareGl: boolean;
  showLabels?: boolean;
  onLoadProgress: (percent: number) => void;
  onLoadComplete: (summary: LoadedGlbAssetSummary) => void;
  onLoadError: (message: string) => void;
  onSelectPart: (partId: string) => void;
}

interface SavedMaterialSnapshot {
  readonly transparent: boolean;
  readonly opacity: number;
  readonly depthWrite: boolean;
  readonly emissive: THREE.Color | null;
  readonly emissiveIntensity: number;
}

function disposeObjectSubtree(root: THREE.Object3D) {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry?.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!mat) continue;
        for (const key of Object.keys(mat)) {
          const val = (mat as unknown as Record<string, unknown>)[key];
          if (val && typeof val === 'object' && 'isTexture' in val) {
            (val as THREE.Texture).dispose();
          }
        }
        mat.dispose();
      }
    }
  });
}

function isExteriorShellNode(nodeName: string, entry: AssetRegistryEntry | null): boolean {
  const n = nodeName.toLowerCase();
  if (!entry) {
    return n.includes('body') || n.includes('housing') || n.includes('hull') || n.includes('shell');
  }
  if (entry.id === 'container-ship') {
    return n === 'body' || n === 'fittings' || n.startsWith('container_');
  }
  if (entry.id === 'cordless-drill') {
    return n.includes('cordless_drill');
  }
  if (entry.id === 'family-sedan') {
    return (
      n === 'body' ||
      n.includes('door_') ||
      n.includes('bonnet') ||
      n.includes('boot') ||
      n.includes('glass_')
    );
  }
  return n.includes('body') || n.includes('housing');
}

export function AssetModel3D({
  assetEntry,
  modelUrl,
  explorationLevel,
  selectedPartId,
  isolateSelected,
  isPlaying,
  isExploded,
  speedMultiplier,
  isSoftwareGl,
  showLabels = false,
  onLoadProgress,
  onLoadComplete,
  onLoadError,
  onSelectPart,
}: AssetModel3DProps) {
  const { gl, invalidate } = useThree();
  const containerRef = useRef<THREE.Group>(null);
  const loadedRootRef = useRef<THREE.Group | null>(null);
  const partsRef = useRef<ResolvedGlbPart[]>([]);
  const metricsRef = useRef<NormalizedModelMetrics | null>(null);
  const animatedNodesRef = useRef<
    { node: THREE.Object3D; part: ResolvedGlbPart; baseRotation: THREE.Euler }[]
  >([]);
  const explodeNodesRef = useRef<
    { node: THREE.Object3D; basePos: THREE.Vector3; explodeOffset: THREE.Vector3 }[]
  >([]);
  const elapsedRef = useRef(0);
  const explodeAmountRef = useRef(0);
  const [loadVersion, setLoadVersion] = useState(0);

  const onLoadProgressRef = useRef(onLoadProgress);
  const onLoadCompleteRef = useRef(onLoadComplete);
  const onLoadErrorRef = useRef(onLoadError);
  onLoadProgressRef.current = onLoadProgress;
  onLoadCompleteRef.current = onLoadComplete;
  onLoadErrorRef.current = onLoadError;

  // Load GLB asset cleanly with local decoders and full disposal on switch
  useEffect(() => {
    let cancelled = false;
    let loadCompleted = false;
    const container = containerRef.current;
    if (!container) return undefined;

    if (loadedRootRef.current) {
      container.remove(loadedRootRef.current);
      disposeObjectSubtree(loadedRootRef.current);
      loadedRootRef.current = null;
    }
    partsRef.current = [];
    metricsRef.current = null;
    animatedNodesRef.current = [];
    explodeNodesRef.current = [];
    elapsedRef.current = 0;

    const manager = new THREE.LoadingManager();
    manager.onProgress = (_url, loaded, total) => {
      if (cancelled || loadCompleted) return;
      if (total > 0) {
        onLoadProgressRef.current(Math.min(99, Math.round((loaded / total) * 100)));
      }
    };

    const { loader, dispose: disposeDecoders } = createConfiguredGltfLoader(gl, manager);
    onLoadProgressRef.current(8);

    loader.load(
      modelUrl,
      (gltf) => {
        if (cancelled) {
          disposeObjectSubtree(gltf.scene);
          disposeDecoders();
          return;
        }
        loadCompleted = true;

        const root = new THREE.Group();
        root.name = 'normalized-asset-root';
        root.add(gltf.scene);

        const metrics = normalizeModelToStage(
          root,
          APP_CONFIG.assetDefaults.targetNormalizedExtent,
        );

        let meshCount = 0;
        let triangleCount = 0;

        root.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            meshCount += 1;
            const posAttr = obj.geometry?.attributes?.position;
            if (obj.geometry?.index) {
              triangleCount += Math.round(obj.geometry.index.count / 3);
            } else if (posAttr) {
              triangleCount += Math.round(posAttr.count / 3);
            }

            obj.castShadow = !isSoftwareGl;
            obj.receiveShadow = !isSoftwareGl;

            const cloneAndSnapshot = (mat: THREE.Material) => {
              const cloned = mat.clone();
              const std = cloned as THREE.MeshStandardMaterial;
              const snapshot: SavedMaterialSnapshot = {
                transparent: cloned.transparent,
                opacity: cloned.opacity,
                depthWrite: cloned.depthWrite,
                emissive: std.emissive ? std.emissive.clone() : null,
                emissiveIntensity:
                  typeof std.emissiveIntensity === 'number' ? std.emissiveIntensity : 0,
              };
              cloned.userData.snapshot = snapshot;
              return cloned;
            };

            if (Array.isArray(obj.material)) {
              obj.material = obj.material.map(cloneAndSnapshot);
            } else if (obj.material) {
              obj.material = cloneAndSnapshot(obj.material);
            }
          }
        });

        const parts = discoverAssetParts(root, assetEntry, metrics);

        // Bind actual GLB scene nodes for animation (e.g. propeller, rudder, radar_scanner, chuck, wheels)
        const animated: { node: THREE.Object3D; part: ResolvedGlbPart; baseRotation: THREE.Euler }[] = [];
        for (const part of parts) {
          if (!part.animation) continue;
          for (const nodeName of part.matchedNodeNames) {
            const targetNode = root.getObjectByName(nodeName);
            if (targetNode) {
              animated.push({
                node: targetNode,
                part,
                baseRotation: targetNode.rotation.clone(),
              });
            }
          }
        }

        // Compute outward explode offsets for distinct top-level parts when user toggles Explode
        const explodeEntries: {
          node: THREE.Object3D;
          basePos: THREE.Vector3;
          explodeOffset: THREE.Vector3;
        }[] = [];
        const modelCenterVec = new THREE.Vector3(...metrics.center);
        const handledNames = new Set<string>();
        for (const part of parts) {
          if (part.isSubRegionOfMesh) continue;
          for (const nodeName of part.matchedNodeNames) {
            if (handledNames.has(nodeName)) continue;
            const node = root.getObjectByName(nodeName);
            if (!node) continue;
            handledNames.add(nodeName);

            const nodeCenter = new THREE.Vector3(...part.boundsCenter);
            const dir = nodeCenter.sub(modelCenterVec);
            if (dir.lengthSq() < 0.001) {
              dir.set(0, 0.4, 0);
            } else {
              dir.normalize();
            }
            explodeEntries.push({
              node,
              basePos: node.position.clone(),
              explodeOffset: dir.multiplyScalar(0.65 / Math.max(0.1, metrics.scaleFactor)),
            });
          }
        }

        container.add(root);
        loadedRootRef.current = root;
        partsRef.current = parts;
        metricsRef.current = metrics;
        animatedNodesRef.current = animated;
        explodeNodesRef.current = explodeEntries;

        onLoadProgressRef.current(100);
        setLoadVersion((v) => v + 1);
        onLoadCompleteRef.current({
          metrics,
          parts,
          meshCount,
          triangleCount,
        });
        invalidate();
        disposeDecoders();
      },
      (evt) => {
        if (cancelled || loadCompleted) return;
        if (evt.total > 0) {
          onLoadProgressRef.current(Math.min(99, Math.round((evt.loaded / evt.total) * 100)));
        }
      },
      (err) => {
        if (cancelled) return;
        disposeDecoders();
        const message =
          err instanceof Error ? err.message : 'Unable to decode glTF/GLB asset.';
        onLoadErrorRef.current(message);
      },
    );

    return () => {
      cancelled = true;
      disposeDecoders();
      if (loadedRootRef.current) {
        container.remove(loadedRootRef.current);
        disposeObjectSubtree(loadedRootRef.current);
        loadedRootRef.current = null;
      }
    };
  }, [modelUrl, assetEntry, gl, isSoftwareGl, invalidate]);

  // Apply selection highlight, isolation dimming, and Level-2 internal cutaway transparency
  useEffect(() => {
    const root = loadedRootRef.current;
    if (!root) return;

    const selectedPart =
      partsRef.current.find((p) => p.id === selectedPartId) ?? null;
    const isDrivetrainSubRegion = Boolean(
      selectedPart &&
        [
          'motor',
          'gearbox',
          'output-shaft',
          'trigger',
          'battery',
          'engine',
          'coupling',
          'propeller-shaft',
          'water-thrust',
        ].includes(selectedPart.id),
    );
    const isCutawayOverlay =
      explorationLevel === 'internal-structure' || isDrivetrainSubRegion;
    const shouldIsolate =
      Boolean(isolateSelected && selectedPart && !selectedPart.isSubRegionOfMesh);

    const selectedNames = new Set(
      (selectedPart?.matchedNodeNames ?? []).map((n) => n.toLowerCase()),
    );

    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;

      // Determine ancestor chain names to see if mesh belongs to selected part or exterior shell
      const chain: string[] = [];
      let cur: THREE.Object3D | null = obj;
      while (cur && cur !== root) {
        if (cur.name) chain.push(cur.name.toLowerCase());
        cur = cur.parent;
      }

      const belongsToSelected =
        Boolean(selectedPart) &&
        chain.some(
          (n) =>
            selectedNames.has(n) ||
            Array.from(selectedNames).some((pat) => pat.endsWith('_') && n.startsWith(pat)),
        );

      const isExterior = chain.some((n) => isExteriorShellNode(n, assetEntry));

      const applyState = (mat: THREE.Material) => {
        const snap = mat.userData.snapshot as SavedMaterialSnapshot | undefined;
        if (!snap) return;
        const std = mat as THREE.MeshStandardMaterial;

        // Restore defaults first
        mat.transparent = snap.transparent;
        mat.opacity = snap.opacity;
        mat.depthWrite = snap.depthWrite;
        if (std.emissive && snap.emissive) {
          std.emissive.copy(snap.emissive);
          std.emissiveIntensity = snap.emissiveIntensity;
        }

        if (shouldIsolate && !belongsToSelected) {
          mat.transparent = true;
          mat.opacity = 0.14;
          mat.depthWrite = false;
        } else if (isCutawayOverlay && isExterior && (!belongsToSelected || isDrivetrainSubRegion)) {
          mat.transparent = true;
          mat.opacity = assetEntry?.illustrativeOverlay?.exteriorOpacity ?? 0.24;
          mat.depthWrite = false;
        } else if (belongsToSelected && selectedPart && !selectedPart.isSubRegionOfMesh && std.emissive) {
          std.emissive.set('#0EA5E9');
          std.emissiveIntensity = 0.34;
        }

        mat.needsUpdate = true;
      };

      if (Array.isArray(obj.material)) {
        obj.material.forEach(applyState);
      } else if (obj.material) {
        applyState(obj.material);
      }
    });

    invalidate();
  }, [assetEntry, explorationLevel, selectedPartId, isolateSelected, invalidate, loadVersion]);

  // Animate verified GLB meshes (propeller spin, rudder oscillation, radar scan, chuck/wheel spin)
  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.1);
    const root = loadedRootRef.current;
    if (!root) return;

    if (isPlaying) {
      elapsedRef.current += dt * speedMultiplier;
      const t = elapsedRef.current;
      for (const item of animatedNodesRef.current) {
        const anim = item.part.animation;
        if (!anim) continue;
        item.node.rotation.copy(item.baseRotation);
        const angle =
          anim.type === 'spin'
            ? t * anim.speed
            : Math.sin(t * anim.speed) * (anim.amplitude ?? 0.35);
        if (anim.axis === 'x') item.node.rotation.x += angle;
        if (anim.axis === 'y') item.node.rotation.y += angle;
        if (anim.axis === 'z') item.node.rotation.z += angle;
      }
    }

    // Smooth exploded separation for multi-part GLB nodes
    const targetExplode = isExploded ? 1 : 0;
    if (Math.abs(explodeAmountRef.current - targetExplode) > 0.002) {
      explodeAmountRef.current = THREE.MathUtils.damp(
        explodeAmountRef.current,
        targetExplode,
        8,
        dt,
      );
      for (const entry of explodeNodesRef.current) {
        entry.node.position
          .copy(entry.basePos)
          .addScaledVector(entry.explodeOffset, explodeAmountRef.current);
      }
      if (isSoftwareGl) invalidate();
    }
  });

  // Compute conceptual interior overlay geometry (Level 2 only) from actual normalized bounds
  const overlayElements = useMemo(() => {
    if (
      explorationLevel !== 'internal-structure' ||
      !assetEntry?.illustrativeOverlay ||
      !metricsRef.current
    ) {
      return null;
    }
    const m = metricsRef.current;
    const spanX = m.boxMax[0] - m.boxMin[0];
    const spanY = m.boxMax[1] - m.boxMin[1];
    const spanZ = m.boxMax[2] - m.boxMin[2];

    return assetEntry.illustrativeOverlay.nodes.map((node) => {
      const midFrac: readonly [number, number, number] = [
        (node.boxStartFraction[0] + node.boxEndFraction[0]) / 2,
        (node.boxStartFraction[1] + node.boxEndFraction[1]) / 2,
        (node.boxStartFraction[2] + node.boxEndFraction[2]) / 2,
      ];
      const pos: [number, number, number] = [
        m.boxMin[0] + spanX * midFrac[0],
        m.boxMin[1] + spanY * midFrac[1],
        m.boxMin[2] + spanZ * midFrac[2],
      ];
      const dims: [number, number, number] = [
        Math.max(0.08, spanX * node.boxSizeFraction[0]),
        Math.max(0.08, spanY * node.boxSizeFraction[1]),
        Math.max(0.08, spanZ * node.boxSizeFraction[2]),
      ];
      return { node, pos, dims };
    });
  }, [explorationLevel, assetEntry, selectedPartId, loadVersion]);

  const focusedPart = useMemo(
    () => partsRef.current.find((p) => p.id === selectedPartId) ?? null,
    [selectedPartId, loadVersion],
  );

  // Compute sub-region focus wireframe box when a specific part is highlighted
  const focusReticle = useMemo(() => {
    if (!focusedPart || !metricsRef.current) return null;
    const m = metricsRef.current;
    const partDef = assetEntry?.knownParts.find((kp) => kp.id === focusedPart.id);
    if (partDef?.boundsFraction) {
      return computeSubRegionBounds(m.boxMin, m.boxMax, partDef.boundsFraction);
    }
    return { center: focusedPart.boundsCenter, size: focusedPart.boundsSize };
  }, [focusedPart, assetEntry, loadVersion]);

  const handlePointerClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    const root = loadedRootRef.current;
    if (!root || partsRef.current.length === 0) return;

    const localHit = root.worldToLocal(event.point.clone());
    const matched = resolveClickedObjectToPart(event.object, partsRef.current, localHit);
    if (matched) {
      onSelectPart(matched.id);
    }
  };

  const showCoherentDrivetrain = Boolean(
    metricsRef.current &&
      assetEntry &&
      (assetEntry.id === 'cordless-drill' || assetEntry.id === 'container-ship') &&
      (explorationLevel === 'internal-structure' ||
        (selectedPartId &&
          [
            'motor',
            'gearbox',
            'output-shaft',
            'trigger',
            'battery',
            'engine',
            'coupling',
            'propeller-shaft',
            'water-thrust',
          ].includes(selectedPartId))),
  );

  return (
    <group>
      <group
        ref={containerRef}
        onClick={handlePointerClick}
        onPointerOver={(e) => {
          e.stopPropagation();
          if (typeof document !== 'undefined') {
            document.body.style.cursor = 'pointer';
          }
        }}
        onPointerOut={() => {
          if (typeof document !== 'undefined') {
            document.body.style.cursor = 'auto';
          }
        }}
      />

      {/* Coherent Conceptual Drivetrain Overlay for Cordless Drill & Container Ship */}
      {showCoherentDrivetrain && metricsRef.current && assetEntry && (
        <AssetDrivetrainOverlay3D
          assetId={assetEntry.id}
          metrics={metricsRef.current}
          visible={showCoherentDrivetrain}
          isPlaying={isPlaying}
          speedMultiplier={speedMultiplier}
          selectedPartId={selectedPartId}
          showLabels={showLabels}
          onSelectPart={onSelectPart}
        />
      )}

      {/* Level-2 Conceptual Interior Pathway Overlay for other GLB models (e.g., Family Sedan) */}
      {!showCoherentDrivetrain &&
        overlayElements &&
        overlayElements.map(({ node, pos, dims }) => (
          <mesh key={node.id} position={pos}>
            <boxGeometry args={dims} />
            <meshStandardMaterial
              color={node.color}
              emissive={node.color}
              emissiveIntensity={0.65}
              metalness={0.35}
              roughness={0.35}
              transparent
              opacity={0.78}
            />
          </mesh>
        ))}

      {/* Clean Selection Focus Reticle around active part */}
      {focusReticle && selectedPartId && (
        <mesh position={[focusReticle.center[0], focusReticle.center[1], focusReticle.center[2]]}>
          <boxGeometry
            args={[
              focusReticle.size[0] + 0.08,
              focusReticle.size[1] + 0.08,
              focusReticle.size[2] + 0.08,
            ]}
          />
          <meshBasicMaterial color="#38BDF8" wireframe transparent opacity={0.42} />
        </mesh>
      )}
    </group>
  );
}
