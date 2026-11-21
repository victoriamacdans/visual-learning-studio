/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  APP_CONFIG,
  type LearningInputMode,
  type PanelId,
  type StudyModuleId,
  type VisualizationLayerMode,
} from './config/appConfig';
import {
  ENGINE_STAGES,
  STUDY_MODULES,
  getStudyModuleById,
  type EngineStageInfo,
} from './data/jetPropulsionContent';
import {
  BUILTIN_ASSET_REGISTRY,
  getAssetEntryById,
  getIllustrativeSubsystemById,
  type AssetRegistryEntry,
  type IllustrativeSubsystemDefinition,
} from './three/assetRegistry';
import type { ResolvedGlbPart } from './three/gltfAssetUtils';
import type { LoadedGlbAssetSummary } from './components/three/AssetModel3D';
import type {
  CapturedScreenRegion,
  EngineComponentId,
  ExplorationLevel,
  GeminiTutorStructuredResponse,
  GeneratedScene3DSpec,
  LessonComponentSummary,
  SceneActionPlan,
  SceneTargetKind,
  SelectedPdfExcerpt,
  ShowcaseSceneId,
  TeachLessonRequest,
  TeachLessonSegment,
  UploadedAssetSummary,
} from './types/tutor';
import { clampPage, stepZoom } from './utils/studioState';
import { getPreparedShowcaseLesson } from './data/preparedShowcaseLessons';
import {
  analyzeScreenRegion,
  askGeminiTutor,
  requestTeachLesson,
} from './services/tutorApi';
import { useVoiceLessonPlayer } from './hooks/useVoiceLessonPlayer';
import { useSceneController } from './hooks/useSceneController';
import { evaluateInlineSixKinematics } from './three/inlineSixKinematics';
import {
  evaluateSixStrokeKinematics,
  SIX_STROKE_VARIANTS,
} from './three/sixStrokeKinematics';
import { evaluateRobotArmSequence, type RobotSequenceId } from './three/robotArmKinematics';
import { StudioHeader } from './components/StudioHeader';
import {
  PdfViewerPanel,
  type UploadedPdfState,
} from './components/PdfViewerPanel';
import {
  VisualizationPanel,
  type BreadcrumbItem,
  type UnsupportedVisualizationNotice,
  type VoiceCaptionOverlayData,
} from './components/VisualizationPanel';
import { AiTutorPanel, type TutorMessage } from './components/AiTutorPanel';

const INITIAL_MESSAGES: readonly TutorMessage[] = [
  {
    id: 'welcome-1',
    role: 'tutor',
    contextLabel: 'Visual Learning Studio',
    text: 'Upload a PDF or custom GLB model, switch to Learn from Screen to analyze any diagram, or ask Gemini to visualize real machines (such as a container ship, cordless drill, car, or turbofan engine) in interactive 3D.',
  },
];

const MOBILE_PANEL_TABS: readonly { id: PanelId; label: string }[] = [
  { id: 'pdf', label: 'Materials' },
  { id: 'visualization', label: '3D Stage' },
  { id: 'tutor', label: 'AI Tutor' },
];

export default function App() {
  const [activeModuleId, setActiveModuleId] = useState<StudyModuleId>('turbofan');
  const [learningInputMode, setLearningInputMode] = useState<LearningInputMode>('pdf');
  const [pdfSourceMode, setPdfSourceMode] = useState<'example' | 'uploaded'>('example');
  const [uploadedPdf, setUploadedPdf] = useState<UploadedPdfState | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [zoomPercent, setZoomPercent] = useState<number>(
    APP_CONFIG.pdfDefaults.initialZoomPercent,
  );

  const [capturedScreenRegion, setCapturedScreenRegion] =
    useState<CapturedScreenRegion | null>(null);
  const [screenQuestion, setScreenQuestion] = useState<string>('');
  const [lastScreenConcept, setLastScreenConcept] = useState<string | null>(null);

  // Built-in parametric Turbofan state
  const [selectedStageId, setSelectedStageId] = useState<EngineStageInfo['id']>('fan');
  const [cameraFocusMode, setCameraFocusMode] = useState<EngineComponentId | 'overview'>(
    'overview',
  );
  const [focusTrigger, setFocusTrigger] = useState<number>(0);
  const [layerMode, setLayerMode] = useState<VisualizationLayerMode>('cutaway');
  const [throttlePercent, setThrottlePercent] = useState<number>(
    APP_CONFIG.simulationDefaults.initialThrottlePercent,
  );
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isExploded, setIsExploded] = useState<boolean>(false);
  const [geminiFocusedStage, setGeminiFocusedStage] = useState<boolean>(false);
  const [unsupportedVizNotice, setUnsupportedVizNotice] =
    useState<UnsupportedVisualizationNotice | null>(null);

  // Multi-level realistic 3D Asset & Hierarchy state
  const [customAssets, setCustomAssets] = useState<AssetRegistryEntry[]>([]);
  const [activeAssetId, setActiveAssetId] = useState<string>('turbofan-engine');
  const [explorationLevel, setExplorationLevel] = useState<ExplorationLevel>('full-object');
  const [selectedAssetPartId, setSelectedAssetPartId] = useState<string | null>(null);
  const [assetFocusTarget, setAssetFocusTarget] = useState<string | 'overview'>('overview');
  const [assetFocusTrigger, setAssetFocusTrigger] = useState<number>(0);
  const [resolvedAssetParts, setResolvedAssetParts] = useState<ResolvedGlbPart[]>([]);
  const [assetBounds, setAssetBounds] = useState<{
    center: readonly [number, number, number];
    size: readonly [number, number, number];
  } | null>(null);
  const [assetLoadProgress, setAssetLoadProgress] = useState<number>(0);
  const [assetLoadError, setAssetLoadError] = useState<string | null>(null);
  const [assetMeshStats, setAssetMeshStats] = useState<{
    meshCount: number;
    triangleCount: number;
  } | null>(null);
  const [activeSubsystemContext, setActiveSubsystemContext] = useState<{
    parentAssetId: string;
    parentAssetName: string;
    subsystemLabel: string;
    truthfulnessLabel: string;
  } | null>(null);

  // Universal AI-generated / Illustrative Subsystem 3D scene state
  const [generatedScene, setGeneratedScene] = useState<GeneratedScene3DSpec | null>(null);
  const [selectedGeneratedComponentId, setSelectedGeneratedComponentId] = useState<
    string | null
  >(null);
  const [generatedFocusTarget, setGeneratedFocusTarget] = useState<string | 'overview'>(
    'overview',
  );
  const [generatedFocusTrigger, setGeneratedFocusTrigger] = useState<number>(0);
  const [isolateSelected, setIsolateSelected] = useState<boolean>(false);
  const [showConnections, setShowConnections] = useState<boolean>(true);
  const [showLabels, setShowLabels] = useState<boolean>(false);
  const [simSpeed, setSimSpeed] = useState<number>(1);
  const [isFocusMode, setIsFocusMode] = useState<boolean>(false);
  const [sceneNoticeBanner, setSceneNoticeBanner] = useState<string | null>(null);

  const sceneController = useSceneController('turbofan');

  const [expandedPanel, setExpandedPanel] = useState<PanelId | null>(null);
  const [mobileActivePanel, setMobileActivePanel] = useState<PanelId>('visualization');

  const [messages, setMessages] = useState<readonly TutorMessage[]>(INITIAL_MESSAGES);
  const [pinnedExcerpt, setPinnedExcerpt] = useState<SelectedPdfExcerpt | null>(null);
  const [lastTutorQuestion, setLastTutorQuestion] = useState<string | null>(null);
  const [isAskingTutor, setIsAskingTutor] = useState<boolean>(false);

  const tutorInputRef = useRef<HTMLInputElement | null>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const teachLaunchInFlightRef = useRef<boolean>(false);
  const teachSessionTokenRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      for (const url of objectUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  const availableAssets = useMemo(
    () => [...BUILTIN_ASSET_REGISTRY, ...customAssets],
    [customAssets],
  );
  const activeAsset = useMemo(
    () => getAssetEntryById(activeAssetId, customAssets),
    [activeAssetId, customAssets],
  );

  const uploadedAssetSummaries: UploadedAssetSummary[] = useMemo(
    () =>
      customAssets.map((a) => ({
        id: a.id,
        name: a.name,
        category: a.category,
        parts: a.knownParts.map((p) => p.id),
      })),
    [customAssets],
  );

  const studyModule = getStudyModuleById(activeModuleId);
  const selectedStage =
    ENGINE_STAGES.find((stage) => stage.id === selectedStageId) ?? ENGINE_STAGES[0];
  const activeDocumentTitle =
    pdfSourceMode === 'uploaded' && uploadedPdf
      ? uploadedPdf.fileName
      : studyModule.documentTitle;

  const totalPages =
    pdfSourceMode === 'uploaded' && uploadedPdf
      ? Math.max(1, uploadedPdf.numPages)
      : studyModule.pages.length;

  const selectedGeneratedComponent =
    generatedScene?.components.find((c) => c.id === selectedGeneratedComponentId) ?? null;

  const isExtraGlbActive = Boolean(
    activeAsset &&
      activeAsset.modelFormat === 'glb' &&
      activeAsset.id !== 'cordless-drill' &&
      activeAsset.id !== 'container-ship',
  );

  // Snapshot of the currently displayed 3D model and its real components for Voice Tutor grounding
  const activeModelDescriptor = useMemo<{
    sceneKind: SceneTargetKind;
    systemId: string;
    systemTitle: string;
    systemDescription: string;
    components: readonly LessonComponentSummary[];
    selectedComponentId?: string;
  }>(() => {
    if (generatedScene && generatedScene.feasible) {
      return {
        sceneKind: 'generated-3d',
        systemId: activeSubsystemContext?.parentAssetId ?? 'generated-3d',
        systemTitle: generatedScene.systemTitle,
        systemDescription: generatedScene.operatingPrinciple,
        components: generatedScene.components.map((c) => ({
          id: c.id,
          name: c.name,
          role: c.role,
        })),
        selectedComponentId: selectedGeneratedComponentId ?? generatedScene.components[0]?.id,
      };
    }

    if (isExtraGlbActive && activeAsset) {
      const partSummaries: LessonComponentSummary[] =
        resolvedAssetParts.length > 0
          ? resolvedAssetParts.map((p) => ({ id: p.id, name: p.label, role: p.role }))
          : activeAsset.knownParts.length > 0
            ? activeAsset.knownParts.map((p) => ({ id: p.id, name: p.label, role: p.role }))
            : [{ id: activeAsset.id, name: activeAsset.name, role: activeAsset.description }];

      return {
        sceneKind: 'glb-asset',
        systemId: activeAsset.id,
        systemTitle: activeAsset.name,
        systemDescription: activeAsset.description,
        components: partSummaries,
        selectedComponentId: selectedAssetPartId ?? undefined,
      };
    }

    const showcaseDesc = sceneController.descriptor;
    const showcaseState = sceneController.state;
    return {
      sceneKind: showcaseDesc.sceneId,
      systemId: showcaseDesc.sceneId,
      systemTitle: showcaseDesc.title,
      systemDescription: showcaseDesc.description,
      components: showcaseDesc.hierarchy.map((c) => ({
        id: c.id,
        name: c.name,
        role: c.role,
      })),
      selectedComponentId:
        showcaseState.activeComponentId ??
        (showcaseDesc.sceneId === 'turbofan'
          ? selectedStageId
          : showcaseDesc.hierarchy[0]?.id),
    };
  }, [
    generatedScene,
    activeSubsystemContext,
    selectedGeneratedComponentId,
    isExtraGlbActive,
    activeAsset,
    resolvedAssetParts,
    selectedAssetPartId,
    sceneController.descriptor,
    sceneController.state,
    selectedStageId,
  ]);

  const activeModelDescriptorRef = useRef(activeModelDescriptor);
  activeModelDescriptorRef.current = activeModelDescriptor;

  const sceneControllerRef = useRef(sceneController);
  sceneControllerRef.current = sceneController;

  const handleActivateLessonSegment = useCallback((segment: TeachLessonSegment) => {
    const model = activeModelDescriptorRef.current;
    const ctrl = sceneControllerRef.current;

    if (
      model.sceneKind === 'turbofan' ||
      model.sceneKind === 'inline-six' ||
      model.sceneKind === 'six-stroke' ||
      model.sceneKind === 'cordless-drill' ||
      model.sceneKind === 'ship-propulsion' ||
      model.sceneKind === 'robotic-arm'
    ) {
      if (segment.sequenceId) {
        ctrl.playSequence(segment.sequenceId);
      }
      if (typeof segment.seekProgress === 'number') {
        ctrl.seekSequence(segment.seekProgress);
      }

      if (segment.cameraAction === 'overview') {
        ctrl.focusComponent('overview');
      } else {
        ctrl.focusComponent(segment.componentId);
      }

      if (segment.highlightAction === 'isolate') {
        ctrl.isolateComponent(segment.componentId);
      } else if (segment.highlightAction === 'highlight') {
        ctrl.highlightComponent(segment.componentId, 'highlight');
      } else {
        ctrl.highlightComponent(null, 'none');
      }

      if (segment.animationAction === 'play') ctrl.resumeSequence(false);
      else if (segment.animationAction === 'pause') ctrl.pauseSequence(false);
      else if (segment.animationAction === 'explode') ctrl.setExploded(true);
      else if (segment.animationAction === 'assemble') ctrl.setExploded(false);
      else if (segment.animationAction === 'layer-cutaway') {
        ctrl.setViewMode(
          ctrl.descriptor.supportedViewModes.includes('cutaway') ? 'cutaway' : 'internal',
        );
      } else if (segment.animationAction === 'layer-airflow') ctrl.setViewMode('airflow');
      else if (segment.animationAction === 'layer-thermal') ctrl.setViewMode('thermal');

      if (model.sceneKind === 'turbofan') {
        const matchedStage = ENGINE_STAGES.find((s) => s.id === segment.componentId);
        const targetStageId: EngineComponentId = matchedStage ? matchedStage.id : 'fan';
        setSelectedStageId(targetStageId);
        setGeminiFocusedStage(true);
        setCameraFocusMode(segment.cameraAction === 'overview' ? 'overview' : targetStageId);
        setFocusTrigger((n) => n + 1);

        if (segment.animationAction === 'play') setIsPlaying(true);
        else if (segment.animationAction === 'pause') setIsPlaying(false);
        else if (segment.animationAction === 'explode') setIsExploded(true);
        else if (segment.animationAction === 'assemble') setIsExploded(false);
        else if (segment.animationAction === 'layer-cutaway') setLayerMode('cutaway');
        else if (segment.animationAction === 'layer-airflow') setLayerMode('airflow');
        else if (segment.animationAction === 'layer-thermal') setLayerMode('thermal');
        return;
      }

      if (model.sceneKind === 'cordless-drill' || model.sceneKind === 'ship-propulsion') {
        const validPart = model.components.some((c) => c.id === segment.componentId)
          ? segment.componentId
          : model.components[0]?.id ?? null;

        if (segment.cameraAction === 'overview') {
          setSelectedAssetPartId(validPart);
          setAssetFocusTarget('overview');
          setExplorationLevel(
            segment.animationAction === 'layer-cutaway' ? 'internal-structure' : 'full-object',
          );
        } else {
          setSelectedAssetPartId(validPart);
          setAssetFocusTarget(validPart ?? 'overview');
          setExplorationLevel(
            segment.animationAction === 'layer-cutaway'
              ? 'internal-structure'
              : 'component-detail',
          );
        }
        setAssetFocusTrigger((n) => n + 1);
        setIsolateSelected(segment.highlightAction === 'isolate');
        if (segment.animationAction === 'play') setIsPlaying(true);
        else if (segment.animationAction === 'pause') setIsPlaying(false);
        else if (segment.animationAction === 'explode') setIsExploded(true);
        else if (segment.animationAction === 'assemble') setIsExploded(false);
      }
      return;
    }

    if (model.sceneKind === 'glb-asset') {
      const validPart = model.components.some((c) => c.id === segment.componentId)
        ? segment.componentId
        : model.components[0]?.id ?? null;

      if (segment.cameraAction === 'overview') {
        setSelectedAssetPartId(validPart);
        setAssetFocusTarget('overview');
        setExplorationLevel(
          segment.animationAction === 'layer-cutaway'
            ? 'internal-structure'
            : 'full-object',
        );
      } else {
        setSelectedAssetPartId(validPart);
        setAssetFocusTarget(validPart ?? 'overview');
        setExplorationLevel(
          segment.animationAction === 'layer-cutaway'
            ? 'internal-structure'
            : 'component-detail',
        );
      }
      setAssetFocusTrigger((n) => n + 1);
      setIsolateSelected(segment.highlightAction === 'isolate');

      if (segment.animationAction === 'play') setIsPlaying(true);
      else if (segment.animationAction === 'pause') setIsPlaying(false);
      else if (segment.animationAction === 'explode') setIsExploded(true);
      else if (segment.animationAction === 'assemble') setIsExploded(false);
      return;
    }

    // Generated 3D / Illustrative Subsystem
    const validCompId = model.components.some((c) => c.id === segment.componentId)
      ? segment.componentId
      : model.components[0]?.id ?? null;

    if (validCompId) {
      setSelectedGeneratedComponentId(validCompId);
    }
    setGeneratedFocusTarget(
      segment.cameraAction === 'overview' ? 'overview' : validCompId ?? 'overview',
    );
    setGeneratedFocusTrigger((n) => n + 1);
    setIsolateSelected(segment.highlightAction === 'isolate');

    if (segment.animationAction === 'play') setIsPlaying(true);
    else if (segment.animationAction === 'pause') setIsPlaying(false);
    else if (segment.animationAction === 'explode') setIsExploded(true);
    else if (segment.animationAction === 'assemble') setIsExploded(false);
  }, []);

  const voicePlayer = useVoiceLessonPlayer({
    onActivateSegment: handleActivateLessonSegment,
  });

  // Automatically pause/resume synchronized 3D showcase playback when voice narration pauses/resumes
  const prevVoiceStatusRef = useRef(voicePlayer.status);
  useEffect(() => {
    const prev = prevVoiceStatusRef.current;
    const next = voicePlayer.status;
    prevVoiceStatusRef.current = next;

    if (prev === 'playing' && next === 'paused') {
      sceneControllerRef.current.pauseSequence(true);
      setIsPlaying(false);
    } else if (prev === 'paused' && next === 'playing') {
      sceneControllerRef.current.resumeSequence(true);
      setIsPlaying(true);
    }
  }, [voicePlayer.status]);

  const clearVoiceLessonRef = useRef(voicePlayer.clearLesson);
  clearVoiceLessonRef.current = voicePlayer.clearLesson;
  const didInitModelWatchRef = useRef(false);
  useEffect(() => {
    if (!didInitModelWatchRef.current) {
      didInitModelWatchRef.current = true;
      return;
    }
    teachSessionTokenRef.current += 1;
    teachLaunchInFlightRef.current = false;
    clearVoiceLessonRef.current();
  }, [activeAssetId, generatedScene, activeModuleId, sceneController.state.sceneId]);

  const handleTeachMe = useCallback(async () => {
    if (teachLaunchInFlightRef.current || voicePlayer.status === 'loading') return;
    teachLaunchInFlightRef.current = true;
    const sessionToken = ++teachSessionTokenRef.current;

    const model = activeModelDescriptorRef.current;
    const activeExamplePage =
      pdfSourceMode === 'example'
        ? studyModule.pages[clampPage(currentPage, totalPages) - 1]
        : undefined;

    const teachPayload: TeachLessonRequest = {
      sceneKind: model.sceneKind,
      systemId: model.systemId,
      systemTitle: model.systemTitle,
      systemDescription: model.systemDescription,
      components: model.components,
      selectedComponentId: model.selectedComponentId,
      difficulty: voicePlayer.difficulty,
      personality: voicePlayer.personality,
      question:
        learningInputMode === 'screen' && screenQuestion.trim()
          ? screenQuestion.trim()
          : lastTutorQuestion ?? undefined,
      highlightedText: pinnedExcerpt?.text,
      pageContext: pinnedExcerpt?.pageContext ?? activeExamplePage?.summary,
      documentTitle: pinnedExcerpt?.documentTitle ?? activeDocumentTitle,
      pageNumber: pinnedExcerpt?.pageNumber ?? currentPage,
      screenImageBase64: capturedScreenRegion?.base64,
      screenImageMimeType: capturedScreenRegion?.mimeType,
    };

    const prepared = getPreparedShowcaseLesson(teachPayload);
    if (prepared) {
      voicePlayer.beginLoading();
      voicePlayer.startLesson(prepared);
      teachLaunchInFlightRef.current = false;
      return;
    }

    voicePlayer.beginLoading();
    let didStartLesson = false;
    let firstError: unknown = null;

    try {
      const firstOnlyPromise = requestTeachLesson({
        ...teachPayload,
        segmentMode: 'first-only',
      })
        .then((firstLesson) => {
          if (teachSessionTokenRef.current !== sessionToken) return;
          if (!didStartLesson) {
            didStartLesson = true;
            voicePlayer.startLesson(firstLesson);
          }
        })
        .catch((err: unknown) => {
          if (!firstError) firstError = err;
        });

      const fullPromise = requestTeachLesson({
        ...teachPayload,
        segmentMode: 'full',
      })
        .then((fullLesson) => {
          if (teachSessionTokenRef.current !== sessionToken) return;
          if (!didStartLesson) {
            didStartLesson = true;
            voicePlayer.startLesson(fullLesson);
          } else {
            voicePlayer.mergeRemainingSegments(fullLesson);
          }
        })
        .catch((err: unknown) => {
          if (!firstError) firstError = err;
        });

      await Promise.allSettled([firstOnlyPromise, fullPromise]);

      if (teachSessionTokenRef.current !== sessionToken) return;
      if (!didStartLesson) {
        const message =
          firstError instanceof Error
            ? firstError.message
            : 'Unable to generate guided voice lesson.';
        voicePlayer.failLoading(message);
      }
    } finally {
      if (teachSessionTokenRef.current === sessionToken) {
        teachLaunchInFlightRef.current = false;
      }
    }
  }, [
    voicePlayer,
    pdfSourceMode,
    studyModule.pages,
    currentPage,
    totalPages,
    learningInputMode,
    screenQuestion,
    lastTutorQuestion,
    pinnedExcerpt,
    activeDocumentTitle,
    capturedScreenRegion,
  ]);

  useEffect(() => {
    if (!isFocusMode) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsFocusMode(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFocusMode]);

  const focusStageCamera = useCallback((stageId: EngineComponentId) => {
    setSelectedStageId(stageId);
    setCameraFocusMode(stageId);
    setFocusTrigger((n) => n + 1);
  }, []);

  const loadGlbAssetState = useCallback(
    (
      assetId: string,
      options?: {
        level?: ExplorationLevel;
        focusPartId?: string | null;
        focusMode?: boolean;
      },
    ) => {
      setGeneratedScene(null);
      setSelectedGeneratedComponentId(null);
      setActiveSubsystemContext(null);
      setUnsupportedVizNotice(null);
      setGeminiFocusedStage(false);
      setIsExploded(false);
      setIsolateSelected(false);
      setIsPlaying(true);

      const isSameAsset = assetId === activeAssetId && !generatedScene;
      setActiveAssetId(assetId);
      if (!isSameAsset) {
        setAssetLoadProgress(0);
        setAssetLoadError(null);
        setResolvedAssetParts([]);
        setAssetBounds(null);
        setAssetMeshStats(null);
      }

      const nextLevel = options?.level ?? 'full-object';
      setExplorationLevel(nextLevel);
      const nextPart = options?.focusPartId ?? null;
      setSelectedAssetPartId(nextPart);
      setAssetFocusTarget(nextPart ?? 'overview');
      setAssetFocusTrigger((n) => n + 1);
      if (options?.focusMode) {
        setIsFocusMode(true);
        setExpandedPanel(null);
      }
    },
    [activeAssetId, generatedScene],
  );

  const openIllustrativeSubsystem = useCallback(
    (subsystem: IllustrativeSubsystemDefinition, parentName?: string) => {
      const parentEntry = getAssetEntryById(subsystem.parentAssetId, customAssets);
      setActiveAssetId(subsystem.parentAssetId);
      setActiveSubsystemContext({
        parentAssetId: subsystem.parentAssetId,
        parentAssetName: parentName ?? parentEntry?.name ?? subsystem.parentAssetId,
        subsystemLabel: subsystem.label,
        truthfulnessLabel: subsystem.truthfulnessLabel,
      });
      setExplorationLevel('component-detail');
      setGeneratedScene(subsystem.sceneSpec);
      setSelectedGeneratedComponentId(subsystem.sceneSpec.components[0]?.id ?? null);
      setGeneratedFocusTarget('overview');
      setGeneratedFocusTrigger((n) => n + 1);
      setIsolateSelected(false);
      setShowConnections(true);
      setShowLabels(false);
      setIsExploded(false);
      setIsPlaying(true);
      setSimSpeed(1);
      setGeminiFocusedStage(false);
      setUnsupportedVizNotice(null);
    },
    [customAssets],
  );

  const applyShowcaseScenePlan = useCallback(
    (actionPlan: SceneActionPlan) => {
      sceneController.applyValidatedPlan(actionPlan);
      setGeneratedScene(null);
      setSelectedGeneratedComponentId(null);
      setActiveSubsystemContext(null);
      setUnsupportedVizNotice(null);
      setSceneNoticeBanner(actionPlan.unsupportedRequestNotice ?? null);

      const nextPlaying = typeof actionPlan.play === 'boolean' ? actionPlan.play : true;
      setIsPlaying(nextPlaying);
      setIsExploded(false);

      if (actionPlan.sceneId === 'turbofan') {
        const comp = actionPlan.componentId as EngineComponentId | undefined;
        const validStage =
          comp && ENGINE_STAGES.some((s) => s.id === comp) ? comp : 'fan';
        setActiveAssetId('turbofan-engine');
        setSelectedStageId(validStage);
        setCameraFocusMode(actionPlan.componentId ? validStage : 'overview');
        setFocusTrigger((n) => n + 1);
        setLayerMode(
          actionPlan.viewMode === 'airflow' || actionPlan.viewMode === 'thermal'
            ? actionPlan.viewMode
            : 'cutaway',
        );
        setGeminiFocusedStage(true);
        return;
      }

      if (actionPlan.sceneId === 'cordless-drill' || actionPlan.sceneId === 'ship-propulsion') {
        const targetAssetId =
          actionPlan.sceneId === 'cordless-drill' ? 'cordless-drill' : 'container-ship';
        const level: ExplorationLevel =
          actionPlan.viewMode === 'full' ? 'full-object' : 'internal-structure';
        loadGlbAssetState(targetAssetId, {
          level,
          focusPartId: actionPlan.componentId ?? null,
        });
        setIsolateSelected(Boolean(actionPlan.isolate));
        return;
      }

      if (actionPlan.sceneId === 'inline-six') {
        setActiveAssetId('showcase-inline-six');
        setGeminiFocusedStage(false);
        return;
      }

      if (actionPlan.sceneId === 'six-stroke') {
        setActiveAssetId('showcase-six-stroke');
        setGeminiFocusedStage(false);
        return;
      }

      if (actionPlan.sceneId === 'robotic-arm') {
        setActiveAssetId('showcase-robotic-arm');
        setGeminiFocusedStage(false);
      }
    },
    [loadGlbAssetState, sceneController],
  );

  const handleSelectShowcaseScene = useCallback(
    (sceneId: ShowcaseSceneId) => {
      teachSessionTokenRef.current += 1;
      teachLaunchInFlightRef.current = false;
      voicePlayer.clearLesson();
      setLastTutorQuestion(null);
      setSceneNoticeBanner(null);
      sceneController.loadScene(sceneId);
      setGeneratedScene(null);
      setSelectedGeneratedComponentId(null);
      setActiveSubsystemContext(null);
      setUnsupportedVizNotice(null);
      setGeminiFocusedStage(false);
      setIsExploded(false);
      setIsolateSelected(false);
      setIsPlaying(true);

      if (sceneId === 'turbofan') {
        setActiveAssetId('turbofan-engine');
        setCameraFocusMode('overview');
        setFocusTrigger((n) => n + 1);
        setLayerMode('cutaway');
        return;
      }
      if (sceneId === 'cordless-drill') {
        loadGlbAssetState('cordless-drill', { level: 'internal-structure', focusPartId: null });
        return;
      }
      if (sceneId === 'ship-propulsion') {
        loadGlbAssetState('container-ship', { level: 'internal-structure', focusPartId: null });
        return;
      }
      if (sceneId === 'inline-six') {
        setActiveAssetId('showcase-inline-six');
        return;
      }
      if (sceneId === 'six-stroke') {
        setActiveAssetId('showcase-six-stroke');
        return;
      }
      if (sceneId === 'robotic-arm') {
        setActiveAssetId('showcase-robotic-arm');
      }
    },
    [loadGlbAssetState, sceneController, voicePlayer],
  );

  const applyVisualizationFromGemini = useCallback(
    (result: GeminiTutorStructuredResponse) => {
      const plan = result.assetRetrievalPlan;

      // Priority 0: Structured Showcase Scene Routing & Action Interpretation
      const isCustomUploadedActive = Boolean(
        plan?.matchedAssetId &&
          customAssets.some((a) => a.id === plan.matchedAssetId),
      );
      if (result.sceneActionPlan && !isCustomUploadedActive) {
        applyShowcaseScenePlan(result.sceneActionPlan);
        return;
      }

      // Priority 1: Built-in high-detail Turbofan Engine stage
      if (
        result.visualizationSupported &&
        result.supportedVisualizationComponent !== 'none'
      ) {
        applyShowcaseScenePlan({
          sceneId: 'turbofan',
          componentId: result.supportedVisualizationComponent,
          viewMode: result.recommendedLayerMode,
          sequenceId: 'propulsion-tour',
          play: true,
        });
        return;
      }

      // Priority 2: Illustrative subsystem linked from an exterior GLB asset
      if (plan?.openIllustrativeSubsystemId) {
        const match = getIllustrativeSubsystemById(plan.openIllustrativeSubsystemId);
        if (match) {
          openIllustrativeSubsystem(match.subsystem, match.entry.name);
          setIsFocusMode(true);
          setExpandedPanel(null);
          return;
        }
      }

      // Priority 3: Verified Realistic CC0 / Uploaded GLB Asset Retrieval
      if (plan && plan.matchedAssetId !== 'none') {
        const matchedEntry = getAssetEntryById(plan.matchedAssetId, customAssets);
        if (matchedEntry && matchedEntry.modelFormat === 'glb') {
          const validPart =
            plan.focusPartId &&
            matchedEntry.knownParts.some((p) => p.id === plan.focusPartId)
              ? plan.focusPartId
              : null;

          if (matchedEntry.id === 'cordless-drill' || matchedEntry.id === 'container-ship') {
            applyShowcaseScenePlan({
              sceneId:
                matchedEntry.id === 'cordless-drill'
                  ? 'cordless-drill'
                  : 'ship-propulsion',
              componentId: validPart ?? undefined,
              viewMode: plan.requestedLevel === 'full-object' ? 'full' : 'internal',
              play: true,
            });
            return;
          }

          loadGlbAssetState(matchedEntry.id, {
            level: plan.requestedLevel,
            focusPartId: validPart,
            focusMode: true,
          });
          return;
        }
        if (matchedEntry && matchedEntry.modelFormat === 'parametric-turbofan') {
          applyShowcaseScenePlan({ sceneId: 'turbofan', viewMode: 'cutaway', play: true });
          return;
        }
      }

      // Priority 4: Universal AI Conceptual 3D Approximation (when no realistic asset matches)
      if (result.generatedScene3D && result.generatedScene3D.feasible) {
        const scene = result.generatedScene3D;
        setActiveSubsystemContext(null);
        setSceneNoticeBanner(null);
        setGeneratedScene(scene);
        setSelectedGeneratedComponentId(scene.components[0]?.id ?? null);
        setGeneratedFocusTarget('overview');
        setGeneratedFocusTrigger((n) => n + 1);
        setExplorationLevel('full-object');
        setIsolateSelected(false);
        setShowConnections(true);
        setShowLabels(false);
        setIsExploded(false);
        setIsPlaying(true);
        setSimSpeed(1);
        setGeminiFocusedStage(false);
        setUnsupportedVizNotice(null);
        setIsFocusMode(true);
        setExpandedPanel(null);
        return;
      }

      // Priority 5: Honest 2D diagram / unavailable fallback
      setActiveSubsystemContext(null);
      setSceneNoticeBanner(null);
      setGeneratedScene(null);
      setSelectedGeneratedComponentId(null);
      setGeminiFocusedStage(false);
      setIsFocusMode(false);
      setUnsupportedVizNotice({
        concept: result.mainConcept,
        recommendation: result.recommendedVisualization,
        infeasibilityReason: result.generatedScene3D?.infeasibilityReason,
        diagramData: result.diagramData,
      });
    },
    [
      applyShowcaseScenePlan,
      customAssets,
      loadGlbAssetState,
      openIllustrativeSubsystem,
    ],
  );

  const handleSelectAsset = useCallback(
    (assetId: string) => {
      voicePlayer.clearLesson();
      setLastTutorQuestion(null);
      setSceneNoticeBanner(null);
      if (assetId === 'turbofan-engine') {
        handleSelectShowcaseScene('turbofan');
        return;
      }
      if (assetId === 'cordless-drill') {
        handleSelectShowcaseScene('cordless-drill');
        return;
      }
      if (assetId === 'container-ship') {
        handleSelectShowcaseScene('ship-propulsion');
        return;
      }
      loadGlbAssetState(assetId, { level: 'full-object', focusPartId: null });
    },
    [handleSelectShowcaseScene, loadGlbAssetState, voicePlayer],
  );

  const handleUploadGlbAsset = useCallback(
    (file: File) => {
      if (file.size > APP_CONFIG.assetDefaults.maxGlbUploadBytes) {
        setAssetLoadError('Uploaded GLB exceeds 50 MB limit.');
        return;
      }
      const blobUrl = URL.createObjectURL(file);
      objectUrlsRef.current.push(blobUrl);

      const cleanName = file.name.replace(/\.(glb|gltf)$/i, '').replace(/[_-]+/g, ' ').trim();
      const newId = `uploaded-${Date.now()}`;
      const newEntry: AssetRegistryEntry = {
        id: newId,
        name: cleanName || 'Uploaded 3D Model',
        category: 'user-uploaded-glb',
        aliases: [cleanName.toLowerCase()],
        description: `User-uploaded 3D model (${file.name}). Mesh hierarchy inspected dynamically on load.`,
        modelFormat: 'glb',
        modelUrl: blobUrl,
        source: 'User Upload',
        sourceUrl: 'local://upload',
        license: 'User Provided',
        attribution: `Local file uploaded by student: ${file.name}`,
        isBuiltIn: false,
        verifiedInternalsNote:
          'All selectable meshes are inspected directly from the uploaded glTF/GLB hierarchy.',
        defaultOverviewCamera: { azimuthDeg: 48, elevationDeg: 20, distanceScale: 1.55 },
        knownParts: [],
        illustrativeSubsystems: [],
      };

      setCustomAssets((prev) => [...prev, newEntry]);
      loadGlbAssetState(newId, { level: 'full-object', focusPartId: null });
    },
    [loadGlbAssetState],
  );

  const handleChangeExplorationLevel = useCallback(
    (level: ExplorationLevel) => {
      // If currently viewing an illustrative subsystem and user switches back to Level 1 or Level 2
      if (activeSubsystemContext && level !== 'component-detail') {
        loadGlbAssetState(activeSubsystemContext.parentAssetId, {
          level,
          focusPartId: null,
        });
        return;
      }

      setExplorationLevel(level);
      const showcaseId = sceneController.state.sceneId;
      const isShowcaseGlb =
        showcaseId === 'cordless-drill' || showcaseId === 'ship-propulsion';
      if (isShowcaseGlb) {
        sceneController.setViewMode(level === 'full-object' ? 'full' : 'internal');
      }
      if (level === 'full-object') {
        setSelectedAssetPartId(null);
        setAssetFocusTarget('overview');
        setAssetFocusTrigger((n) => n + 1);
        setIsolateSelected(false);
        if (isShowcaseGlb) {
          sceneController.focusComponent('overview');
          sceneController.isolateComponent(null);
        }
      } else if (level === 'internal-structure') {
        setSelectedAssetPartId(null);
        setAssetFocusTarget('overview');
        setAssetFocusTrigger((n) => n + 1);
        if (isShowcaseGlb) {
          sceneController.focusComponent('overview');
        }
      } else if (level === 'component-detail') {
        const firstAnimatedOrPart =
          resolvedAssetParts.find((p) => p.animation) ?? resolvedAssetParts[0];
        if (firstAnimatedOrPart) {
          setSelectedAssetPartId(firstAnimatedOrPart.id);
          setAssetFocusTarget(firstAnimatedOrPart.id);
          setAssetFocusTrigger((n) => n + 1);
          if (isShowcaseGlb) {
            sceneController.focusComponent(firstAnimatedOrPart.id);
          }
        }
      }
    },
    [activeSubsystemContext, loadGlbAssetState, resolvedAssetParts, sceneController],
  );

  const handleSelectAssetPart = useCallback((partId: string) => {
    setSelectedAssetPartId(partId);
    setAssetFocusTarget(partId);
    setAssetFocusTrigger((n) => n + 1);
    setExplorationLevel('component-detail');
  }, []);

  const handleAssetLoadComplete = useCallback((summary: LoadedGlbAssetSummary) => {
    setAssetBounds({ center: summary.metrics.center, size: summary.metrics.size });
    setResolvedAssetParts([...summary.parts]);
    setAssetMeshStats({
      meshCount: summary.meshCount,
      triangleCount: summary.triangleCount,
    });
    setAssetLoadProgress(100);
    setAssetLoadError(null);
    setCustomAssets((prev) =>
      prev.map((a) =>
        a.id === activeAssetId && a.knownParts.length === 0
          ? {
              ...a,
              knownParts: summary.parts.map((p) => ({
                id: p.id,
                label: p.label,
                role: p.role,
                operatingNote: p.operatingNote,
                meshNamePatterns: p.matchedNodeNames,
                isVerifiedMesh: p.isVerifiedMesh,
                isSubRegionOfMesh: p.isSubRegionOfMesh,
                cameraFraming: p.cameraFraming,
              })),
            }
          : a,
      ),
    );
  }, [activeAssetId]);

  const handleSelectModule = (moduleId: StudyModuleId) => {
    voicePlayer.clearLesson();
    setLastTutorQuestion(null);
    setSceneNoticeBanner(null);
    const nextModule = getStudyModuleById(moduleId);
    setActiveModuleId(moduleId);
    sceneController.loadScene('turbofan', { componentId: nextModule.defaultStageId });
    setActiveAssetId('turbofan-engine');
    setActiveSubsystemContext(null);
    setLearningInputMode('pdf');
    setPdfSourceMode('example');
    setCurrentPage(1);
    setGeneratedScene(null);
    setSelectedGeneratedComponentId(null);
    setSelectedStageId(nextModule.defaultStageId);
    setCameraFocusMode('overview');
    setFocusTrigger((n) => n + 1);
    setGeminiFocusedStage(false);
    setUnsupportedVizNotice(null);
    setIsFocusMode(false);
  };

  const handleUploadPdf = useCallback((fileName: string, data: Uint8Array) => {
    setUploadedPdf({ fileName, data, numPages: 1 });
    setPdfSourceMode('uploaded');
    setCurrentPage(1);
    setPinnedExcerpt(null);
  }, []);

  const handleUploadedPdfLoaded = useCallback((numPages: number) => {
    setUploadedPdf((prev) => (prev ? { ...prev, numPages } : null));
  }, []);

  const handleSelectSourceMode = (mode: 'example' | 'uploaded') => {
    setPdfSourceMode(mode);
    setCurrentPage(1);
    setPinnedExcerpt(null);
  };

  const handleResetLayout = () => {
    voicePlayer.clearLesson();
    setLastTutorQuestion(null);
    setSceneNoticeBanner(null);
    setExpandedPanel(null);
    setIsFocusMode(false);
    setZoomPercent(APP_CONFIG.pdfDefaults.initialZoomPercent);
    setCurrentPage(1);
    setLayerMode('cutaway');
    setThrottlePercent(APP_CONFIG.simulationDefaults.initialThrottlePercent);
    sceneController.loadScene('turbofan');
    setActiveAssetId('turbofan-engine');
    setActiveSubsystemContext(null);
    setExplorationLevel('full-object');
    setSelectedAssetPartId(null);
    setGeneratedScene(null);
    setSelectedGeneratedComponentId(null);
    setSelectedStageId(studyModule.defaultStageId);
    setCameraFocusMode('overview');
    setFocusTrigger((n) => n + 1);
    setIsPlaying(true);
    setIsExploded(false);
    setIsolateSelected(false);
    setGeminiFocusedStage(false);
    setUnsupportedVizNotice(null);
  };

  const handlePageChange = (nextPage: number) => {
    setCurrentPage(clampPage(nextPage, totalPages));
  };

  const handleZoomChange = (direction: 'in' | 'out' | 'reset') => {
    setZoomPercent((prev) => stepZoom(prev, direction));
  };

  const handleToggleExpand = (panelId: PanelId) => {
    setIsFocusMode(false);
    setExpandedPanel((prev) => (prev === panelId ? null : panelId));
  };

  const handleResetStage = () => {
    teachSessionTokenRef.current += 1;
    teachLaunchInFlightRef.current = false;
    voicePlayer.clearLesson();
    setLastTutorQuestion(null);
    setSceneNoticeBanner(null);
    sceneController.resetScene();
    if (isExtraGlbActive || generatedScene || sceneController.state.sceneId === 'turbofan') {
      setLayerMode('cutaway');
      setThrottlePercent(APP_CONFIG.simulationDefaults.initialThrottlePercent);
      if (isExtraGlbActive || generatedScene) {
        sceneController.loadScene('turbofan');
        setActiveAssetId('turbofan-engine');
      }
      setActiveSubsystemContext(null);
      setExplorationLevel('full-object');
      setSelectedAssetPartId(null);
      setGeneratedScene(null);
      setSelectedGeneratedComponentId(null);
      setSelectedStageId(studyModule.defaultStageId);
      setCameraFocusMode('overview');
      setFocusTrigger((n) => n + 1);
      setIsPlaying(true);
      setIsExploded(false);
      setIsolateSelected(false);
      setGeminiFocusedStage(false);
      setUnsupportedVizNotice(null);
      return;
    }
    setSelectedAssetPartId(null);
    setAssetFocusTarget('overview');
    setAssetFocusTrigger((n) => n + 1);
    setExplorationLevel(
      sceneController.descriptor.defaultViewMode === 'full'
        ? 'full-object'
        : 'internal-structure',
    );
    setIsPlaying(true);
    setIsExploded(false);
    setIsolateSelected(false);
  };

  const handleFocusOverview = () => {
    if (generatedScene && generatedScene.feasible) {
      setGeneratedFocusTarget('overview');
      setGeneratedFocusTrigger((n) => n + 1);
      return;
    }
    if (
      sceneController.state.sceneId === 'inline-six' ||
      sceneController.state.sceneId === 'six-stroke' ||
      sceneController.state.sceneId === 'robotic-arm'
    ) {
      sceneController.focusComponent('overview');
      return;
    }
    if (activeAsset && activeAsset.modelFormat === 'glb') {
      setSelectedAssetPartId(null);
      if (isExtraGlbActive) {
        setExplorationLevel('full-object');
      }
      setAssetFocusTarget('overview');
      setAssetFocusTrigger((n) => n + 1);
      setIsolateSelected(false);
      sceneController.focusComponent('overview');
      return;
    }
    sceneController.focusComponent('overview');
    setCameraFocusMode('overview');
    setFocusTrigger((n) => n + 1);
  };

  const handleSelectGeneratedComponent = useCallback((id: string) => {
    setSelectedGeneratedComponentId(id);
    setGeneratedFocusTarget(id);
    setGeneratedFocusTrigger((n) => n + 1);
  }, []);

  const handleAskGeminiWithSelection = (excerpt: SelectedPdfExcerpt) => {
    setPinnedExcerpt(excerpt);
    setMobileActivePanel('tutor');
    requestAnimationFrame(() => {
      tutorInputRef.current?.focus();
    });
  };

  const handleClearScreenCapture = useCallback(() => {
    setCapturedScreenRegion(null);
    setLastScreenConcept(null);
  }, []);

  const handleCaptureScreenRegion = useCallback((region: CapturedScreenRegion | null) => {
    setCapturedScreenRegion(region);
    if (!region) {
      setLastScreenConcept(null);
    }
  }, []);

  const runScreenAnalysis = async (questionText: string) => {
    if (!capturedScreenRegion || isAskingTutor) {
      return;
    }

    const timestamp = Date.now();
    const studentMsg: TutorMessage = {
      id: `student-screen-${timestamp}`,
      role: 'student',
      contextLabel: `${capturedScreenRegion.sourceLabel} · ${capturedScreenRegion.width}×${capturedScreenRegion.height}`,
      imagePreviewUrl: capturedScreenRegion.dataUrl,
      text: questionText,
    };

    setMessages((prev) => [...prev, studentMsg]);
    setLastTutorQuestion(questionText);
    setIsAskingTutor(true);

    try {
      const result = await analyzeScreenRegion({
        question: questionText,
        imageBase64: capturedScreenRegion.base64,
        mimeType: capturedScreenRegion.mimeType,
        activeStageName:
          resolvedAssetParts.find((p) => p.id === selectedAssetPartId)?.label ??
          selectedStage.name,
        activeAssetId,
        activeExplorationLevel: explorationLevel,
        uploadedAssets: uploadedAssetSummaries,
        previousConcept: lastScreenConcept ?? undefined,
        selectedGeneratedComponentName: selectedGeneratedComponent?.name,
      });

      setLastScreenConcept(result.mainConcept);

      const tutorReply: TutorMessage = {
        id: `tutor-screen-${Date.now()}`,
        role: 'tutor',
        contextLabel: result.mainConcept,
        text: result.explanation,
        structured: result,
      };
      setMessages((prev) => [...prev, tutorReply]);

      applyVisualizationFromGemini(result);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Unable to analyze the captured screen region.';
      setMessages((prev) => [
        ...prev,
        {
          id: `tutor-screen-err-${Date.now()}`,
          role: 'tutor',
          contextLabel: 'Screen Analysis Error',
          text: message,
          isError: true,
        },
      ]);
    } finally {
      setIsAskingTutor(false);
    }
  };

  const handleSendQuestion = async (questionText: string) => {
    if (isAskingTutor) {
      return;
    }

    if (!pinnedExcerpt && capturedScreenRegion) {
      await runScreenAnalysis(questionText);
      return;
    }

    const activeExcerpt = pinnedExcerpt;
    const timestamp = Date.now();

    const activePartLabel = resolvedAssetParts.find(
      (p) => p.id === selectedAssetPartId,
    )?.label;

    const studentMsg: TutorMessage = {
      id: `student-${timestamp}`,
      role: 'student',
      contextLabel: activeExcerpt
        ? `${activeExcerpt.documentTitle} · p.${activeExcerpt.pageNumber}`
        : generatedScene?.feasible
          ? generatedScene.systemTitle
          : activeAsset && activeAsset.modelFormat === 'glb'
            ? activePartLabel
              ? `${activeAsset.name} · ${activePartLabel}`
              : activeAsset.name
            : studyModule.label,
      excerptPreview: activeExcerpt?.text,
      text: questionText,
    };

    setMessages((prev) => [...prev, studentMsg]);
    setPinnedExcerpt(null);
    setLastTutorQuestion(questionText);
    setIsAskingTutor(true);

    try {
      const result = await askGeminiTutor({
        question: questionText,
        highlightedText: activeExcerpt?.text,
        pageContext: activeExcerpt?.pageContext,
        documentTitle: activeExcerpt?.documentTitle ?? activeDocumentTitle,
        pageNumber: activeExcerpt?.pageNumber ?? currentPage,
        activeModuleLabel:
          pdfSourceMode === 'example' ? studyModule.label : undefined,
        activeStageName: activePartLabel ?? selectedStage.name,
        activeAssetId,
        activeExplorationLevel: explorationLevel,
        uploadedAssets: uploadedAssetSummaries,
        activeGeneratedSystemTitle: generatedScene?.feasible
          ? generatedScene.systemTitle
          : undefined,
        selectedGeneratedComponentName: selectedGeneratedComponent?.name,
      });

      const tutorReply: TutorMessage = {
        id: `tutor-${Date.now()}`,
        role: 'tutor',
        contextLabel: result.mainConcept,
        text: result.explanation,
        structured: result,
      };
      setMessages((prev) => [...prev, tutorReply]);

      applyVisualizationFromGemini(result);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Unable to reach the Gemini AI Tutor service.';
      setMessages((prev) => [
        ...prev,
        {
          id: `tutor-err-${Date.now()}`,
          role: 'tutor',
          contextLabel: 'Request Error',
          text: message,
          isError: true,
        },
      ]);
    } finally {
      setIsAskingTutor(false);
    }
  };

  // Compute hierarchical Exploration Breadcrumbs (Phase 3 + Showcase Controller)
  const breadcrumbs: BreadcrumbItem[] = useMemo(() => {
    if (activeSubsystemContext && generatedScene?.feasible) {
      const items: BreadcrumbItem[] = [
        {
          id: 'parent-asset',
          label: `${activeSubsystemContext.parentAssetName} (Full 3D)`,
          onClick: () =>
            loadGlbAssetState(activeSubsystemContext.parentAssetId, {
              level: 'full-object',
              focusPartId: null,
            }),
        },
        {
          id: 'subsystem',
          label: activeSubsystemContext.subsystemLabel,
          onClick: () => {
            setGeneratedFocusTarget('overview');
            setGeneratedFocusTrigger((n) => n + 1);
          },
        },
      ];
      if (selectedGeneratedComponent) {
        items.push({
          id: `comp-${selectedGeneratedComponent.id}`,
          label: selectedGeneratedComponent.name,
        });
      }
      return items;
    }

    if (generatedScene?.feasible) {
      const items: BreadcrumbItem[] = [
        {
          id: 'ai-concept',
          label: generatedScene.systemTitle,
          onClick: () => {
            setGeneratedFocusTarget('overview');
            setGeneratedFocusTrigger((n) => n + 1);
          },
        },
      ];
      if (selectedGeneratedComponent) {
        items.push({
          id: `comp-${selectedGeneratedComponent.id}`,
          label: selectedGeneratedComponent.name,
        });
      }
      return items;
    }

    if (isExtraGlbActive && activeAsset) {
      const items: BreadcrumbItem[] = [
        {
          id: `asset-${activeAsset.id}`,
          label: `${activeAsset.name} (${activeAsset.license})`,
          onClick: () =>
            loadGlbAssetState(activeAsset.id, { level: 'full-object', focusPartId: null }),
        },
      ];
      if (explorationLevel === 'internal-structure') {
        items.push({
          id: 'internal-overlay',
          label: 'Internal Structure (Illustrative Overlay)',
        });
      } else if (selectedAssetPartId) {
        const partLabel =
          resolvedAssetParts.find((p) => p.id === selectedAssetPartId)?.label ??
          selectedAssetPartId;
        items.push({ id: `part-${selectedAssetPartId}`, label: partLabel });
      }
      return items;
    }

    const showcaseDesc = sceneController.descriptor;
    const showcaseState = sceneController.state;

    if (showcaseDesc.sceneId === 'inline-six') {
      const items: BreadcrumbItem[] = [
        {
          id: 'inline-six-root',
          label: 'Inline-Six Engine (Full Assembly)',
          onClick: () => sceneController.focusComponent('overview'),
        },
      ];
      if (showcaseState.activeComponentId) {
        const comp = showcaseDesc.hierarchy.find(
          (c) => c.id === showcaseState.activeComponentId,
        );
        const snap = evaluateInlineSixKinematics(showcaseState.crankAngleDeg);
        const cyl = snap.cylinders.find((c) => c.componentId === showcaseState.activeComponentId);
        items.push({
          id: `i6-${showcaseState.activeComponentId}`,
          label: cyl
            ? `${comp?.name ?? showcaseState.activeComponentId} · ${cyl.strokePhase.toUpperCase()}`
            : comp?.name ?? showcaseState.activeComponentId,
        });
      }
      return items;
    }

    if (showcaseDesc.sceneId === 'six-stroke') {
      const snap = evaluateSixStrokeKinematics(
        showcaseState.crankAngleDeg,
        showcaseState.sixStrokeVariant,
      );
      const variantMeta = SIX_STROKE_VARIANTS[showcaseState.sixStrokeVariant];
      const items: BreadcrumbItem[] = [
        {
          id: 'six-stroke-root',
          label: `${variantMeta.shortLabel} (${snap.strokeLabel})`,
          onClick: () => sceneController.focusComponent('overview'),
        },
      ];
      if (showcaseState.activeComponentId) {
        const comp = showcaseDesc.hierarchy.find(
          (c) => c.id === showcaseState.activeComponentId,
        );
        items.push({
          id: `s6-${showcaseState.activeComponentId}`,
          label: comp?.name ?? showcaseState.activeComponentId,
        });
      }
      return items;
    }

    if (showcaseDesc.sceneId === 'robotic-arm') {
      const seq = showcaseDesc.sequences.find(
        (s) => s.id === showcaseState.activeSequenceId,
      );
      const pose = evaluateRobotArmSequence(
        (showcaseState.activeSequenceId as RobotSequenceId) ?? 'sequence-a-pick-place',
        showcaseState.sequenceProgress,
        showcaseState.baseTurnDeg,
      );
      const items: BreadcrumbItem[] = [
        {
          id: 'robot-root',
          label: seq?.label ?? 'Robotic Arm & Apple',
          onClick: () => sceneController.focusComponent('overview'),
        },
        {
          id: 'robot-phase',
          label: pose.phaseLabel,
        },
      ];
      if (showcaseState.activeComponentId) {
        const comp = showcaseDesc.hierarchy.find(
          (c) => c.id === showcaseState.activeComponentId,
        );
        if (comp) {
          items.push({ id: `robot-comp-${comp.id}`, label: comp.name });
        }
      }
      return items;
    }

    if (
      (showcaseDesc.sceneId === 'cordless-drill' ||
        showcaseDesc.sceneId === 'ship-propulsion') &&
      activeAsset
    ) {
      const items: BreadcrumbItem[] = [
        {
          id: `showcase-${showcaseDesc.sceneId}`,
          label: `${showcaseDesc.shortLabel} (${activeAsset.license})`,
          onClick: () => {
            setSelectedAssetPartId(null);
            setAssetFocusTarget('overview');
            setAssetFocusTrigger((n) => n + 1);
            setIsolateSelected(false);
            sceneController.focusComponent('overview');
          },
        },
      ];
      if (selectedAssetPartId) {
        const partLabel =
          resolvedAssetParts.find((p) => p.id === selectedAssetPartId)?.label ??
          showcaseDesc.hierarchy.find((c) => c.id === selectedAssetPartId)?.name ??
          selectedAssetPartId;
        items.push({ id: `part-${selectedAssetPartId}`, label: partLabel });
      } else if (explorationLevel === 'internal-structure') {
        items.push({
          id: 'showcase-cutaway',
          label:
            showcaseDesc.sceneId === 'cordless-drill'
              ? 'Internal Planetary Drivetrain'
              : 'Internal Propulsion Shaftline',
        });
      }
      return items;
    }

    return [
      {
        id: 'turbofan-root',
        label: 'Turbofan Engine (Complete Machine)',
        onClick: () => {
          sceneController.focusComponent('overview');
          setCameraFocusMode('overview');
          setFocusTrigger((n) => n + 1);
        },
      },
      {
        id: `stage-${selectedStage.id}`,
        label: selectedStage.name,
      },
    ];
  }, [
    activeSubsystemContext,
    generatedScene,
    selectedGeneratedComponent,
    isExtraGlbActive,
    activeAsset,
    explorationLevel,
    selectedAssetPartId,
    resolvedAssetParts,
    sceneController,
    selectedStage,
  ]);

  const voiceCaptionOverlay: VoiceCaptionOverlayData | null = useMemo(() => {
    if (
      !voicePlayer.captionsEnabled ||
      !voicePlayer.lesson ||
      !voicePlayer.activeSegment ||
      (voicePlayer.status !== 'playing' &&
        voicePlayer.status !== 'paused' &&
        voicePlayer.status !== 'completed')
    ) {
      return null;
    }
    const seg = voicePlayer.activeSegment;
    const compLabel =
      activeModelDescriptor.components.find((c) => c.id === seg.componentId)?.name ??
      seg.title;
    return {
      stepNumber: voicePlayer.currentSegmentIndex + 1,
      totalSteps: voicePlayer.lesson.segments.length,
      componentLabel: compLabel,
      difficulty: voicePlayer.lesson.difficulty,
      personality: voicePlayer.lesson.personality,
      captionText: seg.captionText,
      isPlaying: voicePlayer.status === 'playing',
      isBufferingAudio: voicePlayer.isBufferingAudio,
      segments: voicePlayer.lesson.segments,
      activeSegmentIndex: voicePlayer.currentSegmentIndex,
      onTogglePlayPause: voicePlayer.togglePlayPause,
      onJumpToSegment: voicePlayer.jumpToSegment,
      onHideCaptions: () => voicePlayer.setCaptionsEnabled(false),
    };
  }, [voicePlayer, activeModelDescriptor.components]);

  const showPdfOnDesktop = expandedPanel === null || expandedPanel === 'pdf';
  const showVizOnDesktop =
    expandedPanel === null || expandedPanel === 'visualization';
  const showTutorOnDesktop = expandedPanel === null || expandedPanel === 'tutor';

  const desktopGridColsClass =
    expandedPanel !== null
      ? 'lg:grid-cols-1'
      : isFocusMode
        ? 'lg:grid-cols-[minmax(680px,70fr)_minmax(300px,30fr)]'
        : 'lg:grid-cols-[minmax(280px,28fr)_minmax(420px,44fr)_minmax(280px,28fr)]';

  return (
    <div className="h-dvh flex flex-col bg-[#080B12] text-slate-100 overflow-hidden">
      <StudioHeader
        activeModuleId={activeModuleId}
        onSelectModule={handleSelectModule}
        onResetLayout={handleResetLayout}
      />

      {/* Responsive Mobile/Tablet Controls Bar (< 1024px) */}
      <div className="lg:hidden shrink-0 border-b border-slate-800 bg-[#0B101A] px-3 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <label
            htmlFor="mobile-module-select"
            className="text-xs font-medium text-slate-400 whitespace-nowrap"
          >
            Module
          </label>
          <select
            id="mobile-module-select"
            value={activeModuleId}
            onChange={(e) => handleSelectModule(e.target.value as StudyModuleId)}
            className="flex-1 bg-[#111827] border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          >
            {STUDY_MODULES.map((mod) => (
              <option key={mod.id} value={mod.id}>
                {mod.label}
              </option>
            ))}
          </select>
        </div>

        <div
          role="tablist"
          aria-label="Workspace panels"
          className="grid grid-cols-3 gap-1 p-0.5 bg-[#080B12] border border-slate-800 rounded-md"
        >
          {MOBILE_PANEL_TABS.map((tab) => {
            const active = tab.id === mobileActivePanel;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMobileActivePanel(tab.id)}
                className={`px-2 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-100 border border-transparent'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Three-Panel Studio Workspace */}
      <main className="flex-1 min-h-0 p-3 lg:p-4">
        <div
          data-testid="studio-grid"
          data-expanded-panel={expandedPanel ?? 'none'}
          data-focus-mode={isFocusMode ? 'true' : 'false'}
          className={`h-full min-h-0 grid gap-3 lg:gap-4 grid-cols-1 transition-all duration-200 ${desktopGridColsClass}`}
        >
          {/* Panel 1: Learning Materials */}
          <div
            data-testid="panel-materials-wrapper"
            className={`min-h-0 min-w-0 h-full overflow-hidden transition-opacity duration-200 ${
              mobileActivePanel === 'pdf' ? 'block' : 'hidden'
            } ${showPdfOnDesktop && !isFocusMode ? 'lg:block' : 'lg:hidden'}`}
          >
            <PdfViewerPanel
              learningInputMode={learningInputMode}
              onChangeLearningInputMode={(mode) => {
                setLearningInputMode(mode);
                if (isFocusMode) setIsFocusMode(false);
              }}
              studyModule={studyModule}
              pdfSourceMode={pdfSourceMode}
              uploadedPdf={uploadedPdf}
              currentPage={currentPage}
              zoomPercent={zoomPercent}
              isExpanded={expandedPanel === 'pdf'}
              onSelectSourceMode={handleSelectSourceMode}
              onUploadPdf={handleUploadPdf}
              onUploadedPdfLoaded={handleUploadedPdfLoaded}
              onPageChange={handlePageChange}
              onZoomChange={handleZoomChange}
              onToggleExpand={() => handleToggleExpand('pdf')}
              onAskGeminiWithSelection={handleAskGeminiWithSelection}
              capturedScreenRegion={capturedScreenRegion}
              screenQuestion={screenQuestion}
              isAnalyzingScreen={isAskingTutor}
              onChangeScreenQuestion={setScreenQuestion}
              onCaptureScreenRegion={handleCaptureScreenRegion}
              onVisualizeScreen={runScreenAnalysis}
            />
          </div>

          {/* Panel 2: Interactive 3D Visualization */}
          <div
            className={`min-h-0 h-full ${
              mobileActivePanel === 'visualization' ? 'block' : 'hidden'
            } ${showVizOnDesktop ? 'lg:block' : 'lg:hidden'}`}
          >
            <VisualizationPanel
              studyModule={studyModule}
              sceneController={sceneController}
              isExtraGlbActive={isExtraGlbActive}
              sceneNoticeBanner={sceneNoticeBanner}
              onDismissSceneNotice={() => setSceneNoticeBanner(null)}
              onSelectShowcaseScene={handleSelectShowcaseScene}
              availableAssets={availableAssets}
              activeAsset={activeAsset}
              explorationLevel={explorationLevel}
              breadcrumbs={breadcrumbs}
              resolvedAssetParts={resolvedAssetParts}
              selectedAssetPartId={selectedAssetPartId}
              assetFocusTarget={assetFocusTarget}
              assetFocusTrigger={assetFocusTrigger}
              assetBounds={assetBounds}
              assetLoadProgress={assetLoadProgress}
              assetLoadError={assetLoadError}
              assetMeshStats={assetMeshStats}
              activeSubsystemNotice={activeSubsystemContext?.truthfulnessLabel ?? null}
              selectedStageId={selectedStageId}
              cameraFocusMode={cameraFocusMode}
              focusTrigger={focusTrigger}
              layerMode={layerMode}
              throttlePercent={throttlePercent}
              isPlaying={isPlaying}
              isExploded={isExploded}
              isExpanded={expandedPanel === 'visualization'}
              isFocusMode={isFocusMode}
              geminiFocusedStage={geminiFocusedStage}
              unsupportedNotice={unsupportedVizNotice}
              generatedScene={generatedScene}
              selectedGeneratedComponentId={selectedGeneratedComponentId}
              generatedFocusTarget={generatedFocusTarget}
              generatedFocusTrigger={generatedFocusTrigger}
              isolateSelected={isolateSelected}
              showConnections={showConnections}
              showLabels={showLabels}
              simSpeed={simSpeed}
              onSelectAsset={handleSelectAsset}
              onUploadGlbAsset={handleUploadGlbAsset}
              onChangeExplorationLevel={handleChangeExplorationLevel}
              onSelectAssetPart={(partId) => {
                handleSelectAssetPart(partId);
                sceneController.focusComponent(partId);
              }}
              onOpenIllustrativeSubsystem={(sub) => openIllustrativeSubsystem(sub)}
              onAssetLoadProgress={setAssetLoadProgress}
              onAssetLoadComplete={handleAssetLoadComplete}
              onAssetLoadError={setAssetLoadError}
              onSelectStage={(stageId) => {
                focusStageCamera(stageId);
                sceneController.focusComponent(stageId);
                setGeminiFocusedStage(false);
                setUnsupportedVizNotice(null);
              }}
              onChangeLayerMode={(mode) => {
                setLayerMode(mode);
                sceneController.setViewMode(mode);
              }}
              onThrottleChange={(val) => {
                setThrottlePercent(val);
                sceneController.setThrottlePercent(val);
              }}
              onTogglePlay={() => {
                setIsPlaying((prev) => {
                  const next = !prev;
                  if (next) sceneController.resumeSequence(false);
                  else sceneController.pauseSequence(false);
                  return next;
                });
              }}
              onToggleExploded={() => {
                setIsExploded((prev) => {
                  const next = !prev;
                  sceneController.setExploded(next);
                  return next;
                });
              }}
              onFocusOverview={handleFocusOverview}
              onResetStage={handleResetStage}
              onDismissUnsupportedNotice={() => {
                setUnsupportedVizNotice(null);
                setGeneratedScene(null);
                setIsFocusMode(false);
              }}
              onToggleExpand={() => handleToggleExpand('visualization')}
              onToggleFocusMode={() => {
                setExpandedPanel(null);
                setIsFocusMode((prev) => !prev);
              }}
              onSelectGeneratedComponent={handleSelectGeneratedComponent}
              onToggleIsolateSelected={() => setIsolateSelected((prev) => !prev)}
              onToggleShowConnections={() => setShowConnections((prev) => !prev)}
              onToggleShowLabels={() => {
                setShowLabels((prev) => {
                  const next = !prev;
                  sceneController.setShowLabels(next);
                  return next;
                });
              }}
              onChangeSimSpeed={(spd) => {
                setSimSpeed(spd);
                sceneController.setPlaybackSpeed(spd);
              }}
              onReturnToTurbofan={() => handleSelectShowcaseScene('turbofan')}
              voiceCaption={voiceCaptionOverlay}
            />
          </div>

          {/* Panel 3: Gemini AI Tutor */}
          <div
            className={`min-h-0 h-full ${
              mobileActivePanel === 'tutor' ? 'block' : 'hidden'
            } ${showTutorOnDesktop ? 'lg:block' : 'lg:hidden'}`}
          >
            <AiTutorPanel
              studyModule={studyModule}
              selectedStage={selectedStage}
              activeGeneratedSystemTitle={
                generatedScene?.feasible
                  ? generatedScene.systemTitle
                  : isExtraGlbActive && activeAsset
                    ? activeAsset.name
                    : sceneController.state.sceneId !== 'turbofan'
                      ? sceneController.descriptor.title
                      : null
              }
              activeGeneratedComponentName={
                generatedScene?.feasible
                  ? selectedGeneratedComponent?.name ?? null
                  : isExtraGlbActive
                    ? resolvedAssetParts.find((p) => p.id === selectedAssetPartId)?.label ?? null
                    : sceneController.state.sceneId !== 'turbofan'
                      ? sceneController.descriptor.hierarchy.find(
                          (c) => c.id === sceneController.state.activeComponentId,
                        )?.name ?? null
                      : null
              }
              activeModelTitle={activeModelDescriptor.systemTitle}
              activeDocumentTitle={activeDocumentTitle}
              messages={messages}
              pinnedExcerpt={pinnedExcerpt}
              pinnedScreenCapture={capturedScreenRegion}
              isLoading={isAskingTutor}
              isExpanded={expandedPanel === 'tutor'}
              inputRef={tutorInputRef}
              voicePlayer={voicePlayer}
              onTeachMe={handleTeachMe}
              onClearExcerpt={() => setPinnedExcerpt(null)}
              onClearScreenCapture={handleClearScreenCapture}
              onSendQuestion={handleSendQuestion}
              onToggleExpand={() => handleToggleExpand('tutor')}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
