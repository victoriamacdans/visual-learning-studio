import { useCallback, useMemo, useState } from 'react';
import type { SceneActionPlan, ShowcaseSceneId } from '../types/tutor';
import {
  applyValidatedScenePlan,
  createInitialSceneControllerState,
  focusComponent as focusComponentTransition,
  getActiveTimelineEvent,
  getSceneDescriptor,
  highlightComponent as highlightComponentTransition,
  isolateComponent as isolateComponentTransition,
  loadScene as loadSceneTransition,
  pauseSequence as pauseSequenceTransition,
  playSequence as playSequenceTransition,
  resetScene as resetSceneTransition,
  resumeSequence as resumeSequenceTransition,
  seekSequence as seekSequenceTransition,
  setCrankAngle as setCrankAngleTransition,
  setPlaybackSpeed as setPlaybackSpeedTransition,
  setSceneViewMode as setSceneViewModeTransition,
  setSixStrokeVariant as setSixStrokeVariantTransition,
  type SceneControllerState,
  type SceneHighlightMode,
  type SceneViewMode,
} from '../three/sceneController';
import type { SixStrokeVariantId } from '../three/sixStrokeKinematics';

export interface SceneControllerApi {
  readonly state: SceneControllerState;
  readonly descriptor: ReturnType<typeof getSceneDescriptor>;
  readonly activeEvent: ReturnType<typeof getActiveTimelineEvent>;
  readonly loadScene: (
    sceneId: ShowcaseSceneId,
    options?: Parameters<typeof loadSceneTransition>[2],
  ) => void;
  readonly focusComponent: (componentId: string | 'overview') => void;
  readonly highlightComponent: (componentId: string | null, mode?: SceneHighlightMode) => void;
  readonly playSequence: (sequenceId?: string | null) => void;
  readonly pauseSequence: (byVoice?: boolean) => void;
  readonly resumeSequence: (fromVoice?: boolean) => void;
  readonly seekSequence: (progress01: number) => void;
  readonly setPlaybackSpeed: (speed: number) => void;
  readonly isolateComponent: (componentId: string | null) => void;
  readonly setViewMode: (viewMode: SceneViewMode) => void;
  readonly setExploded: (exploded: boolean) => void;
  readonly setShowLabels: (showLabels: boolean) => void;
  readonly setCrankAngle: (angleDeg: number) => void;
  readonly setSixStrokeVariant: (variant: SixStrokeVariantId) => void;
  readonly setThrottlePercent: (throttle: number) => void;
  readonly setBaseTurnDeg: (deg: number) => void;
  readonly resetScene: () => void;
  readonly applyValidatedPlan: (plan: SceneActionPlan) => void;
}

/**
 * React hook wrapping the Universal Scene Controller state machine.
 */
export function useSceneController(
  initialSceneId: ShowcaseSceneId = 'turbofan',
): SceneControllerApi {
  const [state, setState] = useState<SceneControllerState>(() =>
    createInitialSceneControllerState(initialSceneId),
  );

  const loadScene = useCallback(
    (
      sceneId: ShowcaseSceneId,
      options?: Parameters<typeof loadSceneTransition>[2],
    ) => {
      setState((prev) => loadSceneTransition(prev, sceneId, options));
    },
    [],
  );

  const focusComponent = useCallback((componentId: string | 'overview') => {
    setState((prev) => focusComponentTransition(prev, componentId));
  }, []);

  const highlightComponent = useCallback(
    (componentId: string | null, mode: SceneHighlightMode = 'highlight') => {
      setState((prev) => highlightComponentTransition(prev, componentId, mode));
    },
    [],
  );

  const playSequence = useCallback((sequenceId?: string | null) => {
    setState((prev) => playSequenceTransition(prev, sequenceId));
  }, []);

  const pauseSequence = useCallback((byVoice = false) => {
    setState((prev) => pauseSequenceTransition(prev, byVoice));
  }, []);

  const resumeSequence = useCallback((fromVoice = false) => {
    setState((prev) => resumeSequenceTransition(prev, fromVoice));
  }, []);

  const seekSequence = useCallback((progress01: number) => {
    setState((prev) => seekSequenceTransition(prev, progress01));
  }, []);

  const setPlaybackSpeed = useCallback((speed: number) => {
    setState((prev) => setPlaybackSpeedTransition(prev, speed));
  }, []);

  const isolateComponent = useCallback((componentId: string | null) => {
    setState((prev) => isolateComponentTransition(prev, componentId));
  }, []);

  const setViewMode = useCallback((viewMode: SceneViewMode) => {
    setState((prev) => setSceneViewModeTransition(prev, viewMode));
  }, []);

  const setExploded = useCallback((exploded: boolean) => {
    setState((prev) => ({ ...prev, isExploded: exploded }));
  }, []);

  const setShowLabels = useCallback((showLabels: boolean) => {
    setState((prev) => ({ ...prev, showLabels }));
  }, []);

  const setCrankAngle = useCallback((angleDeg: number) => {
    setState((prev) => setCrankAngleTransition(prev, angleDeg));
  }, []);

  const setSixStrokeVariant = useCallback((variant: SixStrokeVariantId) => {
    setState((prev) => setSixStrokeVariantTransition(prev, variant));
  }, []);

  const setThrottlePercent = useCallback((throttle: number) => {
    if (!Number.isFinite(throttle)) return;
    setState((prev) => ({
      ...prev,
      throttlePercent: Math.max(15, Math.min(100, Math.round(throttle))),
    }));
  }, []);

  const setBaseTurnDeg = useCallback((deg: number) => {
    if (!Number.isFinite(deg)) return;
    setState((prev) => ({
      ...prev,
      baseTurnDeg: Math.max(-180, Math.min(180, Math.round(deg))),
    }));
  }, []);

  const resetScene = useCallback(() => {
    setState((prev) => resetSceneTransition(prev));
  }, []);

  const applyValidatedPlan = useCallback((plan: SceneActionPlan) => {
    setState((prev) => applyValidatedScenePlan(prev, plan));
  }, []);

  const descriptor = useMemo(() => getSceneDescriptor(state.sceneId), [state.sceneId]);
  const activeEvent = useMemo(
    () =>
      getActiveTimelineEvent(
        state.sceneId,
        state.activeSequenceId,
        state.sequenceProgress,
      ),
    [state.sceneId, state.activeSequenceId, state.sequenceProgress],
  );

  return {
    state,
    descriptor,
    activeEvent,
    loadScene,
    focusComponent,
    highlightComponent,
    playSequence,
    pauseSequence,
    resumeSequence,
    seekSequence,
    setPlaybackSpeed,
    isolateComponent,
    setViewMode,
    setExploded,
    setShowLabels,
    setCrankAngle,
    setSixStrokeVariant,
    setThrottlePercent,
    setBaseTurnDeg,
    resetScene,
    applyValidatedPlan,
  };
}
