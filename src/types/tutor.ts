import type {
  ExplanationDifficulty,
  GeminiVoiceName,
  NarratorPersonality,
  VisualizationLayerMode,
} from '../config/appConfig';
import type { SixStrokeVariantId } from '../three/sixStrokeKinematics';

export type EngineComponentId =
  | 'intake'
  | 'fan'
  | 'lp-compressor'
  | 'hp-compressor'
  | 'combustor'
  | 'turbine'
  | 'nozzle'
  | 'bypass-duct';

export type SupportedVisualizationComponent = EngineComponentId | 'none';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface DiagramNode {
  readonly id: string;
  readonly label: string;
  readonly role: string;
  readonly category: 'primary' | 'secondary' | 'energy';
}

export interface DiagramEdge {
  readonly fromId: string;
  readonly toId: string;
  readonly label: string;
}

export interface ConceptDiagramSpec {
  readonly title: string;
  readonly layout: 'flow' | 'cycle' | 'hierarchy';
  readonly nodes: readonly DiagramNode[];
  readonly edges: readonly DiagramEdge[];
}

export type Scene3DPrimitiveType =
  | 'box'
  | 'cylinder'
  | 'cone'
  | 'sphere'
  | 'capsule'
  | 'torus'
  | 'ring'
  | 'extruded-polygon'
  | 'lathe'
  | 'tube'
  | 'helix'
  | 'gear';

export type Scene3DAnimationType =
  | 'none'
  | 'spin'
  | 'reciprocate'
  | 'crank-slider'
  | 'oscillate-rotation'
  | 'pulse-scale'
  | 'orbit';

export type Scene3DAxis = 'x' | 'y' | 'z';

export type Scene3DConnectionKind =
  | 'mechanical'
  | 'electrical'
  | 'fluid'
  | 'thermal'
  | 'magnetic'
  | 'signal';

export type Vec3Tuple = readonly [number, number, number];
export type Vec2Tuple = readonly [number, number];

export interface Scene3DMaterialSpec {
  readonly color: string;
  readonly metalness: number;
  readonly roughness: number;
  readonly opacity?: number;
  readonly emissive?: string;
  readonly emissiveIntensity?: number;
  readonly wireframe?: boolean;
}

export interface Scene3DShapePart {
  readonly primitive: Scene3DPrimitiveType;
  readonly offset: Vec3Tuple;
  readonly rotation: Vec3Tuple;
  readonly material: Scene3DMaterialSpec;
  readonly width?: number;
  readonly height?: number;
  readonly depth?: number;
  readonly radius?: number;
  readonly radiusTop?: number;
  readonly radiusBottom?: number;
  readonly tubeRadius?: number;
  readonly turns?: number;
  readonly teeth?: number;
  readonly profilePoints?: readonly Vec2Tuple[];
  readonly pathPoints?: readonly Vec3Tuple[];
}

export interface Scene3DAnimationSpec {
  readonly type: Scene3DAnimationType;
  readonly axis: Scene3DAxis;
  readonly speed: number;
  readonly amplitude: number;
  readonly phaseOffset: number;
  readonly crankRadius?: number;
  readonly rodLength?: number;
  readonly linkageRole?: 'crank' | 'connecting-rod' | 'piston';
  readonly orbitRadius?: number;
}

export interface Scene3DComponentSpec {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly parentId?: string;
  readonly position: Vec3Tuple;
  readonly rotation: Vec3Tuple;
  readonly explodeVector?: Vec3Tuple;
  readonly dimensionsEstimate?: string;
  readonly operatingNote?: string;
  readonly shapes: readonly Scene3DShapePart[];
  readonly animation: Scene3DAnimationSpec;
}

export interface Scene3DConnectionSpec {
  readonly fromId: string;
  readonly toId: string;
  readonly label: string;
  readonly kind: Scene3DConnectionKind;
  readonly animatedFlow?: boolean;
}

export interface GeneratedScene3DSpec {
  readonly feasible: boolean;
  readonly infeasibilityReason?: string;
  readonly systemTitle: string;
  readonly category: string;
  readonly conceptualNote: string;
  readonly estimatedScaleLabel: string;
  readonly operatingPrinciple: string;
  readonly physicalProcesses: readonly string[];
  readonly components: readonly Scene3DComponentSpec[];
  readonly connections: readonly Scene3DConnectionSpec[];
}

export type ExplorationLevel =
  | 'full-object'
  | 'internal-structure'
  | 'component-detail';

export interface UploadedAssetSummary {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly parts: readonly string[];
}

export interface AssetRetrievalPlan {
  readonly matchedAssetId: string;
  readonly requestedLevel: ExplorationLevel;
  readonly focusPartId?: string;
  readonly openIllustrativeSubsystemId?: string;
  readonly conceptualOnlyNotice?: string;
}

export interface TutorAskRequest {
  question: string;
  highlightedText?: string;
  pageContext?: string;
  documentTitle?: string;
  pageNumber?: number;
  activeModuleLabel?: string;
  activeStageName?: string;
  activeAssetId?: string;
  activeExplorationLevel?: ExplorationLevel;
  uploadedAssets?: readonly UploadedAssetSummary[];
  activeGeneratedSystemTitle?: string;
  selectedGeneratedComponentName?: string;
}

export interface ScreenAnalyzeRequest {
  question: string;
  imageBase64: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  activeStageName?: string;
  activeAssetId?: string;
  activeExplorationLevel?: ExplorationLevel;
  uploadedAssets?: readonly UploadedAssetSummary[];
  previousConcept?: string;
  selectedGeneratedComponentName?: string;
}

export interface GeminiTutorStructuredResponse {
  mainConcept: string;
  studentQuestionSummary: string;
  componentsAndRelationships: string[];
  recommendedVisualization: string;
  explanation: string;
  supportedVisualizationComponent: SupportedVisualizationComponent;
  visualizationSupported: boolean;
  recommendedLayerMode: VisualizationLayerMode;
  assetRetrievalPlan?: AssetRetrievalPlan;
  sceneActionPlan?: SceneActionPlan;
  diagramData?: ConceptDiagramSpec;
  generatedScene3D?: GeneratedScene3DSpec;
}

export interface ScreenAnalyzeStructuredResponse extends GeminiTutorStructuredResponse {
  scientificPrinciples: string[];
  confidenceLevel: ConfidenceLevel;
  uncertaintyNote: string;
}

export interface SelectedPdfExcerpt {
  text: string;
  pageContext: string;
  pageNumber: number;
  documentTitle: string;
}

export interface CapturedScreenRegion {
  readonly dataUrl: string;
  readonly base64: string;
  readonly mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  readonly width: number;
  readonly height: number;
  readonly sourceLabel: string;
}

export type ShowcaseSceneId =
  | 'turbofan'
  | 'inline-six'
  | 'six-stroke'
  | 'cordless-drill'
  | 'ship-propulsion'
  | 'robotic-arm';

export type SceneTargetKind =
  | 'turbofan'
  | 'inline-six'
  | 'six-stroke'
  | 'cordless-drill'
  | 'ship-propulsion'
  | 'robotic-arm'
  | 'glb-asset'
  | 'generated-3d';

export type LessonCameraAction = 'overview' | 'focus-component';

export type LessonHighlightAction = 'none' | 'highlight' | 'isolate';

export type LessonAnimationAction =
  | 'play'
  | 'pause'
  | 'explode'
  | 'assemble'
  | 'layer-cutaway'
  | 'layer-airflow'
  | 'layer-thermal';

export interface LessonComponentSummary {
  readonly id: string;
  readonly name: string;
  readonly role?: string;
}

export interface TeachLessonSegment {
  readonly id: string;
  readonly title: string;
  readonly spokenText: string;
  readonly captionText: string;
  readonly componentId: string;
  readonly cameraAction: LessonCameraAction;
  readonly highlightAction: LessonHighlightAction;
  readonly animationAction: LessonAnimationAction;
  readonly sequenceId?: string;
  readonly seekProgress?: number;
}

export interface SceneActionPlan {
  readonly sceneId: ShowcaseSceneId;
  readonly componentId?: string;
  readonly sequenceId?: string;
  readonly seekProgress?: number;
  readonly viewMode?: 'full' | 'cutaway' | 'internal' | 'airflow' | 'thermal';
  readonly isolate?: boolean;
  readonly play?: boolean;
  readonly crankAngleDeg?: number;
  readonly focusedCylinder?: number;
  readonly sixStrokeVariant?: SixStrokeVariantId;
  readonly baseTurnDeg?: number;
  readonly unsupportedRequestNotice?: string;
}

export interface TeachLessonRequest {
  readonly sceneKind: SceneTargetKind;
  readonly systemId: string;
  readonly systemTitle: string;
  readonly systemDescription?: string;
  readonly components: readonly LessonComponentSummary[];
  readonly selectedComponentId?: string;
  readonly difficulty: ExplanationDifficulty;
  readonly personality: NarratorPersonality;
  readonly segmentMode?: 'full' | 'first-only';
  readonly question?: string;
  readonly highlightedText?: string;
  readonly pageContext?: string;
  readonly documentTitle?: string;
  readonly pageNumber?: number;
  readonly screenImageBase64?: string;
  readonly screenImageMimeType?: 'image/png' | 'image/jpeg' | 'image/webp';
}

export interface TeachLessonResponse {
  readonly lessonTitle: string;
  readonly systemTitle: string;
  readonly difficulty: ExplanationDifficulty;
  readonly personality: NarratorPersonality;
  readonly introSummary: string;
  readonly segments: readonly TeachLessonSegment[];
  readonly isPartialFirstSegment?: boolean;
  readonly cached?: boolean;
  readonly latencyMs?: number;
}

export interface TeachTtsRequest {
  readonly text: string;
  readonly voiceName?: GeminiVoiceName;
  readonly personality?: NarratorPersonality;
  readonly difficulty?: ExplanationDifficulty;
}

export interface TeachTtsResponse {
  readonly audioBase64: string;
  readonly mimeType: string;
  readonly voiceName: GeminiVoiceName;
}
