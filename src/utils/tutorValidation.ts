import { APP_CONFIG, type VisualizationLayerMode } from '../config/appConfig.ts';
import type {
  AssetRetrievalPlan,
  ConceptDiagramSpec,
  ConfidenceLevel,
  DiagramEdge,
  DiagramNode,
  EngineComponentId,
  ExplorationLevel,
  GeminiTutorStructuredResponse,
  ScreenAnalyzeRequest,
  ScreenAnalyzeStructuredResponse,
  SupportedVisualizationComponent,
  TutorAskRequest,
  UploadedAssetSummary,
} from '../types/tutor.ts';
import { validateGeneratedScene3DSpec } from './scene3DValidation.ts';
import { validateSceneActionPlan } from './sceneRouting.ts';

const VALID_EXPLORATION_LEVELS = new Set<ExplorationLevel>([
  'full-object',
  'internal-structure',
  'component-detail',
]);

const VALID_COMPONENTS: readonly SupportedVisualizationComponent[] = [
  'intake',
  'fan',
  'lp-compressor',
  'hp-compressor',
  'combustor',
  'turbine',
  'nozzle',
  'bypass-duct',
  'none',
];

const COMPONENT_ALIASES: Readonly<Record<string, EngineComponentId>> = {
  compressor: 'hp-compressor',
  'axial-compressor': 'hp-compressor',
  'axial compressor': 'hp-compressor',
  'low-pressure compressor': 'lp-compressor',
  'lp compressor': 'lp-compressor',
  lpc: 'lp-compressor',
  'high-pressure compressor': 'hp-compressor',
  'hp compressor': 'hp-compressor',
  hpc: 'hp-compressor',
  'bypass duct': 'bypass-duct',
  'exhaust nozzle': 'nozzle',
  'combustion chamber': 'combustor',
  'turbine stages': 'turbine',
};

const VALID_LAYER_MODES: readonly VisualizationLayerMode[] = [
  'cutaway',
  'airflow',
  'thermal',
];

const VALID_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const VALID_CONFIDENCE_LEVELS = new Set<ConfidenceLevel>(['high', 'medium', 'low']);
const VALID_DIAGRAM_LAYOUTS = new Set(['flow', 'cycle', 'hierarchy']);
const VALID_NODE_CATEGORIES = new Set(['primary', 'secondary', 'energy']);

function sanitizeUploadedAssets(raw: unknown): UploadedAssetSummary[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const list: UploadedAssetSummary[] = [];
  for (const item of raw.slice(0, 12)) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const id = typeof obj.id === 'string' ? obj.id.trim().slice(0, 64) : '';
    const name = typeof obj.name === 'string' ? obj.name.trim().slice(0, 80) : '';
    if (!id || !name) continue;
    const category =
      typeof obj.category === 'string' && obj.category.trim()
        ? obj.category.trim().slice(0, 48)
        : 'custom-glb';
    const parts = Array.isArray(obj.parts)
      ? obj.parts
          .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
          .map((p) => p.trim().slice(0, 64))
          .slice(0, 24)
      : [];
    list.push({ id, name, category, parts });
  }
  return list.length > 0 ? list : undefined;
}

function sanitizeExplorationLevel(raw: unknown): ExplorationLevel | undefined {
  if (typeof raw !== 'string') return undefined;
  const norm = raw.trim().toLowerCase() as ExplorationLevel;
  return VALID_EXPLORATION_LEVELS.has(norm) ? norm : undefined;
}

function validateAssetRetrievalPlan(rawPlan: unknown): AssetRetrievalPlan | undefined {
  if (!rawPlan || typeof rawPlan !== 'object') return undefined;
  const obj = rawPlan as Record<string, unknown>;
  const matchedAssetId =
    typeof obj.matchedAssetId === 'string' && obj.matchedAssetId.trim()
      ? obj.matchedAssetId.trim().slice(0, 64)
      : 'none';
  const requestedLevel = sanitizeExplorationLevel(obj.requestedLevel) ?? 'full-object';
  const focusPartId =
    typeof obj.focusPartId === 'string' && obj.focusPartId.trim()
      ? obj.focusPartId.trim().slice(0, 64)
      : undefined;
  const openIllustrativeSubsystemId =
    typeof obj.openIllustrativeSubsystemId === 'string' &&
    obj.openIllustrativeSubsystemId.trim()
      ? obj.openIllustrativeSubsystemId.trim().slice(0, 64)
      : undefined;
  const conceptualOnlyNotice =
    typeof obj.conceptualOnlyNotice === 'string' && obj.conceptualOnlyNotice.trim()
      ? obj.conceptualOnlyNotice.trim().slice(0, 240)
      : undefined;

  return {
    matchedAssetId,
    requestedLevel,
    focusPartId,
    openIllustrativeSubsystemId,
    conceptualOnlyNotice,
  };
}

/**
 * Normalizes component identifiers emitted by Gemini into one of the 8 supported
 * 3D turbofan components or 'none'.
 */
export function normalizeVisualizationComponent(
  rawComponent: unknown,
): SupportedVisualizationComponent {
  if (typeof rawComponent !== 'string') {
    return 'none';
  }
  const normalized = rawComponent.trim().toLowerCase();
  if (VALID_COMPONENTS.includes(normalized as SupportedVisualizationComponent)) {
    return normalized as SupportedVisualizationComponent;
  }
  return COMPONENT_ALIASES[normalized] ?? 'none';
}

/**
 * Validates and normalizes an incoming tutor ask request payload.
 */
export function validateTutorAskRequest(
  payload: unknown,
): { ok: true; value: TutorAskRequest } | { ok: false; error: string } {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  const raw = payload as Record<string, unknown>;
  const question = typeof raw.question === 'string' ? raw.question.trim() : '';

  if (!question) {
    return { ok: false, error: 'Please provide a question for the Gemini AI Tutor.' };
  }

  const maxQ = APP_CONFIG.aiTutorConfig.maxQuestionChars;
  const maxH = APP_CONFIG.aiTutorConfig.maxHighlightChars;
  const maxCtx = APP_CONFIG.pdfDefaults.maxContextChars;

  const highlightedText =
    typeof raw.highlightedText === 'string'
      ? raw.highlightedText.trim().slice(0, maxH)
      : undefined;

  const pageContext =
    typeof raw.pageContext === 'string'
      ? raw.pageContext.trim().slice(0, maxCtx)
      : undefined;

  const documentTitle =
    typeof raw.documentTitle === 'string'
      ? raw.documentTitle.trim().slice(0, 200)
      : undefined;

  const pageNumber =
    typeof raw.pageNumber === 'number' && Number.isFinite(raw.pageNumber) && raw.pageNumber >= 1
      ? Math.floor(raw.pageNumber)
      : undefined;

  const activeModuleLabel =
    typeof raw.activeModuleLabel === 'string'
      ? raw.activeModuleLabel.trim().slice(0, 120)
      : undefined;

  const activeStageName =
    typeof raw.activeStageName === 'string'
      ? raw.activeStageName.trim().slice(0, 120)
      : undefined;

  const activeAssetId =
    typeof raw.activeAssetId === 'string'
      ? raw.activeAssetId.trim().slice(0, 64)
      : undefined;

  const activeExplorationLevel = sanitizeExplorationLevel(raw.activeExplorationLevel);
  const uploadedAssets = sanitizeUploadedAssets(raw.uploadedAssets);

  const activeGeneratedSystemTitle =
    typeof raw.activeGeneratedSystemTitle === 'string'
      ? raw.activeGeneratedSystemTitle.trim().slice(0, 140)
      : undefined;

  const selectedGeneratedComponentName =
    typeof raw.selectedGeneratedComponentName === 'string'
      ? raw.selectedGeneratedComponentName.trim().slice(0, 120)
      : undefined;

  return {
    ok: true,
    value: {
      question: question.slice(0, maxQ),
      highlightedText: highlightedText || undefined,
      pageContext: pageContext || undefined,
      documentTitle: documentTitle || undefined,
      pageNumber,
      activeModuleLabel: activeModuleLabel || undefined,
      activeStageName: activeStageName || undefined,
      activeAssetId: activeAssetId || undefined,
      activeExplorationLevel,
      uploadedAssets,
      activeGeneratedSystemTitle: activeGeneratedSystemTitle || undefined,
      selectedGeneratedComponentName: selectedGeneratedComponentName || undefined,
    },
  };
}

/**
 * Validates an incoming Learn from Screen request (cropped base64 screenshot + question).
 */
export function validateScreenAnalyzeRequest(
  payload: unknown,
): { ok: true; value: ScreenAnalyzeRequest } | { ok: false; error: string } {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  const raw = payload as Record<string, unknown>;
  const question = typeof raw.question === 'string' ? raw.question.trim() : '';
  if (!question) {
    return { ok: false, error: 'Please enter a question about the selected region.' };
  }

  const rawMime = typeof raw.mimeType === 'string' ? raw.mimeType.trim().toLowerCase() : '';
  if (!VALID_MIME_TYPES.has(rawMime)) {
    return { ok: false, error: 'Unsupported screenshot image format.' };
  }

  let imageBase64 = typeof raw.imageBase64 === 'string' ? raw.imageBase64.trim() : '';
  const dataPrefixIdx = imageBase64.indexOf(';base64,');
  if (imageBase64.startsWith('data:') && dataPrefixIdx !== -1) {
    imageBase64 = imageBase64.slice(dataPrefixIdx + ';base64,'.length);
  }

  if (!imageBase64 || imageBase64.length < 32) {
    return { ok: false, error: 'Please select a screen region before clicking Visualize This.' };
  }

  if (imageBase64.length > APP_CONFIG.screenCaptureDefaults.maxBase64Chars) {
    return {
      ok: false,
      error: 'Selected screen capture is too large. Try selecting a smaller region.',
    };
  }

  if (!/^[A-Za-z0-9+/=]+$/.test(imageBase64)) {
    return { ok: false, error: 'Captured image data is not valid base64.' };
  }

  const activeStageName =
    typeof raw.activeStageName === 'string'
      ? raw.activeStageName.trim().slice(0, 120)
      : undefined;

  const activeAssetId =
    typeof raw.activeAssetId === 'string'
      ? raw.activeAssetId.trim().slice(0, 64)
      : undefined;

  const activeExplorationLevel = sanitizeExplorationLevel(raw.activeExplorationLevel);
  const uploadedAssets = sanitizeUploadedAssets(raw.uploadedAssets);

  const previousConcept =
    typeof raw.previousConcept === 'string'
      ? raw.previousConcept.trim().slice(0, 180)
      : undefined;

  const selectedGeneratedComponentName =
    typeof raw.selectedGeneratedComponentName === 'string'
      ? raw.selectedGeneratedComponentName.trim().slice(0, 120)
      : undefined;

  return {
    ok: true,
    value: {
      question: question.slice(0, APP_CONFIG.aiTutorConfig.maxQuestionChars),
      imageBase64,
      mimeType: rawMime as ScreenAnalyzeRequest['mimeType'],
      activeStageName: activeStageName || undefined,
      activeAssetId: activeAssetId || undefined,
      activeExplorationLevel,
      uploadedAssets,
      previousConcept: previousConcept || undefined,
      selectedGeneratedComponentName: selectedGeneratedComponentName || undefined,
    },
  };
}

/**
 * Parses and validates Gemini's structured JSON output before passing it to UI/visualization state.
 */
export function validateGeminiTutorResponse(
  rawJsonOrObject: unknown,
): { ok: true; value: GeminiTutorStructuredResponse } | { ok: false; error: string } {
  let parsed: unknown = rawJsonOrObject;

  if (typeof rawJsonOrObject === 'string') {
    const trimmed = rawJsonOrObject.trim();
    if (!trimmed) {
      return { ok: false, error: 'Gemini returned an empty response.' };
    }
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return { ok: false, error: 'Gemini response was not valid JSON.' };
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Gemini structured response must be an object.' };
  }

  const obj = parsed as Record<string, unknown>;

  const mainConcept =
    typeof obj.mainConcept === 'string' ? obj.mainConcept.trim() : '';
  const studentQuestionSummary =
    typeof obj.studentQuestionSummary === 'string'
      ? obj.studentQuestionSummary.trim()
      : '';
  const recommendedVisualization =
    typeof obj.recommendedVisualization === 'string'
      ? obj.recommendedVisualization.trim()
      : '';
  const explanation =
    typeof obj.explanation === 'string' ? obj.explanation.trim() : '';

  if (!mainConcept || !explanation || !recommendedVisualization) {
    return {
      ok: false,
      error: 'Gemini response is missing required educational explanation fields.',
    };
  }

  const rawComponents = Array.isArray(obj.componentsAndRelationships)
    ? obj.componentsAndRelationships
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim())
    : [];

  const supportedVisualizationComponent = normalizeVisualizationComponent(
    obj.supportedVisualizationComponent,
  );

  const visualizationSupported =
    typeof obj.visualizationSupported === 'boolean'
      ? obj.visualizationSupported && supportedVisualizationComponent !== 'none'
      : supportedVisualizationComponent !== 'none';

  const normalizedComponent: SupportedVisualizationComponent = visualizationSupported
    ? supportedVisualizationComponent
    : 'none';

  const rawLayerMode =
    typeof obj.recommendedLayerMode === 'string'
      ? obj.recommendedLayerMode.trim().toLowerCase()
      : 'cutaway';

  const recommendedLayerMode: VisualizationLayerMode =
    VALID_LAYER_MODES.includes(rawLayerMode as VisualizationLayerMode)
      ? (rawLayerMode as VisualizationLayerMode)
      : 'cutaway';

  const assetRetrievalPlan = validateAssetRetrievalPlan(obj.assetRetrievalPlan);
  const sceneActionPlan = validateSceneActionPlan(obj.sceneActionPlan);
  const hasVerifiedGlbMatch =
    Boolean(assetRetrievalPlan) &&
    assetRetrievalPlan!.matchedAssetId !== 'none' &&
    assetRetrievalPlan!.matchedAssetId !== 'turbofan-engine' &&
    !assetRetrievalPlan!.openIllustrativeSubsystemId;

  const diagramData = validateDiagramSpec(obj.diagramData);
  const generatedScene3D =
    !visualizationSupported && !hasVerifiedGlbMatch && !sceneActionPlan
      ? validateGeneratedScene3DSpec(obj.generatedScene3D)
      : undefined;

  return {
    ok: true,
    value: {
      mainConcept,
      studentQuestionSummary: studentQuestionSummary || mainConcept,
      componentsAndRelationships: rawComponents,
      recommendedVisualization,
      explanation,
      supportedVisualizationComponent: normalizedComponent,
      visualizationSupported,
      recommendedLayerMode,
      assetRetrievalPlan,
      sceneActionPlan,
      diagramData,
      generatedScene3D,
    },
  };
}

function validateDiagramSpec(rawDiagram: unknown): ConceptDiagramSpec | undefined {
  if (!rawDiagram || typeof rawDiagram !== 'object') {
    return undefined;
  }
  const obj = rawDiagram as Record<string, unknown>;
  const rawNodes = Array.isArray(obj.nodes) ? obj.nodes : [];
  const nodes: DiagramNode[] = [];
  const seenIds = new Set<string>();

  for (const item of rawNodes.slice(0, 6)) {
    if (!item || typeof item !== 'object') continue;
    const node = item as Record<string, unknown>;
    const id = typeof node.id === 'string' ? node.id.trim() : '';
    const label = typeof node.label === 'string' ? node.label.trim() : '';
    const role = typeof node.role === 'string' ? node.role.trim() : '';
    const rawCat =
      typeof node.category === 'string' ? node.category.trim().toLowerCase() : 'primary';
    const category: DiagramNode['category'] = VALID_NODE_CATEGORIES.has(rawCat)
      ? (rawCat as DiagramNode['category'])
      : 'primary';

    if (id && label && !seenIds.has(id)) {
      seenIds.add(id);
      nodes.push({
        id,
        label: label.slice(0, 48),
        role: role.slice(0, 200) || label,
        category,
      });
    }
  }

  if (nodes.length < 2) {
    return undefined;
  }

  const rawEdges = Array.isArray(obj.edges) ? obj.edges : [];
  const edges: DiagramEdge[] = [];
  for (const item of rawEdges.slice(0, 8)) {
    if (!item || typeof item !== 'object') continue;
    const edge = item as Record<string, unknown>;
    const fromId = typeof edge.fromId === 'string' ? edge.fromId.trim() : '';
    const toId = typeof edge.toId === 'string' ? edge.toId.trim() : '';
    const label = typeof edge.label === 'string' ? edge.label.trim() : '';
    if (seenIds.has(fromId) && seenIds.has(toId) && fromId !== toId) {
      edges.push({ fromId, toId, label: label.slice(0, 44) });
    }
  }

  const rawLayout =
    typeof obj.layout === 'string' ? obj.layout.trim().toLowerCase() : 'flow';
  const layout: ConceptDiagramSpec['layout'] = VALID_DIAGRAM_LAYOUTS.has(rawLayout)
    ? (rawLayout as ConceptDiagramSpec['layout'])
    : 'flow';

  const title =
    typeof obj.title === 'string' && obj.title.trim()
      ? obj.title.trim().slice(0, 80)
      : 'Component & Process Breakdown';

  return {
    title,
    layout,
    nodes,
    edges,
  };
}

/**
 * Validates Gemini's multimodal Learn from Screen JSON response, including
 * scientific principles, confidence/uncertainty, and optional 2D diagram fallback.
 */
export function validateScreenAnalyzeResponse(
  rawJsonOrObject: unknown,
): { ok: true; value: ScreenAnalyzeStructuredResponse } | { ok: false; error: string } {
  const baseResult = validateGeminiTutorResponse(rawJsonOrObject);
  if (!baseResult.ok) {
    return baseResult;
  }

  const obj = (
    typeof rawJsonOrObject === 'string' ? JSON.parse(rawJsonOrObject) : rawJsonOrObject
  ) as Record<string, unknown>;

  const scientificPrinciples = Array.isArray(obj.scientificPrinciples)
    ? obj.scientificPrinciples
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim())
        .slice(0, 6)
    : [];

  const rawConf =
    typeof obj.confidenceLevel === 'string'
      ? obj.confidenceLevel.trim().toLowerCase()
      : 'medium';
  const confidenceLevel: ConfidenceLevel = VALID_CONFIDENCE_LEVELS.has(
    rawConf as ConfidenceLevel,
  )
    ? (rawConf as ConfidenceLevel)
    : 'medium';

  const uncertaintyNote =
    typeof obj.uncertaintyNote === 'string' && obj.uncertaintyNote.trim()
      ? obj.uncertaintyNote.trim()
      : 'Based on visible features in the selected region.';

  return {
    ok: true,
    value: {
      ...baseResult.value,
      scientificPrinciples,
      confidenceLevel,
      uncertaintyNote,
    },
  };
}

/**
 * Extracts a bounded snippet of surrounding page text centered around a highlighted selection.
 */
export function buildSurroundingPageContext(
  fullPageText: string,
  highlightedText: string,
  maxChars = APP_CONFIG.pdfDefaults.maxContextChars,
): string {
  const cleanPage = fullPageText.replace(/\s+/g, ' ').trim();
  if (!cleanPage) {
    return '';
  }
  if (cleanPage.length <= maxChars) {
    return cleanPage;
  }
  const cleanHighlight = highlightedText.replace(/\s+/g, ' ').trim();
  const idx = cleanHighlight
    ? cleanPage.toLowerCase().indexOf(cleanHighlight.toLowerCase())
    : -1;

  if (idx === -1) {
    return cleanPage.slice(0, maxChars);
  }

  const halfWindow = Math.floor((maxChars - cleanHighlight.length) / 2);
  const start = Math.max(0, idx - halfWindow);
  const end = Math.min(cleanPage.length, start + maxChars);
  return cleanPage.slice(start, end);
}
