import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { VisualizationLayerMode } from '../../config/appConfig';
import type { EngineComponentId } from '../../types/tutor';
import { OVERVIEW_CAMERA_PRESET } from '../../three/engineConfig';
import {
  createContactShadowTexture,
  detectSoftwareWebGL,
} from '../../three/proceduralTextures';
import { Box3CameraRig } from './Box3CameraRig';
import { TurbofanEngine3D } from './TurbofanEngine3D';

export interface EngineSceneCanvasProps {
  selectedStageId: EngineComponentId;
  cameraFocusMode: EngineComponentId | 'overview';
  focusTrigger: number;
  layerMode: VisualizationLayerMode;
  throttlePercent: number;
  isPlaying: boolean;
  isExploded: boolean;
  isFocusMode?: boolean;
  onSelectStage: (stageId: EngineComponentId) => void;
}

function SceneEnvironment({
  isSoftwareGl,
  isPlaying,
  focusTrigger,
  selectedStageId,
  layerMode,
  isExploded,
  throttlePercent,
}: {
  isSoftwareGl: boolean;
  isPlaying: boolean;
  focusTrigger: number;
  selectedStageId: EngineComponentId;
  layerMode: VisualizationLayerMode;
  isExploded: boolean;
  throttlePercent: number;
}) {
  const { gl, scene, invalidate } = useThree();

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmrem.fromScene(roomEnv, 0.04);

    scene.environment = envTarget.texture;
    scene.background = new THREE.Color('#070A11');
    scene.fog = new THREE.Fog('#070A11', 15, 30);

    return () => {
      scene.environment = null;
      envTarget.dispose();
      roomEnv.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  // Trigger demand renders cleanly on prop updates
  useEffect(() => {
    invalidate();
  }, [
    invalidate,
    focusTrigger,
    selectedStageId,
    layerMode,
    isExploded,
    throttlePercent,
    isPlaying,
  ]);

  // On SwiftShader CPU rendering, pace demand frames (~7 FPS) so animations stay smooth
  // without saturating the headless Chromium main thread.
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

function GroundStage({ isSoftwareGl }: { isSoftwareGl: boolean }) {
  const shadowTexture = useMemo(() => createContactShadowTexture(), []);

  useEffect(() => {
    return () => {
      shadowTexture.dispose();
    };
  }, [shadowTexture]);

  return (
    <group position={[0, -1.94, 0]} userData={{ excludeFromBounds: true }}>
      <gridHelper args={[18, 22, '#1e293b', '#0f172a']} position={[0, 0.01, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow={!isSoftwareGl}>
        <planeGeometry args={[10.5, 4.8]} />
        <meshBasicMaterial map={shadowTexture} transparent opacity={0.85} depthWrite={false} />
      </mesh>
    </group>
  );
}

/**
 * Interactive React Three Fiber canvas housing the 3D Turbofan Engine scene.
 */
export function EngineSceneCanvas({
  selectedStageId,
  cameraFocusMode,
  focusTrigger,
  layerMode,
  throttlePercent,
  isPlaying,
  isExploded,
  isFocusMode = false,
  onSelectStage,
}: EngineSceneCanvasProps) {
  const [capabilities] = useState(() => detectSoftwareWebGL());
  const [contextLost, setContextLost] = useState(false);
  const modelRootRef = useRef<THREE.Group | null>(null);

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
          Use the stage selector buttons below to inspect each turbofan component.
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="three-canvas-wrapper"
      data-software-gl={capabilities.isSoftwareGl ? 'true' : 'false'}
      className="relative w-full h-full min-h-[240px] select-none"
    >
      <Canvas
        shadows={!capabilities.isSoftwareGl}
        dpr={capabilities.isSoftwareGl ? 1 : [1, 2]}
        frameloop={capabilities.isSoftwareGl ? 'demand' : 'always'}
        camera={{
          position: [...OVERVIEW_CAMERA_PRESET.position],
          fov: 38,
          near: 0.1,
          far: 80,
        }}
        gl={{
          antialias: !capabilities.isSoftwareGl,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.12,
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
        <SceneEnvironment
          isSoftwareGl={capabilities.isSoftwareGl}
          isPlaying={isPlaying}
          focusTrigger={focusTrigger}
          selectedStageId={selectedStageId}
          layerMode={layerMode}
          isExploded={isExploded}
          throttlePercent={throttlePercent}
        />

        {/* 3-Point Aerospace Lighting Rig */}
        <hemisphereLight args={['#93c5fd', '#0f172a', 0.72]} />
        <directionalLight
          position={[6, 8, 7]}
          intensity={2.25}
          color="#fff7ed"
          castShadow={!capabilities.isSoftwareGl}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-near={1}
          shadow-camera-far={25}
          shadow-camera-left={-6}
          shadow-camera-right={6}
          shadow-camera-top={4}
          shadow-camera-bottom={-4}
        />
        <directionalLight position={[-6, 3, -6]} intensity={1.15} color="#38bdf8" />

        <TurbofanEngine3D
          rootRef={modelRootRef}
          selectedStageId={selectedStageId}
          layerMode={layerMode}
          throttlePercent={throttlePercent}
          isPlaying={isPlaying}
          isExploded={isExploded}
          isSoftwareGl={capabilities.isSoftwareGl}
          onSelectStage={onSelectStage}
        />

        <GroundStage isSoftwareGl={capabilities.isSoftwareGl} />

        <Box3CameraRig
          targetRootRef={modelRootRef}
          modelKey="turbofan"
          cameraTarget={cameraFocusMode}
          focusTrigger={focusTrigger}
          isExploded={isExploded}
          isFocusMode={isFocusMode}
          isSoftwareGl={capabilities.isSoftwareGl}
          overviewAngles={{ azimuthDeg: 32, elevationDeg: 18 }}
          getComponentAngles={(compId) =>
            compId === 'intake'
              ? { azimuthDeg: -48, elevationDeg: 16 }
              : compId === 'nozzle'
                ? { azimuthDeg: 58, elevationDeg: 16 }
                : { azimuthDeg: 28, elevationDeg: 18 }
          }
          minDistance={1.4}
          maxDistance={18}
        />
      </Canvas>

      {contextLost && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#070A11]/90 text-xs text-amber-300">
          WebGL rendering context interrupted. Restoring 3D engine...
        </div>
      )}
    </div>
  );
}
