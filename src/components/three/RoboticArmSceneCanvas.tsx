import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  createContactShadowTexture,
  detectSoftwareWebGL,
} from '../../three/proceduralTextures';
import type { RobotSequenceId } from '../../three/robotArmKinematics';
import { Box3CameraRig } from './Box3CameraRig';
import { RoboticArm3D } from './RoboticArm3D';

export interface RoboticArmSceneCanvasProps {
  sequenceId: RobotSequenceId;
  progress: number;
  isPlaying: boolean;
  speedMultiplier: number;
  baseTurnDeg: number;
  isFocusMode?: boolean;
  selectedComponentId: string | null;
  cameraTarget: string | 'overview';
  focusTrigger: number;
  isolateSelected: boolean;
  showLabels: boolean;
  onProgressTick: (nextProgress: number) => void;
  onSelectComponent: (componentId: string) => void;
}

function RobotSceneEnvironment({
  isSoftwareGl,
  isPlaying,
  focusTrigger,
  progress,
  selectedComponentId,
}: {
  isSoftwareGl: boolean;
  isPlaying: boolean;
  focusTrigger: number;
  progress: number;
  selectedComponentId: string | null;
}) {
  const { gl, scene, invalidate } = useThree();

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    scene.background = new THREE.Color('#070A11');
    scene.fog = new THREE.Fog('#070A11', 14, 34);
    return () => {
      scene.environment = null;
      envTarget.dispose();
      roomEnv.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  useEffect(() => {
    invalidate();
  }, [invalidate, focusTrigger, progress, selectedComponentId, isPlaying]);

  useEffect(() => {
    if (!isSoftwareGl || !isPlaying) return undefined;
    const timer = window.setInterval(() => invalidate(), 145);
    return () => window.clearInterval(timer);
  }, [isSoftwareGl, isPlaying, invalidate]);

  return null;
}

function RobotGroundShadow({ isSoftwareGl }: { isSoftwareGl: boolean }) {
  const shadowTex = useMemo(() => createContactShadowTexture(), []);
  useEffect(() => () => shadowTex.dispose(), [shadowTex]);
  return (
    <mesh
      userData={{ excludeFromBounds: true }}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.002, 0]}
      receiveShadow={!isSoftwareGl}
    >
      <planeGeometry args={[5.2, 5.2]} />
      <meshBasicMaterial map={shadowTex} transparent opacity={0.45} depthWrite={false} />
    </mesh>
  );
}

export function RoboticArmSceneCanvas({
  sequenceId,
  progress,
  isPlaying,
  speedMultiplier,
  baseTurnDeg,
  isFocusMode = false,
  selectedComponentId,
  cameraTarget,
  focusTrigger,
  isolateSelected,
  showLabels,
  onProgressTick,
  onSelectComponent,
}: RoboticArmSceneCanvasProps) {
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
      data-testid="robotic-arm-canvas-wrapper"
      className="relative w-full h-full min-h-[260px] select-none"
    >
      <Canvas
        shadows={!capabilities.isSoftwareGl}
        dpr={capabilities.isSoftwareGl ? 1 : [1, 2]}
        frameloop={capabilities.isSoftwareGl ? 'demand' : 'always'}
        camera={{
          position: [4.2, 2.8, 4.4],
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
        <RobotSceneEnvironment
          isSoftwareGl={capabilities.isSoftwareGl}
          isPlaying={isPlaying}
          focusTrigger={focusTrigger}
          progress={progress}
          selectedComponentId={selectedComponentId}
        />

        <hemisphereLight args={['#bae6fd', '#0f172a', 0.8]} />
        <directionalLight
          position={[6, 9, 6]}
          intensity={2.2}
          color="#fff7ed"
          castShadow={!capabilities.isSoftwareGl}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-near={1}
          shadow-camera-far={25}
          shadow-camera-left={-5}
          shadow-camera-right={5}
          shadow-camera-top={5}
          shadow-camera-bottom={-5}
        />
        <directionalLight position={[-6, 4, -5]} intensity={1.1} color="#38bdf8" />

        <RoboticArm3D
          rootRef={modelRootRef}
          sequenceId={sequenceId}
          progress={progress}
          isPlaying={isPlaying}
          speedMultiplier={speedMultiplier}
          baseTurnDeg={baseTurnDeg}
          selectedComponentId={selectedComponentId}
          isolateSelected={isolateSelected}
          showLabels={showLabels}
          isSoftwareGl={capabilities.isSoftwareGl}
          onProgressTick={onProgressTick}
          onSelectComponent={onSelectComponent}
        />

        <RobotGroundShadow isSoftwareGl={capabilities.isSoftwareGl} />
        <gridHelper
          userData={{ excludeFromBounds: true }}
          args={[14, 18, '#1e293b', '#0f172a']}
          position={[0, -0.185, 0]}
        />

        <Box3CameraRig
          targetRootRef={modelRootRef}
          modelKey="robotic-arm"
          cameraTarget={cameraTarget}
          focusTrigger={focusTrigger}
          isFocusMode={isFocusMode}
          isSoftwareGl={capabilities.isSoftwareGl}
          overviewAngles={{ azimuthDeg: 42, elevationDeg: 24 }}
          minDistance={0.95}
          maxDistance={18}
          maxPolarAngle={Math.PI * 0.48}
        />
      </Canvas>

      {contextLost && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#070A11]/90 text-xs text-amber-300">
          WebGL rendering context interrupted. Restoring robotic arm scene...
        </div>
      )}
    </div>
  );
}
