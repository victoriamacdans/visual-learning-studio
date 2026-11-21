import { useRef, type ChangeEvent } from 'react';
import {
  Box,
  ChevronRight,
  Crosshair,
  Eye,
  Focus,
  GitBranch,
  Layers,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Tag,
  Upload,
} from 'lucide-react';
import {
  APP_CONFIG,
  type VisualizationLayerMode,
} from '../config/appConfig';
import {
  ENGINE_STAGES,
  type EngineStageInfo,
  type StudyModule,
} from '../data/jetPropulsionContent';
import type { SceneControllerApi } from '../hooks/useSceneController';
import type {
  AssetRegistryEntry,
  IllustrativeSubsystemDefinition,
} from '../three/assetRegistry';
import type { ResolvedGlbPart } from '../three/gltfAssetUtils';
import { evaluateInlineSixKinematics } from '../three/inlineSixKinematics';
import {
  evaluateSixStrokeKinematics,
  SIX_STROKE_VARIANTS,
  type SixStrokeVariantId,
} from '../three/sixStrokeKinematics';
import {
  evaluateRobotArmSequence,
  type RobotSequenceId,
} from '../three/robotArmKinematics';
import {
  SHOWCASE_SCENE_LIST,
  type SceneViewMode,
} from '../three/sceneController';
import type {
  ConceptDiagramSpec,
  EngineComponentId,
  ExplorationLevel,
  GeneratedScene3DSpec,
  ShowcaseSceneId,
} from '../types/tutor';
import { computeSimplifiedEngineTelemetry } from '../utils/studioState';
import { ConceptDiagram2D } from './ConceptDiagram2D';
import {
  VoiceCaptionStrip,
  type VoiceCaptionStripData,
} from './VoiceCaptionStrip';
import { AssetSceneCanvas } from './three/AssetSceneCanvas';
import type { LoadedGlbAssetSummary } from './three/AssetModel3D';
import { DynamicSceneCanvas } from './three/DynamicSceneCanvas';
import { EngineSceneCanvas } from './three/EngineSceneCanvas';
import { InlineSixSceneCanvas } from './three/InlineSixSceneCanvas';
import { RoboticArmSceneCanvas } from './three/RoboticArmSceneCanvas';
import { SixStrokeSceneCanvas } from './three/SixStrokeSceneCanvas';

export interface UnsupportedVisualizationNotice {
  readonly concept: string;
  readonly recommendation: string;
  readonly infeasibilityReason?: string;
  readonly diagramData?: ConceptDiagramSpec;
}

export interface BreadcrumbItem {
  readonly id: string;
  readonly label: string;
  readonly onClick?: () => void;
}

export type VoiceCaptionOverlayData = VoiceCaptionStripData;

interface VisualizationPanelProps {
  studyModule: StudyModule;
  sceneController: SceneControllerApi;
  isExtraGlbActive: boolean;
  sceneNoticeBanner: string | null;
  onDismissSceneNotice: () => void;
  onSelectShowcaseScene: (sceneId: ShowcaseSceneId) => void;
  availableAssets: readonly AssetRegistryEntry[];
  activeAsset: AssetRegistryEntry | null;
  explorationLevel: ExplorationLevel;
  breadcrumbs: readonly BreadcrumbItem[];
  resolvedAssetParts: readonly ResolvedGlbPart[];
  selectedAssetPartId: string | null;
  assetFocusTarget: string | 'overview';
  assetFocusTrigger: number;
  assetBounds: {
    center: readonly [number, number, number];
    size: readonly [number, number, number];
  } | null;
  assetLoadProgress: number;
  assetLoadError: string | null;
  assetMeshStats: { meshCount: number; triangleCount: number } | null;
  activeSubsystemNotice: string | null;
  selectedStageId: EngineComponentId;
  cameraFocusMode: EngineComponentId | 'overview';
  focusTrigger: number;
  layerMode: VisualizationLayerMode;
  throttlePercent: number;
  isPlaying: boolean;
  isExploded: boolean;
  isExpanded: boolean;
  isFocusMode: boolean;
  geminiFocusedStage: boolean;
  unsupportedNotice: UnsupportedVisualizationNotice | null;
  generatedScene: GeneratedScene3DSpec | null;
  selectedGeneratedComponentId: string | null;
  generatedFocusTarget: string | 'overview';
  generatedFocusTrigger: number;
  isolateSelected: boolean;
  showConnections: boolean;
  showLabels: boolean;
  simSpeed: number;
  onSelectAsset: (assetId: string) => void;
  onUploadGlbAsset: (file: File) => void;
  onChangeExplorationLevel: (level: ExplorationLevel) => void;
  onSelectAssetPart: (partId: string) => void;
  onOpenIllustrativeSubsystem: (subsystem: IllustrativeSubsystemDefinition) => void;
  onAssetLoadProgress: (pct: number) => void;
  onAssetLoadComplete: (summary: LoadedGlbAssetSummary) => void;
  onAssetLoadError: (msg: string) => void;
  onSelectStage: (stageId: EngineStageInfo['id']) => void;
  onChangeLayerMode: (mode: VisualizationLayerMode) => void;
  onThrottleChange: (value: number) => void;
  onTogglePlay: () => void;
  onToggleExploded: () => void;
  onFocusOverview: () => void;
  onResetStage: () => void;
  onDismissUnsupportedNotice: () => void;
  onToggleExpand: () => void;
  onToggleFocusMode: () => void;
  onSelectGeneratedComponent: (id: string) => void;
  onToggleIsolateSelected: () => void;
  onToggleShowConnections: () => void;
  onToggleShowLabels: () => void;
  onChangeSimSpeed: (speed: number) => void;
  onReturnToTurbofan: () => void;
  voiceCaption?: VoiceCaptionOverlayData | null;
}

const LAYER_MODES: readonly { id: VisualizationLayerMode; label: string }[] = [
  { id: 'cutaway', label: 'Cutaway' },
  { id: 'airflow', label: 'Airflow' },
  { id: 'thermal', label: 'Thermal' },
];

const INLINE_SIX_VIEW_MODES: readonly { id: SceneViewMode; label: string }[] = [
  { id: 'cutaway', label: 'Cutaway' },
  { id: 'full', label: 'Full Exterior' },
  { id: 'internal', label: 'Internal Core' },
];

const ROBOT_TURN_ANGLES: readonly number[] = [-90, 45, 90, 135, 180];

const EXPLORATION_LEVELS: readonly { id: ExplorationLevel; label: string }[] = [
  { id: 'full-object', label: '1. Full Object' },
  { id: 'internal-structure', label: '2. Internal Structure' },
  { id: 'component-detail', label: '3. Component Detail' },
];

const SIM_SPEEDS: readonly number[] = [0.5, 1, 2];

/**
 * Panel 2: Interactive 3D Visualization stage.
 * Renders:
 * 1) Realistic CC0 & User-Uploaded GLB/glTF Assets (AssetSceneCanvas) with PBR lighting,
 *    selectable mesh hierarchy, bounds-based camera focus, animated sub-meshes, & cutaway overlays
 * 2) High-detail 8-stage parametric 3D Turbofan Engine (EngineSceneCanvas)
 * 3) Illustrative Subsystems & Universal Conceptual 3D Scenes (DynamicSceneCanvas)
 * 4) Honest 2D schematic / limitation fallback when 3D representation is inappropriate
 */
export function VisualizationPanel({
  studyModule,
  sceneController,
  isExtraGlbActive,
  sceneNoticeBanner,
  onDismissSceneNotice,
  onSelectShowcaseScene,
  availableAssets,
  activeAsset,
  explorationLevel,
  breadcrumbs,
  resolvedAssetParts,
  selectedAssetPartId,
  assetFocusTarget,
  assetFocusTrigger,
  assetBounds,
  assetLoadProgress,
  assetLoadError,
  assetMeshStats,
  activeSubsystemNotice,
  selectedStageId,
  cameraFocusMode,
  focusTrigger,
  layerMode,
  throttlePercent,
  isPlaying,
  isExploded,
  isExpanded,
  isFocusMode,
  geminiFocusedStage,
  unsupportedNotice,
  generatedScene,
  selectedGeneratedComponentId,
  generatedFocusTarget,
  generatedFocusTrigger,
  isolateSelected,
  showConnections,
  showLabels,
  simSpeed,
  onSelectAsset,
  onUploadGlbAsset,
  onChangeExplorationLevel,
  onSelectAssetPart,
  onOpenIllustrativeSubsystem,
  onAssetLoadProgress,
  onAssetLoadComplete,
  onAssetLoadError,
  onSelectStage,
  onChangeLayerMode,
  onThrottleChange,
  onTogglePlay,
  onToggleExploded,
  onFocusOverview,
  onResetStage,
  onDismissUnsupportedNotice,
  onToggleExpand,
  onToggleFocusMode,
  onSelectGeneratedComponent,
  onToggleIsolateSelected,
  onToggleShowConnections,
  onToggleShowLabels,
  onChangeSimSpeed,
  onReturnToTurbofan,
  voiceCaption,
}: VisualizationPanelProps) {
  const glbFileInputRef = useRef<HTMLInputElement | null>(null);

  const activeStage =
    ENGINE_STAGES.find((stage) => stage.id === selectedStageId) ?? ENGINE_STAGES[0];
  const telemetry = computeSimplifiedEngineTelemetry(throttlePercent);

  const isGeneratedActive = Boolean(generatedScene && generatedScene.feasible);
  const showcaseState = sceneController.state;
  const showcaseDesc = sceneController.descriptor;
  const isShowcaseSceneMode = Boolean(!unsupportedNotice && !isGeneratedActive && !isExtraGlbActive);
  const isInlineSixActive = isShowcaseSceneMode && showcaseState.sceneId === 'inline-six';
  const isSixStrokeActive = isShowcaseSceneMode && showcaseState.sceneId === 'six-stroke';
  const isRoboticArmActive = isShowcaseSceneMode && showcaseState.sceneId === 'robotic-arm';
  const isGlbAssetActive = Boolean(
    !unsupportedNotice &&
      !isGeneratedActive &&
      !isInlineSixActive &&
      !isSixStrokeActive &&
      !isRoboticArmActive &&
      activeAsset &&
      activeAsset.modelFormat === 'glb',
  );

  const selectedGenComp =
    isGeneratedActive && generatedScene
      ? generatedScene.components.find((c) => c.id === selectedGeneratedComponentId) ??
        generatedScene.components[0] ??
        null
      : null;

  const selectedGlbPart =
    isGlbAssetActive && resolvedAssetParts.length > 0
      ? resolvedAssetParts.find((p) => p.id === selectedAssetPartId) ?? null
      : null;

  const relatedConnections =
    isGeneratedActive && generatedScene && selectedGenComp
      ? generatedScene.connections.filter(
          (conn) =>
            conn.fromId === selectedGenComp.id || conn.toId === selectedGenComp.id,
        )
      : [];

  const inlineSixSnapshot = isInlineSixActive
    ? evaluateInlineSixKinematics(showcaseState.crankAngleDeg)
    : null;
  const activeInlineSixComp = isInlineSixActive
    ? showcaseDesc.hierarchy.find((c) => c.id === showcaseState.activeComponentId) ?? null
    : null;
  const activeInlineSixCyl =
    inlineSixSnapshot && showcaseState.activeComponentId
      ? inlineSixSnapshot.cylinders.find(
          (c) => c.componentId === showcaseState.activeComponentId,
        ) ?? null
      : null;

  const sixStrokeVariant = showcaseState.sixStrokeVariant;
  const sixStrokeVariantMeta = SIX_STROKE_VARIANTS[sixStrokeVariant];
  const sixStrokeSnapshot = isSixStrokeActive
    ? evaluateSixStrokeKinematics(showcaseState.crankAngleDeg, sixStrokeVariant)
    : null;
  const activeSixStrokeComp = isSixStrokeActive
    ? showcaseDesc.hierarchy.find((c) => c.id === showcaseState.activeComponentId) ?? null
    : null;

  const robotSeqId =
    (showcaseState.activeSequenceId as RobotSequenceId | null) ?? 'sequence-a-pick-place';
  const robotPose = isRoboticArmActive
    ? evaluateRobotArmSequence(
        robotSeqId,
        showcaseState.sequenceProgress,
        showcaseState.baseTurnDeg,
      )
    : null;
  const activeRobotComp = isRoboticArmActive
    ? showcaseDesc.hierarchy.find((c) => c.id === showcaseState.activeComponentId) ?? null
    : null;
  const activeRobotSeqDesc = isRoboticArmActive
    ? showcaseDesc.sequences.find((s) => s.id === robotSeqId) ?? showcaseDesc.sequences[0]
    : null;

  const handleGlbFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    onUploadGlbAsset(file);
  };

  return (
    <section
      aria-label="Interactive 3D Visualization"
      data-testid="panel-visualization"
      className="flex flex-col h-full min-h-0 bg-[#0E131F] border border-slate-800 rounded-lg overflow-hidden"
    >
      {/* Panel Header */}
      <div className="h-11 shrink-0 px-3.5 border-b border-slate-800 bg-[#111827] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Box className="w-4 h-4 text-cyan-400 shrink-0" aria-hidden="true" />
          <h2 className="font-display text-sm font-semibold text-slate-100 truncate">
            Interactive 3D Visualization
          </h2>
          <span aria-hidden="true" className="text-slate-600 text-xs hidden xl:inline">
            ·
          </span>
          <span className="text-xs text-slate-400 truncate hidden xl:inline">
            {isGeneratedActive && generatedScene
              ? generatedScene.systemTitle
              : isInlineSixActive || isSixStrokeActive || isRoboticArmActive
                ? showcaseDesc.title
                : isGlbAssetActive && activeAsset
                  ? `${activeAsset.name} (${activeAsset.license})`
                  : APP_CONFIG.simulationDefaults.simulationModelNote}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Asset Registry Selector + Custom GLB Upload */}
          {!isFocusMode && (
            <>
              <label htmlFor="asset-registry-select" className="sr-only">
                Select 3D Asset
              </label>
              <select
                id="asset-registry-select"
                data-testid="asset-registry-select"
                value={
                  isGeneratedActive ||
                  isInlineSixActive ||
                  isSixStrokeActive ||
                  isRoboticArmActive
                    ? ''
                    : activeAsset?.id ?? 'turbofan-engine'
                }
                onChange={(e) => {
                  if (e.target.value) onSelectAsset(e.target.value);
                }}
                className="bg-[#0B101B] border border-slate-700/80 rounded px-2 py-1 text-xs text-slate-200 max-w-[138px] focus:outline-none focus:ring-2 focus:ring-cyan-400"
              >
                {(isGeneratedActive ||
                  isInlineSixActive ||
                  isSixStrokeActive ||
                  isRoboticArmActive) && (
                  <option value="">
                    {isInlineSixActive
                      ? 'Inline-6 Showcase'
                      : isSixStrokeActive
                        ? 'Six-Stroke Cutaway'
                        : isRoboticArmActive
                          ? 'Robotic Arm Showcase'
                          : activeSubsystemNotice
                            ? 'Subsystem View'
                            : 'AI 3D Concept'}
                  </option>
                )}
                {availableAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name}
                  </option>
                ))}
              </select>

              <input
                ref={glbFileInputRef}
                type="file"
                accept=".glb,.gltf"
                data-testid="glb-upload-input"
                onChange={handleGlbFileChange}
                className="hidden"
              />
              <button
                type="button"
                data-testid="upload-glb-btn"
                onClick={() => glbFileInputRef.current?.click()}
                title="Upload custom .glb or .gltf 3D model"
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-900 border border-slate-700/80 rounded hover:bg-slate-800 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                <Upload className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
                <span className="hidden sm:inline">Upload GLB</span>
              </button>
            </>
          )}

          {!unsupportedNotice && (
            <button
              type="button"
              data-testid="toggle-focus-mode-btn"
              onClick={onToggleFocusMode}
              aria-pressed={isFocusMode}
              className={`hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                isFocusMode
                  ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200'
                  : 'bg-slate-900 border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Focus className="w-3.5 h-3.5" aria-hidden="true" />
              {isFocusMode ? 'Exit Focus' : 'Focus Mode'}
            </button>
          )}

          <button
            type="button"
            onClick={onToggleExpand}
            aria-label={
              isExpanded
                ? 'Restore Interactive 3D Visualization'
                : 'Expand Interactive 3D Visualization'
            }
            title={isExpanded ? 'Restore panel layout' : 'Expand 3D Visualization'}
            className="hidden lg:inline-flex p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded transition-colors duration-150 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            {isExpanded ? (
              <Minimize2 className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Maximize2 className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Showcase Demonstrations Selector Strip (hidden in Focus Mode to maximize canvas) */}
      {!isFocusMode && (
        <div
          role="tablist"
          aria-label="Showcase 3D demonstrations"
          data-testid="showcase-demo-tabs"
          className="shrink-0 px-3.5 py-1.5 border-b border-slate-800/80 bg-[#090D16] flex flex-wrap items-center gap-1.5"
        >
          {SHOWCASE_SCENE_LIST.map((demo) => {
            const active = isShowcaseSceneMode && showcaseState.sceneId === demo.sceneId;
            return (
              <button
                key={demo.sceneId}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`showcase-tab-${demo.sceneId}`}
                onClick={() => onSelectShowcaseScene(demo.sceneId)}
                className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                  active
                    ? 'bg-cyan-500/18 border-cyan-400/60 text-cyan-200'
                    : 'bg-[#0C1220] border-slate-800 text-slate-400 hover:text-slate-100 hover:border-slate-700'
                }`}
              >
                {demo.shortLabel}
              </button>
            );
          })}
        </div>
      )}

      {/* Multi-Level Exploration & Breadcrumbs Bar (hidden in Focus Mode) */}
      {!unsupportedNotice && !isFocusMode && (
        <div className="shrink-0 px-3.5 py-1.5 border-b border-slate-800/80 bg-[#0A0F1A] flex flex-wrap items-center justify-between gap-2">
          {/* Breadcrumbs */}
          <nav
            aria-label="Object exploration breadcrumbs"
            data-testid="exploration-breadcrumbs"
            className="flex flex-wrap items-center gap-1 text-xs min-w-0"
          >
            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <span key={crumb.id} className="inline-flex items-center gap-1 min-w-0">
                  {idx > 0 && (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" aria-hidden="true" />
                  )}
                  {crumb.onClick && !isLast ? (
                    <button
                      type="button"
                      onClick={crumb.onClick}
                      className="text-cyan-400 hover:text-cyan-200 hover:underline font-medium truncate max-w-[180px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded-sm"
                    >
                      {crumb.label}
                    </button>
                  ) : (
                    <span
                      className={`truncate max-w-[240px] ${
                        isLast ? 'text-slate-100 font-semibold' : 'text-slate-400'
                      }`}
                    >
                      {crumb.label}
                    </span>
                  )}
                </span>
              );
            })}
          </nav>

          {/* 3-Level Mode Switcher for GLB Assets & Active Hierarchy */}
          {(isGlbAssetActive || activeSubsystemNotice) && (
            <div
              role="group"
              aria-label="Exploration depth level"
              data-testid="exploration-level-switcher"
              className="inline-flex items-center gap-1 p-0.5 bg-[#080B12] border border-slate-800 rounded-md shrink-0"
            >
              {EXPLORATION_LEVELS.map((lvl) => {
                const active = explorationLevel === lvl.id;
                return (
                  <button
                    key={lvl.id}
                    type="button"
                    data-testid={`level-btn-${lvl.id}`}
                    onClick={() => onChangeExplorationLevel(lvl.id)}
                    aria-pressed={active}
                    className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                      active
                        ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40'
                        : 'text-slate-400 hover:text-slate-100 border border-transparent'
                    }`}
                  >
                    {lvl.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Stage Controls Toolbar */}
      <div className="shrink-0 px-3.5 py-2 border-b border-slate-800/80 bg-[#0C101B] flex flex-wrap items-center justify-between gap-2">
        {isInlineSixActive || isSixStrokeActive ? (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <div
                role="group"
                aria-label="Engine cutaway mode"
                className="inline-flex items-center gap-1 p-0.5 bg-[#080B12] border border-slate-800 rounded-md"
              >
                {INLINE_SIX_VIEW_MODES.map((m) => {
                  const active = showcaseState.viewMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => sceneController.setViewMode(m.id)}
                      aria-pressed={active}
                      className={`px-2 py-0.5 text-xs font-medium rounded transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                        active
                          ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40'
                          : 'text-slate-400 hover:text-slate-100 border border-transparent'
                      }`}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>

              {isSixStrokeActive && (
                <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-300">
                  <span className="text-slate-400 hidden sm:inline">Variant</span>
                  <select
                    aria-label="Six-stroke engine reference variant"
                    data-testid="six-stroke-variant-select"
                    value={sixStrokeVariant}
                    onChange={(e) =>
                      sceneController.setSixStrokeVariant(
                        e.target.value as SixStrokeVariantId,
                      )
                    }
                    className="bg-[#0B101B] border border-slate-700/80 rounded px-2 py-1 text-xs text-cyan-200 max-w-[205px] focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  >
                    {Object.values(SIX_STROKE_VARIANTS).map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.shortLabel}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <button
                type="button"
                onClick={onToggleExploded}
                aria-pressed={isExploded}
                data-testid="toggle-exploded-view"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                  isExploded
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-200'
                    : 'bg-slate-900 border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                Explode
              </button>

              <button
                type="button"
                onClick={onToggleIsolateSelected}
                aria-pressed={isolateSelected}
                data-testid="toggle-isolate-component"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                  isolateSelected
                    ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-200'
                    : 'bg-slate-900 border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                Isolate
              </button>

              <button
                type="button"
                onClick={onToggleShowLabels}
                aria-pressed={showLabels}
                data-testid="toggle-3d-labels"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                  showLabels
                    ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-200'
                    : 'bg-slate-900 border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Tag className="w-3.5 h-3.5" aria-hidden="true" />
                Labels
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <div
                role="group"
                aria-label="Animation speed"
                className="inline-flex items-center p-0.5 bg-[#080B12] border border-slate-800 rounded"
              >
                {SIM_SPEEDS.map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => onChangeSimSpeed(spd)}
                    aria-pressed={simSpeed === spd}
                    className={`px-1.5 py-0.5 text-[11px] font-mono rounded transition-colors ${
                      simSpeed === spd
                        ? 'bg-cyan-500/15 text-cyan-300'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {spd}×
                  </button>
                ))}
              </div>

              <button
                type="button"
                data-testid="toggle-play-btn"
                onClick={onTogglePlay}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-200 bg-slate-900 border border-slate-700/80 rounded hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
                    Run Cycle
                  </>
                )}
              </button>

              <button
                type="button"
                data-testid="overview-btn"
                onClick={onFocusOverview}
                className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-900/80 border border-slate-800 rounded hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                Full Object
              </button>

              {showcaseState.activeComponentId && (
                <button
                  type="button"
                  data-testid="focus-component-btn"
                  onClick={() =>
                    sceneController.focusComponent(showcaseState.activeComponentId!)
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-cyan-200 bg-cyan-500/15 border border-cyan-500/45 rounded hover:bg-cyan-500/25 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                >
                  <Crosshair className="w-3.5 h-3.5" aria-hidden="true" />
                  Focus Part
                </button>
              )}

              <button
                type="button"
                data-testid="reset-view-btn"
                onClick={onResetStage}
                aria-label="Reset 3D view"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-900/60 border border-slate-800 rounded hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                Reset View
              </button>
            </div>
          </>
        ) : isRoboticArmActive ? (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <div
                role="group"
                aria-label="Robotic arm operation sequence"
                className="inline-flex items-center gap-1 p-0.5 bg-[#080B12] border border-slate-800 rounded-md"
              >
                <button
                  type="button"
                  data-testid="robot-seq-a-btn"
                  onClick={() => sceneController.playSequence('sequence-a-pick-place')}
                  aria-pressed={robotSeqId === 'sequence-a-pick-place'}
                  className={`px-2 py-0.5 text-xs font-medium rounded transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                    robotSeqId === 'sequence-a-pick-place'
                      ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40'
                      : 'text-slate-400 hover:text-slate-100 border border-transparent'
                  }`}
                >
                  Seq A · Pick &amp; Place
                </button>
                <button
                  type="button"
                  data-testid="robot-seq-b-btn"
                  onClick={() => sceneController.playSequence('sequence-b-cut')}
                  aria-pressed={robotSeqId === 'sequence-b-cut'}
                  className={`px-2 py-0.5 text-xs font-medium rounded transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                    robotSeqId === 'sequence-b-cut'
                      ? 'bg-amber-500/18 text-amber-200 border border-amber-500/45'
                      : 'text-slate-400 hover:text-slate-100 border border-transparent'
                  }`}
                >
                  Seq B · Conceptual Cut
                </button>
              </div>

              {robotSeqId === 'sequence-a-pick-place' && (
                <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-300">
                  <span className="text-slate-400">Turn</span>
                  <select
                    aria-label="Base turn angle"
                    data-testid="robot-turn-select"
                    value={showcaseState.baseTurnDeg}
                    onChange={(e) => sceneController.setBaseTurnDeg(Number(e.target.value))}
                    className="bg-[#0B101B] border border-slate-700/80 rounded px-1.5 py-0.5 text-xs font-mono text-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  >
                    {ROBOT_TURN_ANGLES.map((deg) => (
                      <option key={deg} value={deg}>
                        {deg}°
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <button
                type="button"
                onClick={onToggleIsolateSelected}
                aria-pressed={isolateSelected}
                data-testid="toggle-isolate-component"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                  isolateSelected
                    ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-200'
                    : 'bg-slate-900 border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                Isolate
              </button>

              <button
                type="button"
                onClick={onToggleShowLabels}
                aria-pressed={showLabels}
                data-testid="toggle-3d-labels"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                  showLabels
                    ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-200'
                    : 'bg-slate-900 border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Tag className="w-3.5 h-3.5" aria-hidden="true" />
                Labels
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <div
                role="group"
                aria-label="Animation speed"
                className="inline-flex items-center p-0.5 bg-[#080B12] border border-slate-800 rounded"
              >
                {SIM_SPEEDS.map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => onChangeSimSpeed(spd)}
                    aria-pressed={simSpeed === spd}
                    className={`px-1.5 py-0.5 text-[11px] font-mono rounded transition-colors ${
                      simSpeed === spd
                        ? 'bg-cyan-500/15 text-cyan-300'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {spd}×
                  </button>
                ))}
              </div>

              <button
                type="button"
                data-testid="toggle-play-btn"
                onClick={onTogglePlay}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-200 bg-slate-900 border border-slate-700/80 rounded hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
                    Run
                  </>
                )}
              </button>

              <button
                type="button"
                data-testid="overview-btn"
                onClick={onFocusOverview}
                className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-900/80 border border-slate-800 rounded hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                Full Object
              </button>

              {showcaseState.activeComponentId && (
                <button
                  type="button"
                  data-testid="focus-component-btn"
                  onClick={() =>
                    sceneController.focusComponent(showcaseState.activeComponentId!)
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-cyan-200 bg-cyan-500/15 border border-cyan-500/45 rounded hover:bg-cyan-500/25 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                >
                  <Crosshair className="w-3.5 h-3.5" aria-hidden="true" />
                  Focus Part
                </button>
              )}

              <button
                type="button"
                data-testid="reset-view-btn"
                onClick={onResetStage}
                aria-label="Reset 3D view"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-900/60 border border-slate-800 rounded hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                Reset View
              </button>
            </div>
          </>
        ) : isGlbAssetActive ? (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={onToggleExploded}
                aria-pressed={isExploded}
                data-testid="toggle-exploded-view"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                  isExploded
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-200'
                    : 'bg-slate-900 border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                Explode
              </button>

              <button
                type="button"
                onClick={onToggleIsolateSelected}
                aria-pressed={isolateSelected}
                data-testid="toggle-isolate-component"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                  isolateSelected
                    ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-200'
                    : 'bg-slate-900 border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                Isolate Mesh
              </button>

              <button
                type="button"
                onClick={onToggleShowLabels}
                aria-pressed={showLabels}
                data-testid="toggle-3d-labels"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                  showLabels
                    ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-200'
                    : 'bg-slate-900 border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Tag className="w-3.5 h-3.5" aria-hidden="true" />
                Labels
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <div
                role="group"
                aria-label="Animation speed"
                className="inline-flex items-center p-0.5 bg-[#080B12] border border-slate-800 rounded"
              >
                {SIM_SPEEDS.map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => onChangeSimSpeed(spd)}
                    aria-pressed={simSpeed === spd}
                    className={`px-1.5 py-0.5 text-[11px] font-mono rounded transition-colors ${
                      simSpeed === spd
                        ? 'bg-cyan-500/15 text-cyan-300'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {spd}×
                  </button>
                ))}
              </div>

              <button
                type="button"
                data-testid="toggle-play-btn"
                onClick={onTogglePlay}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-200 bg-slate-900 border border-slate-700/80 rounded hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
                    Animate
                  </>
                )}
              </button>

              <button
                type="button"
                data-testid="overview-btn"
                onClick={onFocusOverview}
                className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-900/80 border border-slate-800 rounded hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                Full Object
              </button>

              {selectedGlbPart && (
                <button
                  type="button"
                  data-testid="focus-component-btn"
                  onClick={() => onSelectAssetPart(selectedGlbPart.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-cyan-200 bg-cyan-500/15 border border-cyan-500/45 rounded hover:bg-cyan-500/25 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                >
                  <Crosshair className="w-3.5 h-3.5" aria-hidden="true" />
                  Focus Part
                </button>
              )}

              <button
                type="button"
                data-testid="reset-view-btn"
                onClick={onResetStage}
                aria-label="Reset 3D view"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-900/60 border border-slate-800 rounded hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                Reset View
              </button>
            </div>
          </>
        ) : isGeneratedActive ? (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={onToggleExploded}
                aria-pressed={isExploded}
                data-testid="toggle-exploded-view"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                  isExploded
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-200'
                    : 'bg-slate-900 border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                Explode
              </button>

              <button
                type="button"
                onClick={onToggleIsolateSelected}
                aria-pressed={isolateSelected}
                data-testid="toggle-isolate-component"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                  isolateSelected
                    ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-200'
                    : 'bg-slate-900 border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                Isolate
              </button>

              <button
                type="button"
                onClick={onToggleShowConnections}
                aria-pressed={showConnections}
                data-testid="toggle-connections"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                  showConnections
                    ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-200'
                    : 'bg-slate-900 border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <GitBranch className="w-3.5 h-3.5" aria-hidden="true" />
                Links
              </button>

              <button
                type="button"
                onClick={onToggleShowLabels}
                aria-pressed={showLabels}
                data-testid="toggle-3d-labels"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                  showLabels
                    ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-200'
                    : 'bg-slate-900 border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Tag className="w-3.5 h-3.5" aria-hidden="true" />
                Labels
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <div
                role="group"
                aria-label="Animation speed"
                className="inline-flex items-center p-0.5 bg-[#080B12] border border-slate-800 rounded"
              >
                {SIM_SPEEDS.map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => onChangeSimSpeed(spd)}
                    aria-pressed={simSpeed === spd}
                    className={`px-1.5 py-0.5 text-[11px] font-mono rounded transition-colors ${
                      simSpeed === spd
                        ? 'bg-cyan-500/15 text-cyan-300'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {spd}×
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={onTogglePlay}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-200 bg-slate-900 border border-slate-700/80 rounded hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
                    Animate
                  </>
                )}
              </button>

              <button
                type="button"
                data-testid="overview-btn"
                onClick={onFocusOverview}
                className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-900/80 border border-slate-800 rounded hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                Full Object
              </button>

              {selectedGenComp && (
                <button
                  type="button"
                  data-testid="focus-component-btn"
                  onClick={() => onSelectGeneratedComponent(selectedGenComp.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-cyan-200 bg-cyan-500/15 border border-cyan-500/45 rounded hover:bg-cyan-500/25 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                >
                  <Crosshair className="w-3.5 h-3.5" aria-hidden="true" />
                  Focus Part
                </button>
              )}

              <button
                type="button"
                data-testid="reset-view-btn"
                onClick={onResetStage}
                aria-label="Reset 3D view"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-900/60 border border-slate-800 rounded hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                Reset View
              </button>

              <button
                type="button"
                data-testid="return-turbofan-btn"
                onClick={onReturnToTurbofan}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-900/60 border border-slate-800 rounded hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                Turbofan
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div
                role="group"
                aria-label="Visualization layer mode"
                className="inline-flex items-center gap-1 p-0.5 bg-[#080B12] border border-slate-800 rounded-md"
              >
                {LAYER_MODES.map((mode) => {
                  const active = mode.id === layerMode;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => onChangeLayerMode(mode.id)}
                      aria-pressed={active}
                      className={`px-2.5 py-1 text-xs font-medium rounded transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                        active
                          ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40'
                          : 'text-slate-400 hover:text-slate-100 border border-transparent'
                      }`}
                    >
                      {mode.label}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={onToggleExploded}
                aria-pressed={isExploded}
                data-testid="toggle-exploded-view"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                  isExploded
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-200'
                    : 'bg-slate-900 border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                Explode
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={onTogglePlay}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-200 bg-slate-900 border border-slate-700/80 rounded hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
                    Simulate
                  </>
                )}
              </button>

              <button
                type="button"
                data-testid="overview-btn"
                onClick={onFocusOverview}
                className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-900/80 border border-slate-800 rounded hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                Full Object
              </button>

              <button
                type="button"
                data-testid="focus-component-btn"
                onClick={() => onSelectStage(selectedStageId)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-cyan-200 bg-cyan-500/15 border border-cyan-500/45 rounded hover:bg-cyan-500/25 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                <Crosshair className="w-3.5 h-3.5" aria-hidden="true" />
                Focus Part
              </button>

              <button
                type="button"
                data-testid="reset-view-btn"
                onClick={onResetStage}
                aria-label="Reset 3D stage"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-900/60 border border-slate-800 rounded hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                Reset View
              </button>
            </div>
          </>
        )}
      </div>

      {/* Main 3D Stage Viewport Area */}
      <div
        data-testid="visualization-stage"
        data-viz-mode={
          unsupportedNotice
            ? 'fallback'
            : isInlineSixActive
              ? 'inline-six-3d'
              : isSixStrokeActive
                ? 'six-stroke-3d'
                : isRoboticArmActive
                  ? 'robotic-arm-3d'
                  : isGlbAssetActive
                    ? 'glb-asset-3d'
                    : isGeneratedActive
                      ? 'generated-3d'
                      : 'turbofan-3d'
        }
        data-showcase-scene={isShowcaseSceneMode ? showcaseState.sceneId : 'custom'}
        data-asset-id={activeAsset?.id ?? 'none'}
        data-exploration-level={explorationLevel}
        data-layer={layerMode}
        data-exploded={isExploded ? 'true' : 'false'}
        data-stage={
          unsupportedNotice
            ? 'none'
            : isInlineSixActive || isSixStrokeActive || isRoboticArmActive
              ? showcaseState.activeComponentId ?? 'overview'
              : isGlbAssetActive
                ? selectedGlbPart?.id ?? 'overview'
                : isGeneratedActive
                  ? selectedGenComp?.id ?? 'generated'
                  : selectedStageId
        }
        className="flex-1 min-h-0 flex flex-col justify-between bg-[#070A11] relative overflow-y-auto studio-scroll p-3 lg:p-3.5 gap-2.5 lg:gap-3"
      >
        {sceneNoticeBanner && (
          <div
            role="status"
            data-testid="scene-action-notice-banner"
            className="shrink-0 px-3 py-1.5 rounded bg-amber-950/35 border border-amber-500/40 text-xs text-amber-200 flex items-center justify-between gap-2"
          >
            <span>{sceneNoticeBanner}</span>
            <button
              type="button"
              onClick={onDismissSceneNotice}
              className="text-[11px] font-mono text-amber-300 hover:text-white underline shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}
        {unsupportedNotice ? (
          unsupportedNotice.diagramData ? (
            <ConceptDiagram2D
              conceptTitle={unsupportedNotice.concept}
              recommendation={
                unsupportedNotice.infeasibilityReason ?? unsupportedNotice.recommendation
              }
              diagram={unsupportedNotice.diagramData}
              onReturnToTurbofan={onDismissUnsupportedNotice}
            />
          ) : (
            <div
              role="status"
              data-testid="unsupported-visualization-notice"
              className="flex-1 flex flex-col items-center justify-center text-center bg-[#0A0F1A] border border-amber-500/40 rounded-md p-6 gap-4"
            >
              <div className="max-w-md space-y-2.5">
                <p className="text-xs font-mono text-amber-300">
                  3D Concept Representation Unavailable
                </p>
                <h3 className="font-display text-base font-semibold text-slate-100">
                  “{unsupportedNotice.concept}” cannot be reliably modeled in 3D
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {unsupportedNotice.infeasibilityReason ?? unsupportedNotice.recommendation}
                </p>
              </div>
              <button
                type="button"
                onClick={onDismissUnsupportedNotice}
                className="px-3.5 py-2 text-xs font-medium text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                Return to Jet Propulsion Model
              </button>
            </div>
          )
        ) : isInlineSixActive && inlineSixSnapshot ? (
          <>
            {/* Inline-Six Kinematics & Timing Status Strip */}
            <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
              <span data-testid="inline-six-title" className="text-cyan-300 font-semibold truncate">
                {showcaseDesc.title} · Firing Order {inlineSixSnapshot.firingOrderLabel}
              </span>
              <span className="text-slate-400 whitespace-nowrap">
                Crank {Math.round(inlineSixSnapshot.crankAngleDeg)}° · Cam{' '}
                {Math.round(inlineSixSnapshot.camAngleDeg)}° (0.5×)
              </span>
            </div>

            <div className="flex-1 min-h-[260px] lg:min-h-[320px] border border-slate-800/80 rounded-md bg-[#070A11] relative overflow-hidden">
              <InlineSixSceneCanvas
                crankAngleDeg={showcaseState.crankAngleDeg}
                isPlaying={isPlaying}
                speedMultiplier={simSpeed}
                viewMode={showcaseState.viewMode}
                isExploded={isExploded}
                isFocusMode={isFocusMode}
                selectedComponentId={showcaseState.activeComponentId}
                cameraTarget={showcaseState.cameraTarget}
                focusTrigger={showcaseState.focusNonce}
                isolateSelected={isolateSelected}
                showLabels={showLabels}
                onCrankAngleTick={(deg) => sceneController.setCrankAngle(deg)}
                onSelectComponent={(compId) => sceneController.focusComponent(compId)}
              />

              <div className="pointer-events-none absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
                <span className="px-2 py-0.5 rounded bg-[#0B101B]/90 border border-slate-800/90 truncate">
                  {activeInlineSixCyl
                    ? `Cyl ${activeInlineSixCyl.cylinderNumber}: ${activeInlineSixCyl.strokePhase.toUpperCase()} (${Math.round(activeInlineSixCyl.localCycleDeg)}° local)`
                    : 'Drag to orbit · Click any cylinder, crankshaft, or camshaft'}
                </span>
                <span className="px-2 py-0.5 rounded bg-[#0B101B]/90 border border-slate-800/90 whitespace-nowrap shrink-0 hidden sm:inline">
                  720° 4-Stroke Cycle
                </span>
              </div>
            </div>

            <VoiceCaptionStrip caption={voiceCaption ?? null} />

            {/* 720° Crank Angle Scrubber */}
            <div className="shrink-0 bg-[#0B101A] border border-slate-800/90 rounded-md px-3 py-2 flex flex-wrap items-center gap-3">
              <label
                htmlFor="inline-six-crank-slider"
                className="text-xs font-medium text-slate-300 whitespace-nowrap"
              >
                Crank Angle
              </label>
              <input
                id="inline-six-crank-slider"
                data-testid="inline-six-crank-slider"
                type="range"
                min={0}
                max={719}
                value={Math.round(showcaseState.crankAngleDeg)}
                onChange={(e) => {
                  sceneController.setCrankAngle(Number(e.target.value));
                }}
                className="flex-1 min-w-[140px] accent-cyan-400 cursor-pointer"
              />
              <span className="text-xs font-mono tabular-nums text-cyan-300 w-24 text-right">
                {Math.round(showcaseState.crankAngleDeg)}° / 720°
              </span>
            </div>

            {/* Cylinder 1-6 + Subsystem Quick Selector */}
            <div
              role="group"
              aria-label="Inline-six component selector"
              data-testid="inline-six-component-list"
              className="shrink-0 flex flex-wrap gap-1.5"
            >
              <button
                type="button"
                data-testid="inline-six-full-engine-btn"
                onClick={() => sceneController.focusComponent('overview')}
                aria-pressed={showcaseState.cameraTarget === 'overview'}
                className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                  showcaseState.cameraTarget === 'overview'
                    ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-200'
                    : 'bg-[#0C1220] border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
                }`}
              >
                Full Engine
              </button>
              {showcaseDesc.hierarchy
                .filter((c) => c.id !== 'cylinder-block')
                .map((comp) => {
                  const active = showcaseState.activeComponentId === comp.id;
                  const shortName = comp.id.startsWith('cylinder-')
                    ? `Cyl ${comp.id.replace('cylinder-', '')}`
                    : comp.id === 'intake-manifold'
                      ? 'Intake'
                      : comp.id === 'exhaust-manifold'
                        ? 'Exhaust'
                        : comp.name.split(' ')[0] === 'Six-Throw'
                          ? 'Crankshaft'
                          : comp.id === 'camshaft'
                            ? 'Camshaft'
                            : comp.name;
                  return (
                    <button
                      key={comp.id}
                      type="button"
                      data-testid={`inline-six-btn-${comp.id}`}
                      onClick={() => sceneController.focusComponent(comp.id)}
                      aria-pressed={active}
                      className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                        active
                          ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-200'
                          : 'bg-[#0C1220] border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
                      }`}
                    >
                      {shortName}
                    </button>
                  );
                })}
            </div>

            {/* Inline-Six Component Inspector (hidden in Focus Mode) */}
            {!isFocusMode && (
              <div
                data-testid="inline-six-inspector"
                className="shrink-0 bg-[#0C111D] border border-slate-800 rounded-md p-3 space-y-1.5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-display text-sm font-semibold text-slate-100">
                    {activeInlineSixComp?.name ?? showcaseDesc.title}
                  </h3>
                  <span className="text-[11px] font-mono text-cyan-400">
                    {activeInlineSixCyl
                      ? `Phase: ${activeInlineSixCyl.strokePhase.toUpperCase()} · Fires at ${activeInlineSixCyl.firingOffsetDeg}°`
                      : 'Firing Sequence: 1-5-3-6-2-4 (configured)'}
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {activeInlineSixComp?.role ?? showcaseDesc.description}
                </p>
                <p className="text-[11px] font-mono text-slate-500">
                  {showcaseDesc.simulationTruthLabel}
                </p>
              </div>
            )}
          </>
        ) : isSixStrokeActive && sixStrokeSnapshot ? (
          <>
            {/* Single-Cylinder Six-Stroke Reference Kinematics & Truthfulness Header */}
            <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
              <span data-testid="six-stroke-title" className="text-cyan-300 font-semibold truncate">
                {sixStrokeVariantMeta.shortLabel} · Stroke {sixStrokeSnapshot.strokeNumber}/
                {sixStrokeSnapshot.totalStrokes}
              </span>
              <span className="text-slate-400 whitespace-nowrap">
                Crank {Math.round(sixStrokeSnapshot.cycleAngleDeg)}° /{' '}
                {sixStrokeSnapshot.cycleDegrees}°
              </span>
            </div>

            {!isFocusMode && (
              <div
                data-testid="six-stroke-truthfulness-note"
                className="shrink-0 px-3 py-1.5 rounded bg-amber-950/30 border border-amber-500/35 text-[11px] text-amber-200"
              >
                {sixStrokeVariantMeta.truthfulnessNote}
              </div>
            )}

            <div className="flex-1 min-h-[260px] lg:min-h-[340px] border border-slate-800/80 rounded-md bg-[#070A11] relative overflow-hidden">
              <SixStrokeSceneCanvas
                variant={sixStrokeVariant}
                crankAngleDeg={showcaseState.crankAngleDeg}
                isPlaying={isPlaying}
                speedMultiplier={simSpeed}
                viewMode={showcaseState.viewMode}
                isExploded={isExploded}
                isFocusMode={isFocusMode}
                selectedComponentId={showcaseState.activeComponentId}
                cameraTarget={showcaseState.cameraTarget}
                focusTrigger={showcaseState.focusNonce}
                isolateSelected={isolateSelected}
                showLabels={showLabels}
                onCrankAngleTick={(deg) => sceneController.setCrankAngle(deg)}
                onSelectComponent={(compId) => sceneController.focusComponent(compId)}
              />

              <div className="pointer-events-none absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
                <span className="px-2 py-0.5 rounded bg-[#0B101B]/90 border border-slate-800/90 truncate">
                  {sixStrokeSnapshot.strokeLabel}
                </span>
                <span className="px-2 py-0.5 rounded bg-[#0B101B]/90 border border-slate-800/90 whitespace-nowrap shrink-0 hidden sm:inline">
                  {sixStrokeSnapshot.cycleDegrees}° Slider-Crank Cycle
                </span>
              </div>
            </div>

            <VoiceCaptionStrip caption={voiceCaption ?? null} />

            {/* Cycle Angle Scrubber (720° or 1080°) */}
            <div className="shrink-0 bg-[#0B101A] border border-slate-800/90 rounded-md px-3 py-2 flex flex-wrap items-center gap-3">
              <label
                htmlFor="six-stroke-crank-slider"
                className="text-xs font-medium text-slate-300 whitespace-nowrap"
              >
                Cycle Angle
              </label>
              <input
                id="six-stroke-crank-slider"
                data-testid="six-stroke-crank-slider"
                type="range"
                min={0}
                max={sixStrokeSnapshot.cycleDegrees - 1}
                value={Math.round(sixStrokeSnapshot.cycleAngleDeg)}
                onChange={(e) => {
                  sceneController.setCrankAngle(Number(e.target.value));
                }}
                className="flex-1 min-w-[140px] accent-cyan-400 cursor-pointer"
              />
              <span className="text-xs font-mono tabular-nums text-cyan-300 w-24 text-right">
                {Math.round(sixStrokeSnapshot.cycleAngleDeg)}° / {sixStrokeSnapshot.cycleDegrees}°
              </span>
            </div>

            {/* Component Selector */}
            <div
              role="group"
              aria-label="Single-cylinder cutaway component selector"
              data-testid="six-stroke-component-list"
              className="shrink-0 flex flex-wrap gap-1.5"
            >
              <button
                type="button"
                data-testid="six-stroke-full-engine-btn"
                onClick={() => sceneController.focusComponent('overview')}
                aria-pressed={showcaseState.cameraTarget === 'overview'}
                className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                  showcaseState.cameraTarget === 'overview'
                    ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-200'
                    : 'bg-[#0C1220] border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
                }`}
              >
                Full Engine
              </button>
              {showcaseDesc.hierarchy
                .filter(
                  (c) =>
                    c.id !== 'water-injector' || sixStrokeVariant === 'crower-water-steam',
                )
                .map((comp) => {
                  const active = showcaseState.activeComponentId === comp.id;
                  const shortLabel =
                    comp.id === 'cylinder-block'
                      ? 'Cylinder Block'
                      : comp.id === 'cylinder-head'
                        ? 'Head & Spark'
                        : comp.id === 'piston'
                          ? 'Piston'
                          : comp.id === 'connecting-rod'
                            ? 'Connecting Rod'
                            : comp.id === 'crankshaft'
                              ? 'Crank & Flywheel'
                              : comp.id === 'valves-camtrain'
                                ? 'Valves & Cams'
                                : comp.id === 'intake-exhaust'
                                  ? 'Ports'
                                  : 'Water Injector';
                  return (
                    <button
                      key={comp.id}
                      type="button"
                      data-testid={`six-stroke-btn-${comp.id}`}
                      onClick={() => sceneController.focusComponent(comp.id)}
                      aria-pressed={active}
                      className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                        active
                          ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-200'
                          : 'bg-[#0C1220] border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
                      }`}
                    >
                      {shortLabel}
                    </button>
                  );
                })}
            </div>

            {!isFocusMode && (
              <div
                data-testid="six-stroke-inspector"
                className="shrink-0 bg-[#0C111D] border border-slate-800 rounded-md p-3 space-y-1.5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-display text-sm font-semibold text-slate-100">
                    {activeSixStrokeComp?.name ?? sixStrokeVariantMeta.label}
                  </h3>
                  <span className="text-[11px] font-mono text-cyan-400">
                    {sixStrokeSnapshot.strokeLabel}
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {activeSixStrokeComp?.role ?? showcaseDesc.description}
                </p>
                <p className="text-[11px] font-mono text-slate-500">
                  {showcaseDesc.simulationTruthLabel}
                </p>
              </div>
            )}
          </>
        ) : isRoboticArmActive && robotPose ? (
          <>
            {/* Robotic Arm Status Strip */}
            <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
              <span data-testid="robotic-arm-title" className="text-cyan-300 font-semibold truncate">
                {activeRobotSeqDesc?.label ?? 'Robotic Arm & Apple'}
              </span>
              <span className="text-slate-400 whitespace-nowrap">
                Tool: {robotPose.activeTool === 'cutter' ? 'Cutter Blade' : 'Parallel Gripper'} ·{' '}
                {robotPose.isAppleGrasped ? 'Apple Grasped' : 'Gripper Open'}
              </span>
            </div>

            {activeRobotSeqDesc?.isConceptualNotice && (
              <div
                data-testid="robot-conceptual-notice"
                className="shrink-0 px-3 py-1.5 rounded bg-amber-950/35 border border-amber-500/40 text-xs text-amber-200"
              >
                {activeRobotSeqDesc.isConceptualNotice}
              </div>
            )}

            <div className="flex-1 min-h-[260px] lg:min-h-[320px] border border-slate-800/80 rounded-md bg-[#070A11] relative overflow-hidden">
              <RoboticArmSceneCanvas
                sequenceId={robotSeqId}
                progress={showcaseState.sequenceProgress}
                isPlaying={isPlaying}
                speedMultiplier={simSpeed}
                baseTurnDeg={showcaseState.baseTurnDeg}
                isFocusMode={isFocusMode}
                selectedComponentId={showcaseState.activeComponentId}
                cameraTarget={showcaseState.cameraTarget}
                focusTrigger={showcaseState.focusNonce}
                isolateSelected={isolateSelected}
                showLabels={showLabels}
                onProgressTick={(nextP) => sceneController.seekSequence(nextP)}
                onSelectComponent={(compId) => sceneController.focusComponent(compId)}
              />

              <div className="pointer-events-none absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
                <span className="px-2 py-0.5 rounded bg-[#0B101B]/90 border border-slate-800/90 truncate">
                  {robotPose.phaseLabel}
                </span>
                <span className="px-2 py-0.5 rounded bg-[#0B101B]/90 border border-slate-800/90 whitespace-nowrap shrink-0 hidden sm:inline">
                  Base Yaw: {Math.round((-robotPose.joints.baseYawRad * 180) / Math.PI)}°
                </span>
              </div>
            </div>

            <VoiceCaptionStrip caption={voiceCaption ?? null} />

            {/* Sequence Progress Scrubber */}
            <div className="shrink-0 bg-[#0B101A] border border-slate-800/90 rounded-md px-3 py-2 flex flex-wrap items-center gap-3">
              <label
                htmlFor="robot-progress-slider"
                className="text-xs font-medium text-slate-300 whitespace-nowrap"
              >
                Sequence Step
              </label>
              <input
                id="robot-progress-slider"
                data-testid="robot-progress-slider"
                type="range"
                min={0}
                max={100}
                value={Math.round(showcaseState.sequenceProgress * 100)}
                onChange={(e) => {
                  sceneController.seekSequence(Number(e.target.value) / 100);
                }}
                className="flex-1 min-w-[140px] accent-cyan-400 cursor-pointer"
              />
              <span className="text-xs font-mono tabular-nums text-cyan-300 w-12 text-right">
                {Math.round(showcaseState.sequenceProgress * 100)}%
              </span>
            </div>

            {/* Robotic Arm Component Selector */}
            <div
              role="group"
              aria-label="Robotic arm component selector"
              data-testid="robotic-arm-component-list"
              className="shrink-0 flex flex-wrap gap-1.5"
            >
              {showcaseDesc.hierarchy.map((comp) => {
                const active = showcaseState.activeComponentId === comp.id;
                const label =
                  comp.id === 'upper-arm'
                    ? 'Upper Arm'
                    : comp.id === 'gripper'
                      ? 'Gripper'
                      : comp.id === 'cutter'
                        ? 'Cutter'
                        : comp.name.split(' ')[0];
                return (
                  <button
                    key={comp.id}
                    type="button"
                    data-testid={`robot-comp-btn-${comp.id}`}
                    onClick={() => sceneController.focusComponent(comp.id)}
                    aria-pressed={active}
                    className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                      active
                        ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-200'
                        : 'bg-[#0C1220] border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {!isFocusMode && (
              <div
                data-testid="robotic-arm-inspector"
                className="shrink-0 bg-[#0C111D] border border-slate-800 rounded-md p-3 space-y-1.5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-display text-sm font-semibold text-slate-100">
                    {activeRobotComp?.name ?? showcaseDesc.title}
                  </h3>
                  <span className="text-[11px] font-mono text-cyan-400">
                    {robotPose.phaseLabel}
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {activeRobotComp?.role ?? showcaseDesc.description}
                </p>
                <p className="text-[11px] font-mono text-slate-500">
                  {showcaseDesc.simulationTruthLabel}
                </p>
              </div>
            )}
          </>
        ) : isGlbAssetActive && activeAsset ? (
          <>
            {/* Provenance & Asset Status Strip */}
            <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
              <span
                data-testid="glb-asset-title"
                className="inline-flex items-center gap-1.5 text-emerald-300 font-semibold truncate"
              >
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                Verified 3D Asset: {activeAsset.name}
              </span>
              <span className="text-slate-400 whitespace-nowrap">
                {activeAsset.license} · {activeAsset.source}
                {assetMeshStats ? ` · ${assetMeshStats.triangleCount.toLocaleString()} tris` : ''}
              </span>
            </div>

            {/* Interactive Three.js PBR GLB Viewport */}
            <div className="flex-1 min-h-[260px] lg:min-h-[320px] border border-slate-800/80 rounded-md bg-[#070A11] relative overflow-hidden">
              <AssetSceneCanvas
                assetEntry={activeAsset}
                modelUrl={activeAsset.modelUrl}
                explorationLevel={explorationLevel}
                selectedPartId={selectedAssetPartId}
                cameraFocusTarget={assetFocusTarget}
                focusTrigger={assetFocusTrigger}
                isolateSelected={isolateSelected}
                isPlaying={isPlaying}
                isExploded={isExploded}
                isFocusMode={isFocusMode}
                speedMultiplier={simSpeed}
                showLabels={showLabels}
                resolvedParts={resolvedAssetParts}
                modelBounds={assetBounds}
                onLoadProgress={onAssetLoadProgress}
                onLoadComplete={onAssetLoadComplete}
                onLoadError={onAssetLoadError}
                onSelectPart={onSelectAssetPart}
              />

              {/* Progress Indicator (no backdrop-filter) */}
              {assetLoadProgress < 100 && !assetLoadError && (
                <div
                  data-testid="asset-loading-indicator"
                  className="absolute inset-0 flex flex-col items-center justify-center bg-[#070A11]/90 text-xs text-slate-200 gap-2 pointer-events-none"
                >
                  <p className="font-mono text-cyan-300">
                    Loading {activeAsset.name} GLB... {assetLoadProgress}%
                  </p>
                  <div className="w-48 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-400 transition-all duration-150"
                      style={{ width: `${assetLoadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {assetLoadError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#070A11]/95 p-4 text-center text-xs text-rose-300 gap-2">
                  <p className="font-semibold">Unable to load 3D asset</p>
                  <p className="text-slate-400 max-w-md">{assetLoadError}</p>
                </div>
              )}

              <div className="pointer-events-none absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
                <span className="px-2 py-0.5 rounded bg-[#0B101B]/90 border border-slate-800/90 truncate">
                  {explorationLevel === 'internal-structure' && activeAsset.illustrativeOverlay
                    ? activeAsset.illustrativeOverlay.title
                    : 'Drag to orbit · Scroll to zoom · Click mesh to inspect'}
                </span>
                <span className="px-2 py-0.5 rounded bg-[#0B101B]/90 border border-slate-800/90 whitespace-nowrap shrink-0 hidden sm:inline">
                  {assetFocusTarget === 'overview'
                    ? 'Camera: Full Object'
                    : `Focus: ${selectedGlbPart?.label ?? assetFocusTarget}`}
                </span>
              </div>
            </div>

            <VoiceCaptionStrip caption={voiceCaption ?? null} />

            {/* Verified Mesh Parts + Illustrative Subsystems */}
            <div
              role="group"
              aria-label="Asset mesh hierarchy and subsystems"
              data-testid="glb-part-list"
              className="shrink-0 flex flex-wrap gap-1.5"
            >
              {resolvedAssetParts.map((part) => {
                const active = selectedGlbPart?.id === part.id;
                return (
                  <button
                    key={part.id}
                    type="button"
                    data-testid={`asset-part-btn-${part.id}`}
                    onClick={() => onSelectAssetPart(part.id)}
                    aria-pressed={active}
                    className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                      active
                        ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-200'
                        : 'bg-[#0C1220] border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
                    }`}
                  >
                    {part.label}
                  </button>
                );
              })}

              {!isFocusMode &&
                activeAsset.illustrativeSubsystems.map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    data-testid={`open-subsystem-btn-${sub.id}`}
                    onClick={() => onOpenIllustrativeSubsystem(sub)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  >
                    <Sparkles className="w-3 h-3" aria-hidden="true" />
                    {sub.label}
                  </button>
                ))}
            </div>

            {/* Asset / Part Inspector Card (hidden in Focus Mode) */}
            {!isFocusMode && (
              <div
                data-testid="glb-asset-inspector"
                className="shrink-0 bg-[#0C111D] border border-slate-800 rounded-md p-3 space-y-1.5"
              >
                {selectedGlbPart ? (
                  <>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3
                        data-testid="active-asset-part-name"
                        className="font-display text-sm font-semibold text-slate-100"
                      >
                        {selectedGlbPart.label}
                      </h3>
                      <span className="text-[11px] font-mono text-cyan-400">
                        {selectedGlbPart.isSubRegionOfMesh
                          ? 'Framed Sub-Region of Verified Mesh'
                          : selectedGlbPart.isVerifiedMesh
                            ? 'Verified GLB Mesh Node'
                            : 'Conceptual Region'}
                        {selectedGlbPart.animation ? ` · Animated (${selectedGlbPart.animation.type})` : ''}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">{selectedGlbPart.role}</p>
                    <p className="text-[11px] text-slate-400">{selectedGlbPart.operatingNote}</p>
                  </>
                ) : (
                  <>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="font-display text-sm font-semibold text-slate-100">
                        {activeAsset.name} — Complete Machine Overview
                      </h3>
                      <span className="text-[11px] font-mono text-emerald-300">
                        Level {explorationLevel === 'internal-structure' ? '2 · Internal Overlay' : '1 · Full Object'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">{activeAsset.description}</p>
                    <p className="text-[11px] text-slate-400">
                      {explorationLevel === 'internal-structure' && activeAsset.illustrativeOverlay
                        ? activeAsset.illustrativeOverlay.honestyNote
                        : activeAsset.verifiedInternalsNote}
                    </p>
                  </>
                )}
                <p className="pt-1 border-t border-slate-800/80 text-[11px] font-mono text-slate-500 truncate">
                  Provenance: {activeAsset.attribution}
                </p>
              </div>
            )}
          </>
        ) : isGeneratedActive && generatedScene ? (
          <>
            {/* Truthfulness & Scale Status Strip */}
            <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
              <span
                data-testid="generated-scene-title"
                className={`font-semibold truncate ${
                  activeSubsystemNotice ? 'text-amber-300' : 'text-cyan-300'
                }`}
              >
                {activeSubsystemNotice ? 'Illustrative Subsystem: ' : 'AI Conceptual 3D: '}
                {generatedScene.systemTitle}
              </span>
              <span className="text-slate-400 whitespace-nowrap">
                {generatedScene.estimatedScaleLabel} · {isExploded ? 'Exploded' : 'Assembled'} ·{' '}
                {isPlaying ? `${simSpeed}× Active` : 'Paused'}
              </span>
            </div>

            {activeSubsystemNotice && (
              <div
                data-testid="illustrative-subsystem-banner"
                className="shrink-0 px-3 py-1.5 rounded bg-amber-950/35 border border-amber-500/40 text-xs text-amber-200 flex items-center justify-between gap-2"
              >
                <span>{activeSubsystemNotice}</span>
              </div>
            )}

            {/* Generalized Three.js / R3F 3D Canvas Viewport */}
            <div className="flex-1 min-h-[260px] lg:min-h-[320px] border border-slate-800/80 rounded-md bg-[#070A11] relative overflow-hidden">
              <DynamicSceneCanvas
                spec={generatedScene}
                selectedComponentId={selectedGenComp?.id ?? null}
                cameraFocusTarget={generatedFocusTarget}
                focusTrigger={generatedFocusTrigger}
                isolateSelected={isolateSelected}
                isPlaying={isPlaying}
                isExploded={isExploded}
                isFocusMode={isFocusMode}
                speedMultiplier={simSpeed}
                showConnections={showConnections}
                showLabels={showLabels}
                onSelectComponent={onSelectGeneratedComponent}
              />

              <div className="pointer-events-none absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
                <span className="px-2 py-0.5 rounded bg-[#0B101B]/90 border border-slate-800/90 truncate">
                  {generatedScene.conceptualNote}
                </span>
                <span className="px-2 py-0.5 rounded bg-[#0B101B]/90 border border-slate-800/90 whitespace-nowrap shrink-0 hidden sm:inline">
                  {generatedFocusTarget === 'overview'
                    ? 'Camera: Overview'
                    : `Focus: ${selectedGenComp?.name ?? 'Component'}`}
                </span>
              </div>
            </div>

            <VoiceCaptionStrip caption={voiceCaption ?? null} />

            {/* Interactive Generated Component Selector Grid */}
            <div
              role="group"
              aria-label="Generated 3D component selector"
              data-testid="generated-component-list"
              className="shrink-0 flex flex-wrap gap-1.5"
            >
              {generatedScene.components.map((comp) => {
                const active = selectedGenComp?.id === comp.id;
                return (
                  <button
                    key={comp.id}
                    type="button"
                    onClick={() => onSelectGeneratedComponent(comp.id)}
                    aria-pressed={active}
                    className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                      active
                        ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-200'
                        : 'bg-[#0C1220] border-slate-800 text-slate-400 hover:text-slate-100 hover:border-slate-700'
                    }`}
                  >
                    {comp.name}
                  </button>
                );
              })}
            </div>

            {!isFocusMode && selectedGenComp && (
              <div
                data-testid="generated-component-inspector"
                className="shrink-0 bg-[#0C111D] border border-slate-800 rounded-md p-3 space-y-2"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h3
                      data-testid="active-generated-component-name"
                      className="font-display text-sm font-semibold text-slate-100"
                    >
                      {selectedGenComp.name}
                    </h3>
                    <p className="text-[11px] font-mono text-cyan-400">
                      {generatedScene.category} ·{' '}
                      {selectedGenComp.dimensionsEstimate ?? generatedScene.estimatedScaleLabel}
                    </p>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">
                    Motion: {selectedGenComp.animation.type}
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  {selectedGenComp.role}
                </p>

                {selectedGenComp.operatingNote && (
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {selectedGenComp.operatingNote}
                  </p>
                )}

                {relatedConnections.length > 0 && (
                  <div className="pt-1.5 border-t border-slate-800/80 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
                    <span className="text-slate-300 font-medium">Links:</span>
                    {relatedConnections.map((conn, idx) => {
                      const otherId =
                        conn.fromId === selectedGenComp.id ? conn.toId : conn.fromId;
                      const otherName =
                        generatedScene.components.find((c) => c.id === otherId)?.name ?? otherId;
                      return (
                        <span key={`${conn.fromId}-${conn.toId}-${idx}`}>
                          {conn.fromId === selectedGenComp.id ? '→' : '←'} {otherName} ({conn.label})
                        </span>
                      );
                    })}
                  </div>
                )}

                {generatedScene.physicalProcesses.length > 0 && (
                  <div className="pt-1.5 border-t border-slate-800/80 text-[11px] text-slate-400">
                    <span className="text-slate-300 font-medium">Processes: </span>
                    {generatedScene.physicalProcesses.join(' · ')}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            {/* Status Telemetry Line (Built-in Turbofan) */}
            <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 font-mono">
              <span className="whitespace-nowrap">
                {geminiFocusedStage
                  ? `Gemini Focus: ${activeStage.name}`
                  : `Focus: ${studyModule.label} · ${activeStage.shortLabel}`}
              </span>
              <span className="whitespace-nowrap">
                {layerMode === 'cutaway'
                  ? 'Cutaway'
                  : layerMode === 'airflow'
                    ? 'Airflow'
                    : 'Thermal'}{' '}
                · {isExploded ? 'Exploded' : 'Assembled'} ·{' '}
                {isPlaying ? 'Flow Active' : 'Paused'}
              </span>
            </div>

            <div className="flex-1 min-h-[250px] lg:min-h-[310px] border border-slate-800/80 rounded-md bg-[#070A11] relative overflow-hidden">
              <EngineSceneCanvas
                selectedStageId={selectedStageId}
                cameraFocusMode={cameraFocusMode}
                focusTrigger={focusTrigger}
                layerMode={layerMode}
                throttlePercent={throttlePercent}
                isPlaying={isPlaying}
                isExploded={isExploded}
                isFocusMode={isFocusMode}
                onSelectStage={onSelectStage}
              />

              <div className="pointer-events-none absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
                <span className="px-2 py-0.5 rounded bg-[#0B101B]/90 border border-slate-800/90 truncate">
                  Drag to orbit · Scroll to zoom · Click stage
                </span>
                <span className="px-2 py-0.5 rounded bg-[#0B101B]/90 border border-slate-800/90 whitespace-nowrap shrink-0 hidden sm:inline">
                  {cameraFocusMode === 'overview'
                    ? 'Camera: Overview'
                    : `Camera: ${activeStage.shortLabel}`}
                </span>
              </div>
            </div>

            <VoiceCaptionStrip caption={voiceCaption ?? null} />

            <div
              role="group"
              aria-label="Engine station selector"
              className="shrink-0 grid grid-cols-4 gap-1.5"
            >
              {ENGINE_STAGES.map((stage) => {
                const active = stage.id === selectedStageId;
                return (
                  <button
                    key={stage.id}
                    type="button"
                    aria-label={stage.name}
                    onClick={() => onSelectStage(stage.id)}
                    aria-pressed={active}
                    className={`px-2 py-1.5 text-xs font-medium rounded border transition-colors duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                      active
                        ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-200'
                        : 'bg-[#0C1220] border-slate-800 text-slate-400 hover:text-slate-100 hover:border-slate-700'
                    }`}
                  >
                    {stage.shortLabel}
                  </button>
                );
              })}
            </div>

            {!isFocusMode && (
              <div className="shrink-0 bg-[#0C111D] border border-slate-800 rounded-md p-3 space-y-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="space-y-0.5">
                    <h3
                      data-testid="active-stage-name"
                      className="font-display text-sm font-semibold text-slate-100"
                    >
                      {activeStage.name}
                    </h3>
                    <p className="text-xs font-mono text-cyan-400">
                      {activeStage.stationCode}
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <label
                      htmlFor="throttle-slider"
                      className="text-xs font-medium text-slate-300 whitespace-nowrap"
                    >
                      Throttle
                    </label>
                    <input
                      id="throttle-slider"
                      type="range"
                      min={APP_CONFIG.simulationDefaults.minThrottlePercent}
                      max={APP_CONFIG.simulationDefaults.maxThrottlePercent}
                      value={throttlePercent}
                      onChange={(e) => onThrottleChange(Number(e.target.value))}
                      className="w-24 sm:w-32 accent-cyan-400 cursor-pointer"
                    />
                    <span
                      data-testid="throttle-readout"
                      className="text-xs font-mono tabular-nums text-slate-200 w-10 text-right"
                    >
                      {throttlePercent}%
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  {activeStage.role}
                </p>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                  <span>Pressure: {activeStage.pressureNote}</span>
                  <span aria-hidden="true">·</span>
                  <span>Temp: {activeStage.temperatureNote}</span>
                </div>

                <div className="pt-2 border-t border-slate-800/90 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <p className="text-[11px] text-slate-400">Core RPM (est.)</p>
                    <p className="font-mono tabular-nums text-sm font-semibold text-slate-100">
                      {telemetry.rpmPercent.toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400">EGT (est.)</p>
                    <p className="font-mono tabular-nums text-sm font-semibold text-amber-300">
                      {telemetry.egtCelsius} °C
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400">Exit Mach (est.)</p>
                    <p className="font-mono tabular-nums text-sm font-semibold text-slate-100">
                      M {telemetry.machEstimate.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400">Net Thrust (est.)</p>
                    <p className="font-mono tabular-nums text-sm font-semibold text-cyan-300">
                      {telemetry.thrustKn.toFixed(1)} kN
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
