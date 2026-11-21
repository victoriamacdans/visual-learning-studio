import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { GeneratedScene3DSpec } from '../../types/tutor';
import {
  createContactShadowTexture,
  detectSoftwareWebGL,
} from '../../three/proceduralTextures';
import { computeSceneBoundingFraming } from '../../three/universalKinematics';
import { Box3CameraRig } from './Box3CameraRig';
import { DynamicScene3D } from './DynamicScene3D';

export interface DynamicSceneCanvasProps {
  spec: GeneratedScene3DSpec;
  selectedComponentId: string | null;
  cameraFocusTarget: string | 'overview';
  focusTrigger: number;
  isolateSelected: boolean;
  isPlaying: boolean;
  isExploded: boolean;
  isFocusMode?: boolean;
  speedMultiplier: number;
  showConnections: boolean;
  showLabels: boolean;
  onSelectComponent: (id: string) => void;
}

function DynamicSceneEnvironment({
  isSoftwareGl,
  isPlaying,
  focusTrigger,
  selectedComponentId,
  isolateSelected,
  isExploded,
  showConnections,
  showLabels,
  spec,
}: {
  isSoftwareGl: boolean;
  isPlaying: boolean;
  focusTrigger: number;
  selectedComponentId: string | null;
  isolateSelected: boolean;
  isExploded: boolean;
  showConnections: boolean;
  showLabels: boolean;
  spec: GeneratedScene3DSpec;
}) {
  const { gl, scene, invalidate } = useThree();

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmrem.fromScene(roomEnv, 0.04);

    scene.environment = envTarget.texture;
    scene.background = new THREE.Color('#070A11');
    scene.fog = new THREE.Fog('#070A11', 16, 36);

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
    selectedComponentId,
    isolateSelected,
    isExploded,
    showConnections,
    showLabels,
    isPlaying,
    spec,
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

function DynamicGroundStage({
  centerY,
  radius,
  isSoftwareGl,
}: {
  centerY: number;
  radius: number;
  isSoftwareGl: boolean;
}) {
  const shadowTexture = useMemo(() => createContactShadowTexture(), []);

  useEffect(() => {
    return () => {
      shadowTexture.dispose();
    };
  }, [shadowTexture]);

  const groundY = centerY - radius * 0.95 - 0.35;

  return (
    <group position={[0, groundY, 0]} userData={{ excludeFromBounds: true }}>
      <gridHelper args={[20, 24, '#1e293b', '#0f172a']} position={[0, 0.01, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow={!isSoftwareGl}>
        <planeGeometry args={[radius * 4.2, radius * 4.2]} />
        <meshBasicMaterial map={shadowTexture} transparent opacity={0.8} depthWrite={false} />
      </mesh>
    </group>
  );
}

/**
 * Interactive React Three Fiber canvas housing any Gemini-generated 3D educational scene.
 */
export function DynamicSceneCanvas({
  spec,
  selectedComponentId,
  cameraFocusTarget,
  focusTrigger,
  isolateSelected,
  isPlaying,
  isExploded,
  isFocusMode = false,
  speedMultiplier,
  showConnections,
  showLabels,
  onSelectComponent,
}: DynamicSceneCanvasProps) {
  const [capabilities] = useState(() => detectSoftwareWebGL());
  const [contextLost, setContextLost] = useState(false);
  const modelRootRef = useRef<THREE.Group | null>(null);

  const initialFraming = useMemo(
    () => computeSceneBoundingFraming(spec.components, 0),
    [spec.components],
  );

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
          Use the component chips below to inspect {spec.systemTitle}.
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="dynamic-three-canvas-wrapper"
      data-software-gl={capabilities.isSoftwareGl ? 'true' : 'false'}
      className="relative w-full h-full min-h-[260px] select-none"
    >
      <Canvas
        shadows={!capabilities.isSoftwareGl}
        dpr={capabilities.isSoftwareGl ? 1 : [1, 2]}
        frameloop={capabilities.isSoftwareGl ? 'demand' : 'always'}
        camera={{
          position: [...initialFraming.overviewCameraPos],
          fov: 40,
          near: 0.1,
          far: 100,
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
          dom.addEventListener('webglcontextrestored', () => {
            setContextLost(false);
          });
        }}
      >
        <DynamicSceneEnvironment
          isSoftwareGl={capabilities.isSoftwareGl}
          isPlaying={isPlaying}
          focusTrigger={focusTrigger}
          selectedComponentId={selectedComponentId}
          isolateSelected={isolateSelected}
          isExploded={isExploded}
          showConnections={showConnections}
          showLabels={showLabels}
          spec={spec}
        />

        <hemisphereLight args={['#93c5fd', '#0f172a', 0.78]} />
        <directionalLight
          position={[6, 8, 7]}
          intensity={2.2}
          color="#fff7ed"
          castShadow={!capabilities.isSoftwareGl}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <directionalLight position={[-6, 3, -6]} intensity={1.2} color="#38bdf8" />

        <DynamicScene3D
          rootRef={modelRootRef}
          spec={spec}
          selectedComponentId={selectedComponentId}
          isolateSelected={isolateSelected}
          isPlaying={isPlaying}
          isExploded={isExploded}
          speedMultiplier={speedMultiplier}
          showConnections={showConnections}
          showLabels={showLabels}
          isSoftwareGl={capabilities.isSoftwareGl}
          onSelectComponent={onSelectComponent}
        />

        <DynamicGroundStage
          centerY={initialFraming.center[1]}
          radius={initialFraming.radius}
          isSoftwareGl={capabilities.isSoftwareGl}
        />

        <Box3CameraRig
          targetRootRef={modelRootRef}
          modelKey={`dynamic:${spec.systemTitle}:${spec.components.length}`}
          cameraTarget={cameraFocusTarget}
          focusTrigger={focusTrigger}
          isExploded={isExploded}
          isFocusMode={isFocusMode}
          isSoftwareGl={capabilities.isSoftwareGl}
          overviewAngles={{ azimuthDeg: 38, elevationDeg: 22 }}
          minDistance={0.75}
          maxDistance={26}
          maxPolarAngle={Math.PI * 0.9}
        />
      </Canvas>

      {contextLost && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#070A11]/90 text-xs text-amber-300">
          WebGL rendering context interrupted. Restoring 3D scene...
        </div>
      )}
    </div>
  );
}
