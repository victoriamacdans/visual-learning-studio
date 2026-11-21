import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { SixStrokeVariantId } from '../../three/sixStrokeKinematics';
import {
  createContactShadowTexture,
  detectSoftwareWebGL,
} from '../../three/proceduralTextures';
import type { SceneViewMode } from '../../three/sceneController';
import { Box3CameraRig } from './Box3CameraRig';
import { SixStrokeEngine3D } from './SixStrokeEngine3D';

export interface SixStrokeSceneCanvasProps {
  variant: SixStrokeVariantId;
  crankAngleDeg: number;
  isPlaying: boolean;
  speedMultiplier: number;
  viewMode: SceneViewMode;
  isExploded: boolean;
  isFocusMode?: boolean;
  selectedComponentId: string | null;
  cameraTarget: string | 'overview';
  focusTrigger: number;
  isolateSelected: boolean;
  showLabels: boolean;
  onCrankAngleTick: (nextAngleDeg: number) => void;
  onSelectComponent: (componentId: string) => void;
}

function SixStrokeEnvironment({
  isSoftwareGl,
  isPlaying,
  focusTrigger,
  crankAngleDeg,
  selectedComponentId,
  viewMode,
  isExploded,
  variant,
}: {
  isSoftwareGl: boolean;
  isPlaying: boolean;
  focusTrigger: number;
  crankAngleDeg: number;
  selectedComponentId: string | null;
  viewMode: SceneViewMode;
  isExploded: boolean;
  variant: SixStrokeVariantId;
}) {
  const { gl, scene, invalidate } = useThree();

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    scene.background = new THREE.Color('#070A11');
    scene.fog = new THREE.Fog('#070A11', 15, 34);
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
    crankAngleDeg,
    selectedComponentId,
    viewMode,
    isExploded,
    variant,
    isPlaying,
  ]);

  useEffect(() => {
    if (!isSoftwareGl || !isPlaying) return undefined;
    const timer = window.setInterval(() => invalidate(), 145);
    return () => window.clearInterval(timer);
  }, [isSoftwareGl, isPlaying, invalidate]);

  return null;
}

function SixStrokeGround({ isSoftwareGl }: { isSoftwareGl: boolean }) {
  const shadowTex = useMemo(() => createContactShadowTexture(), []);
  useEffect(() => () => shadowTex.dispose(), [shadowTex]);
  return (
    <group position={[0, -1.73, 0]} userData={{ excludeFromBounds: true }}>
      <gridHelper args={[14, 18, '#1e293b', '#0f172a']} position={[0, 0.01, 0]} />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.02, 0]}
        receiveShadow={!isSoftwareGl}
      >
        <planeGeometry args={[5.2, 4.2]} />
        <meshBasicMaterial map={shadowTex} transparent opacity={0.78} depthWrite={false} />
      </mesh>
    </group>
  );
}

/**
 * Interactive R3F viewport for the Single-Cylinder Engine Cutaway (Six-Stroke & Mechanical Baseline)
 * with automatic Box3 framing so the engine occupies ~65-80% of the canvas.
 */
export function SixStrokeSceneCanvas({
  variant,
  crankAngleDeg,
  isPlaying,
  speedMultiplier,
  viewMode,
  isExploded,
  isFocusMode = false,
  selectedComponentId,
  cameraTarget,
  focusTrigger,
  isolateSelected,
  showLabels,
  onCrankAngleTick,
  onSelectComponent,
}: SixStrokeSceneCanvasProps) {
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
      </div>
    );
  }

  return (
    <div
      data-testid="six-stroke-canvas-wrapper"
      data-software-gl={capabilities.isSoftwareGl ? 'true' : 'false'}
      className="relative w-full h-full min-h-[260px] select-none"
    >
      <Canvas
        shadows={!capabilities.isSoftwareGl}
        dpr={capabilities.isSoftwareGl ? 1 : [1, 2]}
        frameloop={capabilities.isSoftwareGl ? 'demand' : 'always'}
        camera={{
          position: [2.8, 1.4, 3.8],
          fov: 38,
          near: 0.08,
          far: 80,
        }}
        gl={{
          antialias: !capabilities.isSoftwareGl,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.16,
        }}
        onCreated={({ gl }) => {
          const dom = gl.domElement;
          dom.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            setContextLost(true);
          });
          dom.addEventListener('webglcontextrestored', () => setContextLost(false));
        }}
      >
        <SixStrokeEnvironment
          isSoftwareGl={capabilities.isSoftwareGl}
          isPlaying={isPlaying}
          focusTrigger={focusTrigger}
          crankAngleDeg={crankAngleDeg}
          selectedComponentId={selectedComponentId}
          viewMode={viewMode}
          isExploded={isExploded}
          variant={variant}
        />

        <hemisphereLight args={['#bae6fd', '#0f172a', 0.85]} />
        <directionalLight
          position={[5, 8, 7]}
          intensity={2.25}
          color="#fff7ed"
          castShadow={!capabilities.isSoftwareGl}
        />
        <directionalLight position={[-6, 3, -5]} intensity={1.15} color="#38bdf8" />

        <SixStrokeEngine3D
          rootRef={modelRootRef}
          variant={variant}
          crankAngleDeg={crankAngleDeg}
          isPlaying={isPlaying}
          speedMultiplier={speedMultiplier}
          viewMode={viewMode}
          isExploded={isExploded}
          selectedComponentId={selectedComponentId}
          isolateSelected={isolateSelected}
          showLabels={showLabels}
          isSoftwareGl={capabilities.isSoftwareGl}
          onCrankAngleTick={onCrankAngleTick}
          onSelectComponent={onSelectComponent}
        />

        <SixStrokeGround isSoftwareGl={capabilities.isSoftwareGl} />

        <Box3CameraRig
          targetRootRef={modelRootRef}
          modelKey={`six-stroke-${variant}`}
          cameraTarget={cameraTarget}
          focusTrigger={focusTrigger}
          isExploded={isExploded}
          isFocusMode={isFocusMode}
          isSoftwareGl={capabilities.isSoftwareGl}
          overviewAngles={{ azimuthDeg: 28, elevationDeg: 16 }}
          getComponentAngles={(compId) =>
            compId === 'water-injector'
              ? { azimuthDeg: 45, elevationDeg: 22 }
              : { azimuthDeg: 24, elevationDeg: 14 }
          }
          minDistance={0.85}
          maxDistance={16}
        />
      </Canvas>

      {contextLost && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#070A11]/90 text-xs text-amber-300">
          WebGL rendering context interrupted. Restoring cutaway engine...
        </div>
      )}
    </div>
  );
}
