import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { ExplorationLevel } from '../../types/tutor';
import type { AssetRegistryEntry } from '../../three/assetRegistry';
import {
  computeBoxCameraPreset,
  type ResolvedGlbPart,
} from '../../three/gltfAssetUtils';
import {
  createContactShadowTexture,
  detectSoftwareWebGL,
} from '../../three/proceduralTextures';
import { AssetModel3D, type LoadedGlbAssetSummary } from './AssetModel3D';

export interface AssetSceneCanvasProps {
  assetEntry: AssetRegistryEntry | null;
  modelUrl: string;
  explorationLevel: ExplorationLevel;
  selectedPartId: string | null;
  cameraFocusTarget: string | 'overview';
  focusTrigger: number;
  isolateSelected: boolean;
  isPlaying: boolean;
  isExploded: boolean;
  isFocusMode?: boolean;
  speedMultiplier: number;
  showLabels?: boolean;
  resolvedParts: readonly ResolvedGlbPart[];
  modelBounds: {
    center: readonly [number, number, number];
    size: readonly [number, number, number];
  } | null;
  onLoadProgress: (percent: number) => void;
  onLoadComplete: (summary: LoadedGlbAssetSummary) => void;
  onLoadError: (message: string) => void;
  onSelectPart: (partId: string) => void;
}

const GOAL_POS = new THREE.Vector3();
const GOAL_TARGET = new THREE.Vector3();

function AssetSceneEnvironment({
  isSoftwareGl,
  isPlaying,
  focusTrigger,
  selectedPartId,
  explorationLevel,
  isolateSelected,
  isExploded,
  modelUrl,
}: {
  isSoftwareGl: boolean;
  isPlaying: boolean;
  focusTrigger: number;
  selectedPartId: string | null;
  explorationLevel: ExplorationLevel;
  isolateSelected: boolean;
  isExploded: boolean;
  modelUrl: string;
}) {
  const { gl, scene, invalidate } = useThree();

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmrem.fromScene(roomEnv, 0.04);

    scene.environment = envTarget.texture;
    scene.background = new THREE.Color('#070A11');
    scene.fog = new THREE.Fog('#070A11', 16, 40);

    return () => {
      scene.environment = null;
      envTarget.dispose();
      roomEnv.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  useEffect(() => {
    invalidate();
  }, [
    invalidate,
    focusTrigger,
    selectedPartId,
    explorationLevel,
    isolateSelected,
    isExploded,
    isPlaying,
    modelUrl,
  ]);

  useEffect(() => {
    if (!isSoftwareGl || !isPlaying) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      invalidate();
    }, 145);
    return () => window.clearInterval(timer);
  }, [isSoftwareGl, isPlaying, invalidate]);

  return null;
}

function AssetCameraRig({
  assetEntry,
  resolvedParts,
  modelBounds,
  cameraFocusTarget,
  focusTrigger,
  isFocusMode,
  isSoftwareGl,
}: {
  assetEntry: AssetRegistryEntry | null;
  resolvedParts: readonly ResolvedGlbPart[];
  modelBounds: {
    center: readonly [number, number, number];
    size: readonly [number, number, number];
  } | null;
  cameraFocusTarget: string | 'overview';
  focusTrigger: number;
  isFocusMode: boolean;
  isSoftwareGl: boolean;
}) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const { camera, size, invalidate } = useThree();
  const isTransitioningRef = useRef(false);
  const initializedModelRef = useRef<string | null>(null);
  const aspect = size.width > 0 && size.height > 0 ? size.width / size.height : 1.35;

  const targetPreset = useMemo(() => {
    if (!modelBounds) {
      return {
        position: [5.4, 2.8, 5.4] as const,
        target: [0, 0.8, 0] as const,
      };
    }

    if (cameraFocusTarget !== 'overview') {
      const part = resolvedParts.find((p) => p.id === cameraFocusTarget);
      if (part) {
        return computeBoxCameraPreset(
          part.boundsCenter,
          part.boundsSize,
          part.cameraFraming,
          38,
          aspect,
          isFocusMode ? 0.72 : 0.66,
        );
      }
    }

    return computeBoxCameraPreset(
      modelBounds.center,
      modelBounds.size,
      assetEntry?.defaultOverviewCamera ?? {
        azimuthDeg: 48,
        elevationDeg: 20,
        distanceScale: 1.55,
      },
      38,
      aspect,
      isFocusMode ? 0.78 : 0.74,
    );
  }, [modelBounds, cameraFocusTarget, resolvedParts, assetEntry, aspect, isFocusMode]);

  useEffect(() => {
    const modelKey = assetEntry?.modelUrl ?? 'custom';
    if (modelBounds && initializedModelRef.current !== modelKey) {
      initializedModelRef.current = modelKey;
      camera.position.set(...targetPreset.position);
      if (controlsRef.current) {
        controlsRef.current.target.set(...targetPreset.target);
        controlsRef.current.update();
      }
      isTransitioningRef.current = false;
      invalidate();
      return;
    }
    if (modelBounds) {
      isTransitioningRef.current = true;
      invalidate();
    }
  }, [modelBounds, targetPreset, focusTrigger, assetEntry?.modelUrl, camera, invalidate]);

  useFrame((_, rawDelta) => {
    const controls = controlsRef.current;
    if (!controls || !isTransitioningRef.current) {
      return;
    }

    const delta = Math.min(rawDelta, 0.08);
    GOAL_POS.set(...targetPreset.position);
    GOAL_TARGET.set(...targetPreset.target);

    const lambda = isSoftwareGl ? 10 : 6.4;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, GOAL_POS.x, lambda, delta);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, GOAL_POS.y, lambda, delta);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, GOAL_POS.z, lambda, delta);

    controls.target.x = THREE.MathUtils.damp(controls.target.x, GOAL_TARGET.x, lambda, delta);
    controls.target.y = THREE.MathUtils.damp(controls.target.y, GOAL_TARGET.y, lambda, delta);
    controls.target.z = THREE.MathUtils.damp(controls.target.z, GOAL_TARGET.z, lambda, delta);

    controls.update();
    if (isSoftwareGl) {
      invalidate();
    }

    if (
      camera.position.distanceTo(GOAL_POS) < 0.03 &&
      controls.target.distanceTo(GOAL_TARGET) < 0.02
    ) {
      camera.position.copy(GOAL_POS);
      controls.target.copy(GOAL_TARGET);
      controls.update();
      isTransitioningRef.current = false;
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableRotate
      enableZoom
      enablePan
      enableDamping={!isSoftwareGl}
      dampingFactor={0.08}
      minDistance={0.55}
      maxDistance={26}
      maxPolarAngle={Math.PI * 0.92}
      onStart={() => {
        isTransitioningRef.current = false;
      }}
      onChange={() => {
        if (isSoftwareGl) {
          invalidate();
        }
      }}
    />
  );
}

function AssetGroundStage({
  size,
  isSoftwareGl,
}: {
  size: readonly [number, number, number] | null;
  isSoftwareGl: boolean;
}) {
  const shadowTexture = useMemo(() => createContactShadowTexture(), []);

  useEffect(() => {
    return () => {
      shadowTexture.dispose();
    };
  }, [shadowTexture]);

  const spanX = size ? Math.max(4, size[0] * 1.4) : 6;
  const spanZ = size ? Math.max(4, size[2] * 1.35) : 6;

  return (
    <group position={[0, 0, 0]}>
      <gridHelper args={[20, 24, '#1e293b', '#0f172a']} position={[0, 0.004, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} receiveShadow={!isSoftwareGl}>
        <planeGeometry args={[spanX, spanZ]} />
        <meshBasicMaterial map={shadowTexture} transparent opacity={0.76} depthWrite={false} />
      </mesh>
    </group>
  );
}

/**
 * Interactive R3F viewport for realistic PBR GLB/glTF 3D assets.
 */
export function AssetSceneCanvas({
  assetEntry,
  modelUrl,
  explorationLevel,
  selectedPartId,
  cameraFocusTarget,
  focusTrigger,
  isolateSelected,
  isPlaying,
  isExploded,
  isFocusMode = false,
  speedMultiplier,
  showLabels = false,
  resolvedParts,
  modelBounds,
  onLoadProgress,
  onLoadComplete,
  onLoadError,
  onSelectPart,
}: AssetSceneCanvasProps) {
  const [capabilities] = useState(() => detectSoftwareWebGL());
  const [contextLost, setContextLost] = useState(false);

  if (!capabilities.supported) {
    return (
      <div
        role="status"
        className="w-full h-full min-h-[240px] flex flex-col items-center justify-center text-center p-6 bg-[#070A11] text-slate-300"
      >
        <p className="text-sm font-semibold text-slate-100">
          3D WebGL viewport unavailable in this browser environment
        </p>
        <p className="text-xs text-slate-400 mt-1 max-w-md">
          Use the component hierarchy controls below to inspect {assetEntry?.name ?? 'this 3D asset'}.
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="asset-three-canvas-wrapper"
      data-software-gl={capabilities.isSoftwareGl ? 'true' : 'false'}
      className="relative w-full h-full min-h-[260px] select-none"
    >
      <Canvas
        shadows={!capabilities.isSoftwareGl}
        dpr={capabilities.isSoftwareGl ? 1 : [1, 2]}
        frameloop={capabilities.isSoftwareGl ? 'demand' : 'always'}
        camera={{
          position: [5.4, 2.8, 5.4],
          fov: 38,
          near: 0.08,
          far: 120,
        }}
        gl={{
          antialias: !capabilities.isSoftwareGl,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.18,
        }}
        onCreated={({ gl }) => {
          const dom = gl.domElement;
          dom.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            setContextLost(true);
          });
          dom.addEventListener('webglcontextrestored', () => {
            setContextLost(false);
          });
        }}
      >
        <AssetSceneEnvironment
          isSoftwareGl={capabilities.isSoftwareGl}
          isPlaying={isPlaying}
          focusTrigger={focusTrigger}
          selectedPartId={selectedPartId}
          explorationLevel={explorationLevel}
          isolateSelected={isolateSelected}
          isExploded={isExploded}
          modelUrl={modelUrl}
        />

        {/* Calibrated Engineering 3-Point + Under-Hull Lighting Rig */}
        <hemisphereLight args={['#bae6fd', '#0f172a', 0.85]} />
        <directionalLight
          position={[7, 9, 8]}
          intensity={2.3}
          color="#fff7ed"
          castShadow={!capabilities.isSoftwareGl}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-bias={-0.0004}
          shadow-camera-near={1}
          shadow-camera-far={28}
          shadow-camera-left={-6}
          shadow-camera-right={6}
          shadow-camera-top={6}
          shadow-camera-bottom={-6}
        />
        <directionalLight position={[-7, 4, -7]} intensity={1.2} color="#38bdf8" />
        <directionalLight position={[3, -3, -7]} intensity={0.72} color="#e0f2fe" />

        <AssetModel3D
          assetEntry={assetEntry}
          modelUrl={modelUrl}
          explorationLevel={explorationLevel}
          selectedPartId={selectedPartId}
          isolateSelected={isolateSelected}
          isPlaying={isPlaying}
          isExploded={isExploded}
          speedMultiplier={speedMultiplier}
          isSoftwareGl={capabilities.isSoftwareGl}
          showLabels={showLabels}
          onLoadProgress={onLoadProgress}
          onLoadComplete={onLoadComplete}
          onLoadError={onLoadError}
          onSelectPart={onSelectPart}
        />

        <AssetGroundStage
          size={modelBounds?.size ?? null}
          isSoftwareGl={capabilities.isSoftwareGl}
        />

        <AssetCameraRig
          assetEntry={assetEntry}
          resolvedParts={resolvedParts}
          modelBounds={modelBounds}
          cameraFocusTarget={cameraFocusTarget}
          focusTrigger={focusTrigger}
          isFocusMode={isFocusMode}
          isSoftwareGl={capabilities.isSoftwareGl}
        />
      </Canvas>

      {contextLost && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#070A11]/90 text-xs text-amber-300">
          WebGL rendering context interrupted. Restoring 3D asset...
        </div>
      )}
    </div>
  );
}
