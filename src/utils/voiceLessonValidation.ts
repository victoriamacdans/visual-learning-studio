import {
  APP_CONFIG,
  GEMINI_TTS_VOICES,
  type ExplanationDifficulty,
  type GeminiVoiceName,
  type NarratorPersonality,
} from '../config/appConfig.ts';
import type {
  LessonAnimationAction,
  LessonCameraAction,
  LessonComponentSummary,
  LessonHighlightAction,
  SceneTargetKind,
  TeachLessonRequest,
  TeachLessonResponse,
  TeachLessonSegment,
  TeachTtsRequest,
  TeachTtsResponse,
} from '../types/tutor.ts';

const VALID_SCENE_KINDS = new Set<SceneTargetKind>([
  'turbofan',
  'inline-six',
  'six-stroke',
  'cordless-drill',
  'ship-propulsion',
  'robotic-arm',
  'glb-asset',
  'generated-3d',
]);

const VALID_DIFFICULTIES = new Set<ExplanationDifficulty>([
  'beginner',
  'simple',
  'intermediate',
  'advanced',
]);

const VALID_PERSONALITIES = new Set<NarratorPersonality>([
  'friendly',
  'professional',
  'gen-z',
]);

const VALID_CAMERA_ACTIONS = new Set<LessonCameraAction>([
  'overview',
  'focus-component',
]);

const VALID_HIGHLIGHT_ACTIONS = new Set<LessonHighlightAction>([
  'none',
  'highlight',
  'isolate',
]);

const VALID_ANIMATION_ACTIONS = new Set<LessonAnimationAction>([
  'play',
  'pause',
  'explode',
  'assemble',
  'layer-cutaway',
  'layer-airflow',
  'layer-thermal',
]);

const VALID_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const VALID_GEMINI_VOICES = new Set<GeminiVoiceName>(
  GEMINI_TTS_VOICES.map((v) => v.id),
);

export function normalizeDifficulty(raw: unknown): ExplanationDifficulty {
  if (typeof raw !== 'string') return APP_CONFIG.voiceTutorConfig.defaultDifficulty;
  const norm = raw.trim().toLowerCase() as ExplanationDifficulty;
  return VALID_DIFFICULTIES.has(norm)
    ? norm
    : APP_CONFIG.voiceTutorConfig.defaultDifficulty;
}

export function normalizePersonality(raw: unknown): NarratorPersonality {
  if (typeof raw !== 'string') return APP_CONFIG.voiceTutorConfig.defaultPersonality;
  const norm = raw.trim().toLowerCase() as NarratorPersonality;
  return VALID_PERSONALITIES.has(norm)
    ? norm
    : APP_CONFIG.voiceTutorConfig.defaultPersonality;
}

export function normalizeGeminiVoiceName(raw: unknown): GeminiVoiceName {
  if (typeof raw !== 'string') return APP_CONFIG.voiceTutorConfig.defaultVoiceName;
  const trimmed = raw.trim();
  const matched = GEMINI_TTS_VOICES.find(
    (v) => v.id.toLowerCase() === trimmed.toLowerCase(),
  );
  return matched ? matched.id : APP_CONFIG.voiceTutorConfig.defaultVoiceName;
}

/**
 * Generates expressive vocal delivery instructions for Gemini neural TTS
 * so narration always sounds warm, lively, and natural rather than flat.
 */
export function buildSpeechStyleDirection(
  personality: NarratorPersonality,
  difficulty: ExplanationDifficulty,
): string {
  const paceNote =
    difficulty === 'beginner' || difficulty === 'simple'
      ? 'unhurried, approachable pace with clear pauses between ideas'
      : 'crisp, articulate pace with confident emphasis on key concepts';

  switch (personality) {
    case 'professional':
      return `Warm, engaging, articulate educator voice with bright clarity and an ${paceNote}. Never sound robotic or monotonous.`;
    case 'gen-z':
      return `Upbeat, energetic, enthusiastic, relatable narrator with expressive pitch variety, friendly smiles in the voice, and an ${paceNote}.`;
    case 'friendly':
    default:
      return `Bright, warm, cheerful mentor who sounds genuinely excited to teach, with natural conversational cadence and an ${paceNote}.`;
  }
}

/**
 * Cleans markdown formatting artifacts so browser TTS or Gemini TTS reads naturally.
 */
export function sanitizeSpokenText(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\s*[-*>#]+\s+/gm, '')
    .replace(/[`*_#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolves a Gemini-emitted componentId against the real component list of the
 * currently displayed 3D model. Never assumes turbofan IDs when another model is loaded.
 */
export function resolveValidLessonComponentId(
  rawId: unknown,
  allowedComponents: readonly LessonComponentSummary[],
): string {
  if (allowedComponents.length === 0) return '';
  if (typeof rawId !== 'string' || !rawId.trim()) {
    return allowedComponents[0].id;
  }

  const candidate = rawId.trim().toLowerCase();

  const exactId = allowedComponents.find((c) => c.id.toLowerCase() === candidate);
  if (exactId) return exactId.id;

  const exactName = allowedComponents.find((c) => c.name.toLowerCase() === candidate);
  if (exactName) return exactName.id;

  const partial = allowedComponents.find(
    (c) =>
      c.id.toLowerCase().includes(candidate) ||
      candidate.includes(c.id.toLowerCase()) ||
      c.name.toLowerCase().includes(candidate) ||
      candidate.includes(c.name.toLowerCase()),
  );
  if (partial) return partial.id;

  return allowedComponents[0].id;
}

/**
 * Validates and normalizes an incoming /api/tutor/teach request payload.
 */
export function validateTeachLessonRequest(
  payload: unknown,
): { ok: true; value: TeachLessonRequest } | { ok: false; error: string } {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Teach request body must be a JSON object.' };
  }

  const raw = payload as Record<string, unknown>;
  const rawSceneKind =
    typeof raw.sceneKind === 'string' ? raw.sceneKind.trim().toLowerCase() : '';
  if (!VALID_SCENE_KINDS.has(rawSceneKind as SceneTargetKind)) {
    return { ok: false, error: 'Unsupported 3D sceneKind for voice lesson.' };
  }
  const sceneKind = rawSceneKind as SceneTargetKind;

  const systemId =
    typeof raw.systemId === 'string' && raw.systemId.trim()
      ? raw.systemId.trim().slice(0, 80)
      : 'active-3d-system';

  const systemTitle =
    typeof raw.systemTitle === 'string' ? raw.systemTitle.trim().slice(0, 140) : '';
  if (!systemTitle) {
    return { ok: false, error: 'systemTitle is required to generate a voice lesson.' };
  }

  const systemDescription =
    typeof raw.systemDescription === 'string' && raw.systemDescription.trim()
      ? raw.systemDescription.trim().slice(0, 400)
      : undefined;

  const rawComponents = Array.isArray(raw.components) ? raw.components : [];
  const components: LessonComponentSummary[] = [];
  const seenIds = new Set<string>();
  for (const item of rawComponents.slice(0, 24)) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const id = typeof obj.id === 'string' ? obj.id.trim().slice(0, 80) : '';
    const name = typeof obj.name === 'string' ? obj.name.trim().slice(0, 100) : '';
    const role =
      typeof obj.role === 'string' && obj.role.trim()
        ? obj.role.trim().slice(0, 240)
        : undefined;
    if (!id || !name || seenIds.has(id.toLowerCase())) continue;
    seenIds.add(id.toLowerCase());
    components.push({ id, name, role });
  }

  if (components.length === 0) {
    return {
      ok: false,
      error: 'At least one active 3D component is required to generate a synchronized lesson.',
    };
  }

  const selectedComponentId =
    typeof raw.selectedComponentId === 'string' && raw.selectedComponentId.trim()
      ? resolveValidLessonComponentId(raw.selectedComponentId, components)
      : undefined;

  const difficulty = normalizeDifficulty(raw.difficulty);
  const personality = normalizePersonality(raw.personality);
  const segmentMode =
    typeof raw.segmentMode === 'string' && raw.segmentMode.trim().toLowerCase() === 'first-only'
      ? 'first-only'
      : 'full';

  const question =
    typeof raw.question === 'string' && raw.question.trim()
      ? raw.question.trim().slice(0, APP_CONFIG.aiTutorConfig.maxQuestionChars)
      : undefined;

  const highlightedText =
    typeof raw.highlightedText === 'string' && raw.highlightedText.trim()
      ? raw.highlightedText.trim().slice(0, APP_CONFIG.aiTutorConfig.maxHighlightChars)
      : undefined;

  const pageContext =
    typeof raw.pageContext === 'string' && raw.pageContext.trim()
      ? raw.pageContext.trim().slice(0, APP_CONFIG.pdfDefaults.maxContextChars)
      : undefined;

  const documentTitle =
    typeof raw.documentTitle === 'string' && raw.documentTitle.trim()
      ? raw.documentTitle.trim().slice(0, 160)
      : undefined;

  const pageNumber =
    typeof raw.pageNumber === 'number' &&
    Number.isFinite(raw.pageNumber) &&
    raw.pageNumber >= 1
      ? Math.floor(raw.pageNumber)
      : undefined;

  let screenImageBase64: string | undefined;
  let screenImageMimeType: TeachLessonRequest['screenImageMimeType'];
  if (typeof raw.screenImageBase64 === 'string' && raw.screenImageBase64.trim()) {
    const rawMime =
      typeof raw.screenImageMimeType === 'string'
        ? raw.screenImageMimeType.trim().toLowerCase()
        : '';
    if (!VALID_MIME_TYPES.has(rawMime)) {
      return { ok: false, error: 'Unsupported screen capture mime type.' };
    }
    let cleanB64 = raw.screenImageBase64.trim();
    const idx = cleanB64.indexOf(';base64,');
    if (cleanB64.startsWith('data:') && idx !== -1) {
      cleanB64 = cleanB64.slice(idx + ';base64,'.length);
    }
    if (
      cleanB64.length > 32 &&
      cleanB64.length <= APP_CONFIG.screenCaptureDefaults.maxBase64Chars &&
      /^[A-Za-z0-9+/=]+$/.test(cleanB64)
    ) {
      screenImageBase64 = cleanB64;
      screenImageMimeType = rawMime as TeachLessonRequest['screenImageMimeType'];
    }
  }

  return {
    ok: true,
    value: {
      sceneKind,
      systemId,
      systemTitle,
      systemDescription,
      components,
      selectedComponentId,
      difficulty,
      personality,
      segmentMode,
      question,
      highlightedText,
      pageContext,
      documentTitle,
      pageNumber,
      screenImageBase64,
      screenImageMimeType,
    },
  };
}

/**
 * Validates and sanitizes Gemini's structured Voice Tutor lesson JSON,
 * grounding every segment componentId strictly against the loaded 3D model's real components.
 */
export function validateTeachLessonResponse(
  rawJsonOrObject: unknown,
  allowedComponents: readonly LessonComponentSummary[],
  requestedDifficulty: ExplanationDifficulty,
  requestedPersonality: NarratorPersonality,
  fallbackSystemTitle = '3D System',
  minSegmentsRequired = 2,
): { ok: true; value: TeachLessonResponse } | { ok: false; error: string } {
  let parsed: unknown = rawJsonOrObject;

  if (typeof rawJsonOrObject === 'string') {
    const trimmed = rawJsonOrObject.trim();
    if (!trimmed) {
      return { ok: false, error: 'Gemini returned an empty voice lesson response.' };
    }
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return { ok: false, error: 'Gemini voice lesson response was not valid JSON.' };
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Voice lesson response must be an object.' };
  }

  const obj = parsed as Record<string, unknown>;
  const lessonTitle =
    typeof obj.lessonTitle === 'string' && obj.lessonTitle.trim()
      ? obj.lessonTitle.trim().slice(0, 120)
      : `${fallbackSystemTitle} Guided Lesson`;

  const systemTitle =
    typeof obj.systemTitle === 'string' && obj.systemTitle.trim()
      ? obj.systemTitle.trim().slice(0, 120)
      : fallbackSystemTitle;

  const introSummary =
    typeof obj.introSummary === 'string' && obj.introSummary.trim()
      ? sanitizeSpokenText(obj.introSummary).slice(0, 280)
      : `Guided audio tour of ${systemTitle}.`;

  const rawSegments = Array.isArray(obj.segments) ? obj.segments : [];
  const maxSegs = APP_CONFIG.voiceTutorConfig.maxSegments;
  const segments: TeachLessonSegment[] = [];

  for (let i = 0; i < rawSegments.length && segments.length < maxSegs; i += 1) {
    const item = rawSegments[i];
    if (!item || typeof item !== 'object') continue;
    const seg = item as Record<string, unknown>;

    const spokenTextRaw = typeof seg.spokenText === 'string' ? seg.spokenText : '';
    const spokenText = sanitizeSpokenText(spokenTextRaw).slice(0, 650);
    if (!spokenText) continue;

    const captionRaw =
      typeof seg.captionText === 'string' && seg.captionText.trim()
        ? seg.captionText
        : spokenText;
    const captionText = captionRaw.replace(/\s+/g, ' ').trim().slice(0, 500);

    const componentId = resolveValidLessonComponentId(
      seg.componentId,
      allowedComponents,
    );
    const matchedComp = allowedComponents.find((c) => c.id === componentId);

    const title =
      typeof seg.title === 'string' && seg.title.trim()
        ? seg.title.trim().slice(0, 80)
        : matchedComp?.name ?? `Step ${segments.length + 1}`;

    const rawCam =
      typeof seg.cameraAction === 'string' ? seg.cameraAction.trim().toLowerCase() : '';
    const cameraAction: LessonCameraAction = VALID_CAMERA_ACTIONS.has(
      rawCam as LessonCameraAction,
    )
      ? (rawCam as LessonCameraAction)
      : segments.length === 0
        ? 'overview'
        : 'focus-component';

    const rawHighlight =
      typeof seg.highlightAction === 'string'
        ? seg.highlightAction.trim().toLowerCase()
        : '';
    const highlightAction: LessonHighlightAction = VALID_HIGHLIGHT_ACTIONS.has(
      rawHighlight as LessonHighlightAction,
    )
      ? (rawHighlight as LessonHighlightAction)
      : 'highlight';

    const rawAnim =
      typeof seg.animationAction === 'string'
        ? seg.animationAction.trim().toLowerCase()
        : '';
    const animationAction: LessonAnimationAction = VALID_ANIMATION_ACTIONS.has(
      rawAnim as LessonAnimationAction,
    )
      ? (rawAnim as LessonAnimationAction)
      : 'play';

    const id =
      typeof seg.id === 'string' && seg.id.trim()
        ? seg.id.trim().slice(0, 48)
        : `seg-${segments.length + 1}`;

    const sequenceId =
      typeof seg.sequenceId === 'string' && seg.sequenceId.trim()
        ? seg.sequenceId.trim().slice(0, 64)
        : undefined;

    const seekProgress =
      typeof seg.seekProgress === 'number' && Number.isFinite(seg.seekProgress)
        ? Math.max(0, Math.min(1, Number(seg.seekProgress.toFixed(3))))
        : undefined;

    segments.push({
      id,
      title,
      spokenText,
      captionText,
      componentId,
      cameraAction,
      highlightAction,
      animationAction,
      ...(sequenceId ? { sequenceId } : {}),
      ...(seekProgress !== undefined ? { seekProgress } : {}),
    });
  }

  if (segments.length < minSegmentsRequired) {
    return {
      ok: false,
      error: 'Gemini voice lesson did not contain enough valid synchronized segments.',
    };
  }

  return {
    ok: true,
    value: {
      lessonTitle,
      systemTitle,
      difficulty: requestedDifficulty,
      personality: requestedPersonality,
      introSummary,
      segments,
    },
  };
}

/**
 * Validates and sanitizes an incoming /api/tutor/tts request payload.
 */
export function validateTeachTtsRequest(
  payload: unknown,
): { ok: true; value: Required<TeachTtsRequest> } | { ok: false; error: string } {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'TTS request body must be a JSON object.' };
  }
  const raw = payload as Record<string, unknown>;
  const rawText = typeof raw.text === 'string' ? sanitizeSpokenText(raw.text) : '';
  if (!rawText) {
    return { ok: false, error: 'Spoken text is required for audio synthesis.' };
  }

  const text = rawText.slice(0, APP_CONFIG.voiceTutorConfig.maxTtsChars);
  const voiceName = normalizeGeminiVoiceName(raw.voiceName);
  const personality = normalizePersonality(raw.personality);
  const difficulty = normalizeDifficulty(raw.difficulty);

  if (!VALID_GEMINI_VOICES.has(voiceName)) {
    return { ok: false, error: 'Unsupported Gemini TTS voice requested.' };
  }

  return {
    ok: true,
    value: {
      text,
      voiceName,
      personality,
      difficulty,
    },
  };
}

/**
 * Validates the JSON response returned by POST /api/tutor/tts.
 */
export function validateTeachTtsResponse(
  payload: unknown,
): { ok: true; value: TeachTtsResponse } | { ok: false; error: string } {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'TTS response must be a JSON object.' };
  }
  const obj = payload as Record<string, unknown>;
  const audioBase64 = typeof obj.audioBase64 === 'string' ? obj.audioBase64.trim() : '';
  if (!audioBase64 || audioBase64.length < 32) {
    return { ok: false, error: 'TTS response did not include valid audio data.' };
  }
  const mimeType =
    typeof obj.mimeType === 'string' && obj.mimeType.trim().startsWith('audio/')
      ? obj.mimeType.trim()
      : 'audio/wav';
  const voiceName = normalizeGeminiVoiceName(obj.voiceName);

  return {
    ok: true,
    value: {
      audioBase64,
      mimeType,
      voiceName,
    },
  };
}
