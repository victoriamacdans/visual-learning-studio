import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import {
  computeBox3CameraFraming,
  measureComponentWorldBox3,
  measureObjectWorldBox3,
} from '../../three/cameraFraming';

export interface CameraAngles {
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
}

export interface Box3CameraRigProps {
  readonly targetRootRef: RefObject<THREE.Object3D | null>;
  readonly modelKey: string;
  readonly cameraTarget: string | 'overview';
  readonly focusTrigger: number;
  readonly isExploded?: boolean;
  readonly isFocusMode?: boolean;
  readonly isSoftwareGl: boolean;
  readonly overviewAngles?: CameraAngles;
  readonly getComponentAngles?: (componentId: string) => CameraAngles | null;
  readonly overviewFillRatio?: number;
  readonly componentFillRatio?: number;
  readonly minDistance?: number;
  readonly maxDistance?: number;
  readonly maxPolarAngle?: number;
}

/**
 * Reusable Box3-driven camera rig for React Three Fiber scenes.
 * Automatically measures the visible Three.js Object3D hierarchy (or tagged sub-component),
 * frames it at ~65-80% of the viewport across desktop, Focus Mode, and narrow screens,
 * and yields immediately whenever the user orbits, zooms, or pans.
 */
export function Box3CameraRig({
  targetRootRef,
  modelKey,
  cameraTarget,
  focusTrigger,
  isExploded = false,
  isFocusMode = false,
  isSoftwareGl,
  overviewAngles = { azimuthDeg: 38, elevationDeg: 20 },
  getComponentAngles,
  overviewFillRatio,
  componentFillRatio,
  minDistance = 0.55,
  maxDistance = 28,
  maxPolarAngle = Math.PI * 0.88,
}: Box3CameraRigProps) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const { camera, size, invalidate } = useThree();
  const isTransitioningRef = useRef(false);
  const lastModelKeyRef = useRef<string | null>(null);
  const goalPosRef = useRef(new THREE.Vector3(4.2, 2.2, 4.6));
  const goalTargetRef = useRef(new THREE.Vector3(0, 0.2, 0));

  const computeAndApplyGoal = useCallback(
    (snapImmediately: boolean) => {
      const root = targetRootRef.current;
      if (!root) return false;

      const isOverview = cameraTarget === 'overview';
      const subBounds = !isOverview
        ? measureComponentWorldBox3(root, cameraTarget)
        : null;
      const bounds = subBounds ?? measureObjectWorldBox3(root);
      if (!bounds) return false;

      const aspect =
        size.width > 0 && size.height > 0 ? size.width / size.height : 1.35;
      const fovDeg = camera instanceof THREE.PerspectiveCamera ? camera.fov : 38;
      const compAngles = !isOverview ? getComponentAngles?.(cameraTarget) : null;
      const angles = compAngles ?? overviewAngles;

      const effectiveFill = isOverview
        ? overviewFillRatio ?? (isFocusMode ? 0.78 : 0.74)
        : componentFillRatio ?? (isFocusMode ? 0.72 : 0.66);

      const framing = computeBox3CameraFraming({
        boxMin: bounds.boxMin,
        boxMax: bounds.boxMax,
        aspect,
        fovDeg,
        azimuthDeg: angles.azimuthDeg,
        elevationDeg: angles.elevationDeg,
        fillRatio: effectiveFill,
        minDistance,
        maxDistance,
      });

      goalPosRef.current.set(
        framing.position[0],
        framing.position[1],
        framing.position[2],
      );
      goalTargetRef.current.set(
        framing.target[0],
        framing.target[1],
        framing.target[2],
      );

      if (snapImmediately) {
        camera.position.copy(goalPosRef.current);
        if (controlsRef.current) {
          controlsRef.current.target.copy(goalTargetRef.current);
          controlsRef.current.update();
        }
        isTransitioningRef.current = false;
      } else {
        isTransitioningRef.current = true;
      }

      invalidate();
      return true;
    },
    [
      targetRootRef,
      cameraTarget,
      size.width,
      size.height,
      camera,
      getComponentAngles,
      overviewAngles,
      overviewFillRatio,
      componentFillRatio,
      isFocusMode,
      minDistance,
      maxDistance,
      invalidate,
    ],
  );

  useEffect(() => {
    const isNewModel = lastModelKeyRef.current !== modelKey;
    if (isNewModel) {
      lastModelKeyRef.current = modelKey;
    }

    let rafId = 0;
    let settleTimer = 0;

    rafId = window.requestAnimationFrame(() => {
      computeAndApplyGoal(isNewModel);
      // Re-measure after explode transition or initial layout settles
      if (isExploded || isNewModel) {
        settleTimer = window.setTimeout(() => {
          computeAndApplyGoal(false);
        }, isExploded ? 340 : 90);
      }
    });

    return () => {
      window.cancelAnimationFrame(rafId);
      if (settleTimer) window.clearTimeout(settleTimer);
    };
  }, [
    modelKey,
    cameraTarget,
    focusTrigger,
    isExploded,
    isFocusMode,
    size.width,
    size.height,
    computeAndApplyGoal,
  ]);

  useFrame((_, rawDelta) => {
    const controls = controlsRef.current;
    if (!controls || !isTransitioningRef.current) return;

    const delta = Math.min(rawDelta, 0.08);
    const lambda = isSoftwareGl ? 10 : 6.4;

    camera.position.x = THREE.MathUtils.damp(
      camera.position.x,
      goalPosRef.current.x,
      lambda,
      delta,
    );
    camera.position.y = THREE.MathUtils.damp(
      camera.position.y,
      goalPosRef.current.y,
      lambda,
      delta,
    );
    camera.position.z = THREE.MathUtils.damp(
      camera.position.z,
      goalPosRef.current.z,
      lambda,
      delta,
    );

    controls.target.x = THREE.MathUtils.damp(
      controls.target.x,
      goalTargetRef.current.x,
      lambda,
      delta,
    );
    controls.target.y = THREE.MathUtils.damp(
      controls.target.y,
      goalTargetRef.current.y,
      lambda,
      delta,
    );
    controls.target.z = THREE.MathUtils.damp(
      controls.target.z,
      goalTargetRef.current.z,
      lambda,
      delta,
    );

    controls.update();
    if (isSoftwareGl) {
      invalidate();
    }

    if (
      camera.position.distanceTo(goalPosRef.current) < 0.025 &&
      controls.target.distanceTo(goalTargetRef.current) < 0.02
    ) {
      camera.position.copy(goalPosRef.current);
      controls.target.copy(goalTargetRef.current);
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
      minDistance={minDistance}
      maxDistance={maxDistance}
      maxPolarAngle={maxPolarAngle}
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
