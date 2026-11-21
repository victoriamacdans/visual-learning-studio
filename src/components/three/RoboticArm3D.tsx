import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import {
  evaluateRobotArmSequence,
  ROBOT_ARM_DIMENSIONS,
  type RobotSequenceId,
} from '../../three/robotArmKinematics';

export interface RoboticArm3DProps {
  rootRef?: RefObject<THREE.Group | null>;
  sequenceId: RobotSequenceId;
  progress: number;
  isPlaying: boolean;
  speedMultiplier: number;
  baseTurnDeg: number;
  selectedComponentId: string | null;
  isolateSelected: boolean;
  showLabels: boolean;
  isSoftwareGl: boolean;
  onProgressTick: (nextProgress: number) => void;
  onSelectComponent: (componentId: string) => void;
}

const SEQUENCE_DURATION_SEC: Record<RobotSequenceId, number> = {
  'sequence-a-pick-place': 13.5,
  'sequence-b-cut': 10.5,
};

function partEmissive(
  componentId: string,
  selectedId: string | null,
  fallbackHex = '#000000',
  fallbackIntensity = 0,
): { color: string; intensity: number } {
  if (selectedId === componentId) {
    return { color: '#38BDF8', intensity: 0.48 };
  }
  return { color: fallbackHex, intensity: fallbackIntensity };
}

function partOpacity(componentId: string, selectedId: string | null, isolate: boolean): number {
  if (!isolate || !selectedId) return 1;
  return selectedId === componentId ? 1 : 0.16;
}

/**
 * Interactive articulated industrial robotic arm + dual tooling + splittable apple scene.
 */
export function RoboticArm3D({
  rootRef,
  sequenceId,
  progress,
  isPlaying,
  speedMultiplier,
  baseTurnDeg,
  selectedComponentId,
  isolateSelected,
  showLabels,
  isSoftwareGl,
  onProgressTick,
  onSelectComponent,
}: RoboticArm3DProps) {
  const localProgressRef = useRef(progress);
  const lastReportRef = useRef(progress);

  // Keep ref aligned when scrubbed externally or sequence changes
  if (Math.abs(localProgressRef.current - progress) > 0.025 || !isPlaying) {
    localProgressRef.current = progress;
  }

  // Group refs for smooth direct frame updates without React re-render overhead
  const baseYawRef = useRef<THREE.Group>(null);
  const shoulderPitchRef = useRef<THREE.Group>(null);
  const elbowPitchRef = useRef<THREE.Group>(null);
  const wristPitchRef = useRef<THREE.Group>(null);
  const wristRollRef = useRef<THREE.Group>(null);
  const leftJawRef = useRef<THREE.Group>(null);
  const rightJawRef = useRef<THREE.Group>(null);
  const appleGroupRef = useRef<THREE.Group>(null);
  const appleLeftHalfRef = useRef<THREE.Group>(null);
  const appleRightHalfRef = useRef<THREE.Group>(null);

  // Custom curved apple profile lathe halves (left & right hemispheres)
  const { leftAppleGeo, rightAppleGeo, leafGeo, turnArcGeo, turnArcMat, turnArcLine } = useMemo(() => {
    const r = ROBOT_ARM_DIMENSIONS.appleRadius;
    const pts: THREE.Vector2[] = [];
    const steps = 18;
    for (let i = 0; i <= steps; i += 1) {
      const t = (i / steps) * Math.PI;
      // Organic apple silhouette: indented stem top & bottom dimple, wider shoulder
      const sinT = Math.sin(t);
      const cosT = Math.cos(t);
      const radius = r * sinT * (1.02 + 0.14 * Math.sin(t * 1.15 - 0.3));
      const y = -r * cosT * (0.94 - 0.16 * Math.pow(Math.abs(cosT), 3));
      pts.push(new THREE.Vector2(Math.max(0.002, radius), y));
    }

    const leftGeo = new THREE.LatheGeometry(pts, 20, Math.PI * 0.5, Math.PI);
    const rightGeo = new THREE.LatheGeometry(pts, 20, -Math.PI * 0.5, Math.PI);

    const leafShape = new THREE.Shape();
    leafShape.moveTo(0, 0);
    leafShape.quadraticCurveTo(0.045, 0.05, 0.095, 0.02);
    leafShape.quadraticCurveTo(0.045, -0.02, 0, 0);
    const leaf = new THREE.ExtrudeGeometry(leafShape, { depth: 0.008, bevelEnabled: false });

    const arcPts: THREE.Vector3[] = [];
    const turnRad = (baseTurnDeg * Math.PI) / 180;
    const segs = 28;
    for (let i = 0; i <= segs; i += 1) {
      const a = (i / segs) * turnRad;
      arcPts.push(
        new THREE.Vector3(
          ROBOT_ARM_DIMENSIONS.pickupRadius * Math.cos(a),
          0.015,
          ROBOT_ARM_DIMENSIONS.pickupRadius * Math.sin(a),
        ),
      );
    }
    const arc = new THREE.BufferGeometry().setFromPoints(arcPts);
    const arcMat = new THREE.LineBasicMaterial({
      color: '#38BDF8',
      transparent: true,
      opacity: 0.45,
    });
    const arcLine = new THREE.Line(arc, arcMat);

    return {
      leftAppleGeo: leftGeo,
      rightAppleGeo: rightGeo,
      leafGeo: leaf,
      turnArcGeo: arc,
      turnArcMat: arcMat,
      turnArcLine: arcLine,
    };
  }, [baseTurnDeg]);

  useEffect(() => {
    return () => {
      leftAppleGeo.dispose();
      rightAppleGeo.dispose();
      leafGeo.dispose();
      turnArcGeo.dispose();
      turnArcMat.dispose();
    };
  }, [leftAppleGeo, rightAppleGeo, leafGeo, turnArcGeo, turnArcMat]);

  // Apply kinematic pose cleanly on every frame
  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.08);
    if (isPlaying) {
      const dur = SEQUENCE_DURATION_SEC[sequenceId];
      localProgressRef.current = (localProgressRef.current + (dt * speedMultiplier) / dur) % 1;
      if (Math.abs(localProgressRef.current - lastReportRef.current) > 0.014) {
        lastReportRef.current = localProgressRef.current;
        onProgressTick(localProgressRef.current);
      }
    }

    const pose = evaluateRobotArmSequence(
      sequenceId,
      localProgressRef.current,
      baseTurnDeg,
    );

    if (baseYawRef.current) {
      baseYawRef.current.rotation.y = -pose.joints.baseYawRad;
    }
    if (shoulderPitchRef.current) {
      shoulderPitchRef.current.rotation.z = -pose.joints.shoulderPitchRad;
    }
    if (elbowPitchRef.current) {
      elbowPitchRef.current.rotation.z = -pose.joints.elbowPitchRad;
    }
    if (wristPitchRef.current) {
      wristPitchRef.current.rotation.z = -pose.joints.wristPitchRad;
    }
    if (wristRollRef.current) {
      wristRollRef.current.rotation.y = pose.joints.wristRollRad;
    }

    const jawOffset = 0.08 + pose.gripperOpenAmount * 0.14;
    if (leftJawRef.current) leftJawRef.current.position.z = -jawOffset;
    if (rightJawRef.current) rightJawRef.current.position.z = jawOffset;

    if (appleGroupRef.current) {
      appleGroupRef.current.position.set(
        pose.applePosition[0],
        pose.applePosition[1],
        pose.applePosition[2],
      );
      appleGroupRef.current.rotation.y = -pose.appleYawRad;
    }

    const splitOffset = pose.appleSplitProgress * 0.17;
    const splitTilt = pose.appleSplitProgress * 0.24;
    if (appleLeftHalfRef.current) {
      appleLeftHalfRef.current.position.z = -splitOffset;
      appleLeftHalfRef.current.rotation.x = -splitTilt;
    }
    if (appleRightHalfRef.current) {
      appleRightHalfRef.current.position.z = splitOffset;
      appleRightHalfRef.current.rotation.x = splitTilt;
    }
  });

  const handleClick = (id: string) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelectComponent(id);
  };

  const dims = ROBOT_ARM_DIMENSIONS;
  const poseNow = evaluateRobotArmSequence(sequenceId, progress, baseTurnDeg);
  const isCutterActive = sequenceId === 'sequence-b-cut';

  return (
    <group ref={rootRef} name="robotic-arm-root">
      {/* Calibrated Worktable & Placement Pads */}
      <group userData={{ componentId: 'worktable' }} onClick={handleClick('worktable')}>
        <mesh position={[0, -0.09, 0]} receiveShadow={!isSoftwareGl}>
          <boxGeometry args={[5.4, 0.18, 5.4]} />
          <meshStandardMaterial
            color="#1E293B"
            metalness={0.45}
            roughness={0.55}
            emissive={partEmissive('worktable', selectedComponentId).color}
            emissiveIntensity={partEmissive('worktable', selectedComponentId).intensity * 0.4}
            transparent={isolateSelected && selectedComponentId !== 'worktable'}
            opacity={partOpacity('worktable', selectedComponentId, isolateSelected)}
          />
        </mesh>
        {/* Table metallic rim */}
        <mesh position={[0, -0.1, 0]}>
          <boxGeometry args={[5.54, 0.14, 5.54]} />
          <meshStandardMaterial color="#334155" metalness={0.82} roughness={0.28} />
        </mesh>

        {/* Pickup Pad (0 deg) */}
        <mesh position={[dims.pickupRadius, 0.008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.22, 0.34, 32]} />
          <meshStandardMaterial
            color="#38BDF8"
            emissive="#0284C7"
            emissiveIntensity={0.6}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* Target Placement Pad (Base Turn Target) */}
        <mesh
          position={[poseNow.targetPadPosition[0], 0.008, poseNow.targetPadPosition[2]]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[0.22, 0.34, 32]} />
          <meshStandardMaterial
            color="#10B981"
            emissive="#059669"
            emissiveIntensity={0.65}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* 90-degree Turn Arc Indicator */}
        {sequenceId === 'sequence-a-pick-place' && (
          <primitive object={turnArcLine} />
        )}

        {/* Tool Rack Standby on Back-Left Table Corner */}
        <group position={[-1.95, 0.09, -1.95]}>
          <mesh>
            <boxGeometry args={[0.45, 0.18, 0.45]} />
            <meshStandardMaterial color="#0F172A" metalness={0.7} roughness={0.35} />
          </mesh>
          {/* Standby Cutter when Gripper is active, or Standby Gripper when Cutter is active */}
          {!isCutterActive ? (
            <group position={[0, 0.22, 0]} onClick={handleClick('cutter')}>
              <mesh>
                <cylinderGeometry args={[0.07, 0.09, 0.14, 16]} />
                <meshStandardMaterial color="#94A3B8" metalness={0.85} roughness={0.22} />
              </mesh>
              <mesh position={[0, 0.14, 0]}>
                <boxGeometry args={[0.22, 0.14, 0.018]} />
                <meshStandardMaterial color="#E2E8F0" metalness={0.95} roughness={0.12} />
              </mesh>
            </group>
          ) : (
            <group position={[0, 0.18, 0]} onClick={handleClick('gripper')}>
              <mesh>
                <boxGeometry args={[0.22, 0.08, 0.28]} />
                <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.25} />
              </mesh>
            </group>
          )}
        </group>
      </group>

      {/* Fixed Base Pedestal */}
      <group userData={{ componentId: 'base' }} onClick={handleClick('base')}>
        <mesh position={[0, 0.14, 0]} castShadow={!isSoftwareGl}>
          <cylinderGeometry args={[0.48, 0.56, 0.28, 32]} />
          <meshStandardMaterial
            color="#334155"
            metalness={0.78}
            roughness={0.32}
            emissive={partEmissive('base', selectedComponentId).color}
            emissiveIntensity={partEmissive('base', selectedComponentId).intensity}
            transparent={isolateSelected && selectedComponentId !== 'base'}
            opacity={partOpacity('base', selectedComponentId, isolateSelected)}
          />
        </mesh>
        {/* Base bolt ring */}
        <mesh position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.62, 0.64, 0.04, 24]} />
          <meshStandardMaterial color="#0F172A" metalness={0.85} roughness={0.28} />
        </mesh>
      </group>

      {/* J1: Rotating Base Yaw Turret */}
      <group ref={baseYawRef}>
        <group userData={{ componentId: 'base' }} onClick={handleClick('base')}>
          <mesh position={[0, 0.42, 0]} castShadow={!isSoftwareGl}>
            <cylinderGeometry args={[0.38, 0.44, 0.3, 32]} />
            <meshStandardMaterial
              color="#EA580C"
              metalness={0.42}
              roughness={0.32}
              emissive={partEmissive('base', selectedComponentId).color}
              emissiveIntensity={partEmissive('base', selectedComponentId).intensity}
              transparent={isolateSelected && selectedComponentId !== 'base'}
              opacity={partOpacity('base', selectedComponentId, isolateSelected)}
            />
          </mesh>
          {/* Turret Servo Ring */}
          <mesh position={[0, 0.29, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.43, 0.035, 12, 32]} />
            <meshStandardMaterial color="#38BDF8" metalness={0.8} roughness={0.22} />
          </mesh>
        </group>

        {/* Shoulder Clevis Yoke */}
        <group position={[0, dims.shoulderHeight, 0]}>
          <group userData={{ componentId: 'shoulder' }} onClick={handleClick('shoulder')}>
            <mesh rotation={[Math.PI / 2, 0, 0]} castShadow={!isSoftwareGl}>
              <cylinderGeometry args={[0.25, 0.25, 0.52, 28]} />
              <meshStandardMaterial
                color="#1E293B"
                metalness={0.84}
                roughness={0.24}
                emissive={partEmissive('shoulder', selectedComponentId).color}
                emissiveIntensity={partEmissive('shoulder', selectedComponentId).intensity}
                transparent={isolateSelected && selectedComponentId !== 'shoulder'}
                opacity={partOpacity('shoulder', selectedComponentId, isolateSelected)}
              />
            </mesh>
            <mesh position={[0, 0, 0.28]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.16, 0.16, 0.08, 24]} />
              <meshStandardMaterial color="#94A3B8" metalness={0.9} roughness={0.18} />
            </mesh>
          </group>

          {/* J2: Shoulder Pitch Pivot */}
          <group ref={shoulderPitchRef}>
            {/* Upper Arm Link (vertical +Y from shoulder up to upperArmLength) */}
            <group userData={{ componentId: 'upper-arm' }} onClick={handleClick('upper-arm')}>
              <mesh position={[0, dims.upperArmLength / 2, 0]} castShadow={!isSoftwareGl}>
                <boxGeometry args={[0.26, dims.upperArmLength, 0.28]} />
                <meshStandardMaterial
                  color="#F97316"
                  metalness={0.38}
                  roughness={0.3}
                  emissive={partEmissive('upper-arm', selectedComponentId).color}
                  emissiveIntensity={partEmissive('upper-arm', selectedComponentId).intensity}
                  transparent={isolateSelected && selectedComponentId !== 'upper-arm'}
                  opacity={partOpacity('upper-arm', selectedComponentId, isolateSelected)}
                />
              </mesh>
              {/* Structural spine rib */}
              <mesh position={[-0.14, dims.upperArmLength / 2, 0]}>
                <boxGeometry args={[0.05, dims.upperArmLength * 0.78, 0.16]} />
                <meshStandardMaterial color="#334155" metalness={0.85} roughness={0.25} />
              </mesh>
            </group>

            {/* Elbow Joint Pivot at Y = upperArmLength */}
            <group position={[0, dims.upperArmLength, 0]}>
              <group userData={{ componentId: 'elbow' }} onClick={handleClick('elbow')}>
                <mesh rotation={[Math.PI / 2, 0, 0]} castShadow={!isSoftwareGl}>
                  <cylinderGeometry args={[0.2, 0.2, 0.42, 26]} />
                  <meshStandardMaterial
                    color="#1E293B"
                    metalness={0.85}
                    roughness={0.22}
                    emissive={partEmissive('elbow', selectedComponentId).color}
                    emissiveIntensity={partEmissive('elbow', selectedComponentId).intensity}
                    transparent={isolateSelected && selectedComponentId !== 'elbow'}
                    opacity={partOpacity('elbow', selectedComponentId, isolateSelected)}
                  />
                </mesh>
                <mesh position={[0, 0, 0.22]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.12, 0.12, 0.06, 20]} />
                  <meshStandardMaterial color="#CBD5E1" metalness={0.9} roughness={0.18} />
                </mesh>
              </group>

              {/* J3: Elbow Pitch Pivot */}
              <group ref={elbowPitchRef}>
                {/* Forearm Link */}
                <group userData={{ componentId: 'forearm' }} onClick={handleClick('forearm')}>
                  <mesh position={[0, dims.forearmLength / 2, 0]} castShadow={!isSoftwareGl}>
                    <cylinderGeometry args={[0.12, 0.15, dims.forearmLength, 24]} />
                    <meshStandardMaterial
                      color="#EA580C"
                      metalness={0.4}
                      roughness={0.32}
                      emissive={partEmissive('forearm', selectedComponentId).color}
                      emissiveIntensity={partEmissive('forearm', selectedComponentId).intensity}
                      transparent={isolateSelected && selectedComponentId !== 'forearm'}
                      opacity={partOpacity('forearm', selectedComponentId, isolateSelected)}
                    />
                  </mesh>
                  {/* Pneumatic / sensor cable conduit along forearm */}
                  <mesh position={[-0.14, dims.forearmLength * 0.48, 0.06]}>
                    <cylinderGeometry args={[0.024, 0.024, dims.forearmLength * 0.85, 10]} />
                    <meshStandardMaterial color="#0F172A" metalness={0.2} roughness={0.7} />
                  </mesh>
                </group>

                {/* Wrist Pivot at Y = forearmLength */}
                <group position={[0, dims.forearmLength, 0]}>
                  <group ref={wristPitchRef}>
                    <group userData={{ componentId: 'wrist' }} onClick={handleClick('wrist')}>
                      <mesh rotation={[Math.PI / 2, 0, 0]}>
                        <cylinderGeometry args={[0.12, 0.12, 0.28, 22]} />
                        <meshStandardMaterial
                          color="#334155"
                          metalness={0.85}
                          roughness={0.22}
                          emissive={partEmissive('wrist', selectedComponentId).color}
                          emissiveIntensity={partEmissive('wrist', selectedComponentId).intensity}
                          transparent={isolateSelected && selectedComponentId !== 'wrist'}
                          opacity={partOpacity('wrist', selectedComponentId, isolateSelected)}
                        />
                      </mesh>
                      <mesh position={[0, dims.wristLength * 0.5, 0]}>
                        <cylinderGeometry args={[0.095, 0.105, dims.wristLength, 20]} />
                        <meshStandardMaterial color="#94A3B8" metalness={0.88} roughness={0.2} />
                      </mesh>
                    </group>

                    {/* J5: Wrist Roll + Tool Mount Flange at Y = wristLength */}
                    <group ref={wristRollRef} position={[0, dims.wristLength, 0]}>
                      {/* Tool Changer Flange */}
                      <mesh position={[0, 0.02, 0]}>
                        <cylinderGeometry args={[0.12, 0.11, 0.04, 24]} />
                        <meshStandardMaterial color="#0F172A" metalness={0.88} roughness={0.22} />
                      </mesh>

                      {/* Dual-Tool Separation: Gripper vs Dedicated Cutter */}
                      {!isCutterActive ? (
                        <group userData={{ componentId: 'gripper' }} onClick={handleClick('gripper')}>
                          {/* Parallel Gripper Rail */}
                          <mesh position={[0, 0.075, 0]} castShadow={!isSoftwareGl}>
                            <boxGeometry args={[0.15, 0.07, 0.44]} />
                            <meshStandardMaterial
                              color="#475569"
                              metalness={0.82}
                              roughness={0.26}
                              emissive={partEmissive('gripper', selectedComponentId).color}
                              emissiveIntensity={partEmissive('gripper', selectedComponentId).intensity}
                              transparent={isolateSelected && selectedComponentId !== 'gripper'}
                              opacity={partOpacity('gripper', selectedComponentId, isolateSelected)}
                            />
                          </mesh>
                          {/* Left & Right Articulating Fingers */}
                          <group ref={leftJawRef} position={[0, 0.22, -0.18]}>
                            <mesh castShadow={!isSoftwareGl}>
                              <boxGeometry args={[0.09, 0.24, 0.045]} />
                              <meshStandardMaterial color="#CBD5E1" metalness={0.88} roughness={0.2} />
                            </mesh>
                            <mesh position={[0, 0.06, 0.028]}>
                              <boxGeometry args={[0.08, 0.14, 0.018]} />
                              <meshStandardMaterial color="#0284C7" metalness={0.15} roughness={0.78} />
                            </mesh>
                          </group>
                          <group ref={rightJawRef} position={[0, 0.22, 0.18]}>
                            <mesh castShadow={!isSoftwareGl}>
                              <boxGeometry args={[0.09, 0.24, 0.045]} />
                              <meshStandardMaterial color="#CBD5E1" metalness={0.88} roughness={0.2} />
                            </mesh>
                            <mesh position={[0, 0.06, -0.028]}>
                              <boxGeometry args={[0.08, 0.14, 0.018]} />
                              <meshStandardMaterial color="#0284C7" metalness={0.15} roughness={0.78} />
                            </mesh>
                          </group>
                        </group>
                      ) : (
                        <group userData={{ componentId: 'cutter' }} onClick={handleClick('cutter')}>
                          {/* Dedicated Conceptual Cutting Blade Assembly */}
                          <mesh position={[0, 0.08, 0]} castShadow={!isSoftwareGl}>
                            <cylinderGeometry args={[0.08, 0.1, 0.1, 20]} />
                            <meshStandardMaterial
                              color="#64748B"
                              metalness={0.85}
                              roughness={0.22}
                              emissive={partEmissive('cutter', selectedComponentId).color}
                              emissiveIntensity={partEmissive('cutter', selectedComponentId).intensity}
                            />
                          </mesh>
                          <mesh position={[0, 0.21, 0]} castShadow={!isSoftwareGl}>
                            <boxGeometry args={[0.26, 0.19, 0.016]} />
                            <meshStandardMaterial
                              color="#F8FAFC"
                              metalness={0.96}
                              roughness={0.12}
                            />
                          </mesh>
                          {/* Beveled blade cutting edge highlight */}
                          <mesh position={[0, 0.305, 0]}>
                            <boxGeometry args={[0.26, 0.015, 0.008]} />
                            <meshStandardMaterial
                              color="#38BDF8"
                              emissive="#38BDF8"
                              emissiveIntensity={0.4}
                            />
                          </mesh>
                        </group>
                      )}
                    </group>
                  </group>
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>

      {/* Realistic Splittable Apple */}
      <group
        ref={appleGroupRef}
        userData={{ componentId: 'apple' }}
        position={[dims.pickupRadius, dims.appleRadius, 0]}
        onClick={handleClick('apple')}
      >
        {/* Left Hemisphere */}
        <group ref={appleLeftHalfRef}>
          <mesh geometry={leftAppleGeo} castShadow={!isSoftwareGl}>
            <meshStandardMaterial
              color="#DC2626"
              metalness={0.05}
              roughness={0.28}
              emissive={partEmissive('apple', selectedComponentId).color}
              emissiveIntensity={partEmissive('apple', selectedComponentId).intensity * 0.55}
              transparent={isolateSelected && selectedComponentId !== 'apple'}
              opacity={partOpacity('apple', selectedComponentId, isolateSelected)}
            />
          </mesh>
          {/* Cream interior cut plane exposed when split */}
          <mesh rotation={[0, 0, 0]} position={[0, 0, 0.001]}>
            <circleGeometry args={[dims.appleRadius * 0.94, 24]} />
            <meshStandardMaterial color="#FEF3C7" roughness={0.65} metalness={0.0} />
          </mesh>
          {/* Seed pips on cut face */}
          <mesh position={[0.025, -0.01, 0.004]}>
            <sphereGeometry args={[0.012, 8, 8]} />
            <meshStandardMaterial color="#451A03" roughness={0.4} />
          </mesh>
        </group>

        {/* Right Hemisphere */}
        <group ref={appleRightHalfRef}>
          <mesh geometry={rightAppleGeo} castShadow={!isSoftwareGl}>
            <meshStandardMaterial
              color="#B91C1C"
              metalness={0.05}
              roughness={0.28}
              emissive={partEmissive('apple', selectedComponentId).color}
              emissiveIntensity={partEmissive('apple', selectedComponentId).intensity * 0.55}
              transparent={isolateSelected && selectedComponentId !== 'apple'}
              opacity={partOpacity('apple', selectedComponentId, isolateSelected)}
            />
          </mesh>
          <mesh rotation={[0, Math.PI, 0]} position={[0, 0, -0.001]}>
            <circleGeometry args={[dims.appleRadius * 0.94, 24]} />
            <meshStandardMaterial color="#FEF3C7" roughness={0.65} metalness={0.0} />
          </mesh>
          <mesh position={[-0.025, -0.01, -0.004]}>
            <sphereGeometry args={[0.012, 8, 8]} />
            <meshStandardMaterial color="#451A03" roughness={0.4} />
          </mesh>
          {/* Stem & Leaf */}
          <mesh position={[0, dims.appleRadius * 0.92, 0]} rotation={[0, 0, -0.18]}>
            <cylinderGeometry args={[0.012, 0.018, 0.11, 8]} />
            <meshStandardMaterial color="#78350F" roughness={0.8} />
          </mesh>
          <mesh
            geometry={leafGeo}
            position={[0.01, dims.appleRadius * 0.96, 0]}
            rotation={[0.3, 0.2, 0.45]}
          >
            <meshStandardMaterial color="#16A34A" roughness={0.45} side={THREE.DoubleSide} />
          </mesh>
        </group>
      </group>

      {/* Optional Minimal Joint Labels */}
      {showLabels && (
        <>
          <Html position={[0, 0.55, 0.55]} center distanceFactor={8}>
            <span className="px-1.5 py-0.5 rounded bg-slate-950/90 border border-slate-700 text-[10px] font-mono text-cyan-200 whitespace-nowrap">
              J1 Base Yaw
            </span>
          </Html>
          <Html position={[dims.pickupRadius, 0.58, 0]} center distanceFactor={8}>
            <span className="px-1.5 py-0.5 rounded bg-slate-950/90 border border-slate-700 text-[10px] font-mono text-amber-200 whitespace-nowrap">
              Pickup Apple (0°)
            </span>
          </Html>
          {sequenceId === 'sequence-a-pick-place' && (
            <Html
              position={[poseNow.targetPadPosition[0], 0.35, poseNow.targetPadPosition[2]]}
              center
              distanceFactor={8}
            >
              <span className="px-1.5 py-0.5 rounded bg-slate-950/90 border border-emerald-500/50 text-[10px] font-mono text-emerald-200 whitespace-nowrap">
                Target Pad ({Math.round(baseTurnDeg)}°)
              </span>
            </Html>
          )}
        </>
      )}
    </group>
  );
}
