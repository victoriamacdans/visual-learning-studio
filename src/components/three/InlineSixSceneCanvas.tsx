import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  createContactShadowTexture,
  detectSoftwareWebGL,
} from '../../three/proceduralTextures';
import type { SceneViewMode } from '../../three/sceneController';
import { Box3CameraRig } from './Box3CameraRig';
import { InlineSixEngine3D } from './InlineSixEngine3D';

export interface InlineSixSceneCanvasProps {
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

function InlineSixEnvironment({
  isSoftwareGl,
  isPlaying,
  focusTrigger,
  crankAngleDeg,
  selectedComponentId,
  viewMode,
  isExploded,
}: {
  isSoftwareGl: boolean;
  isPlaying: boolean;
  focusTrigger: number;
  crankAngleDeg: number;
  selectedComponentId: string | null;
  viewMode: SceneViewMode;
  isExploded: boolean;
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
  }, [invalidate, focusTrigger, crankAngleDeg, selectedComponentId, viewMode, isExploded, isPlaying]);

  useEffect(() => {
    if (!isSoftwareGl || !isPlaying) return undefined;
    const timer = window.setInterval(() => invalidate(), 145);
    return () => window.clearInterval(timer);
  }, [isSoftwareGl, isPlaying, invalidate]);

  return null;
}

function InlineSixGround({ isSoftwareGl }: { isSoftwareGl: boolean }) {
  const shadowTex = useMemo(() => createContactShadowTexture(), []);
  useEffect(() => () => shadowTex.dispose(), [shadowTex]);
  return (
    <group position={[0, -1.55, 0]} userData={{ excludeFromBounds: true }}>
      <gridHelper args={[16, 20, '#1e293b', '#0f172a']} position={[0, 0.01, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow={!isSoftwareGl}>
        <planeGeometry args={[7.5, 4.2]} />
        <meshBasicMaterial map={shadowTex} transparent opacity={0.78} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function InlineSixSceneCanvas({
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
}: InlineSixSceneCanvasProps) {
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
      data-testid="inline-six-canvas-wrapper"
      className="relative w-full h-full min-h-[260px] select-none"
    >
      <Canvas
        shadows={!capabilities.isSoftwareGl}
        dpr={capabilities.isSoftwareGl ? 1 : [1, 2]}
        frameloop={capabilities.isSoftwareGl ? 'demand' : 'always'}
        camera={{
          position: [4.2, 2.1, 4.8],
          fov: 38,
          near: 0.08,
          far: 80,
        }}
        gl={{
          antialias: !capabilities.isSoftwareGl,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.15,
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
        <InlineSixEnvironment
          isSoftwareGl={capabilities.isSoftwareGl}
          isPlaying={isPlaying}
          focusTrigger={focusTrigger}
          crankAngleDeg={crankAngleDeg}
          selectedComponentId={selectedComponentId}
          viewMode={viewMode}
          isExploded={isExploded}
        />

        <hemisphereLight args={['#bae6fd', '#0f172a', 0.8]} />
        <directionalLight
          position={[6, 8, 7]}
          intensity={2.2}
          color="#fff7ed"
          castShadow={!capabilities.isSoftwareGl}
        />
        <directionalLight position={[-6, 4, -6]} intensity={1.15} color="#38bdf8" />

        <InlineSixEngine3D
          rootRef={modelRootRef}
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

        <InlineSixGround isSoftwareGl={capabilities.isSoftwareGl} />

        <Box3CameraRig
          targetRootRef={modelRootRef}
          modelKey="inline-six"
          cameraTarget={cameraTarget}
          focusTrigger={focusTrigger}
          isExploded={isExploded}
          isFocusMode={isFocusMode}
          isSoftwareGl={capabilities.isSoftwareGl}
          overviewAngles={{ azimuthDeg: 40, elevationDeg: 21 }}
          getComponentAngles={(compId) =>
            compId === 'exhaust-manifold'
              ? { azimuthDeg: 145, elevationDeg: 20 }
              : compId === 'intake-manifold'
                ? { azimuthDeg: 32, elevationDeg: 22 }
                : { azimuthDeg: 26, elevationDeg: 18 }
          }
          minDistance={1.0}
          maxDistance={18}
        />
      </Canvas>

      {contextLost && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#070A11]/90 text-xs text-amber-300">
          WebGL rendering context interrupted. Restoring inline-six engine...
        </div>
      )}
    </div>
  );
}
