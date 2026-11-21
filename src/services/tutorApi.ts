import { APP_CONFIG } from '../config/appConfig';
import { getPreparedShowcaseLesson } from '../data/preparedShowcaseLessons';
import type {
  GeminiTutorStructuredResponse,
  ScreenAnalyzeRequest,
  ScreenAnalyzeStructuredResponse,
  TeachLessonRequest,
  TeachLessonResponse,
  TeachTtsRequest,
  TeachTtsResponse,
  TutorAskRequest,
} from '../types/tutor';
import {
  validateGeminiTutorResponse,
  validateScreenAnalyzeResponse,
} from '../utils/tutorValidation';
import {
  validateTeachLessonResponse,
  validateTeachTtsResponse,
} from '../utils/voiceLessonValidation';

const MAX_CLIENT_LESSON_CACHE = 24;
const clientLessonCache = new Map<string, TeachLessonResponse>();
const teachRequestInFlight = new Map<string, Promise<TeachLessonResponse>>();

function buildClientTeachCacheKey(payload: TeachLessonRequest): string {
  const imgSig = payload.screenImageBase64
    ? `${payload.screenImageBase64.length}:${payload.screenImageBase64.slice(0, 24)}`
    : '';
  return JSON.stringify({
    sceneKind: payload.sceneKind,
    systemId: payload.systemId,
    systemTitle: payload.systemTitle,
    selectedComponentId: payload.selectedComponentId ?? '',
    difficulty: payload.difficulty,
    personality: payload.personality,
    segmentMode: payload.segmentMode ?? 'full',
    question: payload.question ?? '',
    highlightedText: payload.highlightedText ?? '',
    pageNumber: payload.pageNumber ?? 0,
    imgSig,
  });
}

async function readErrorMessage(response: Response): Promise<string> {
  const data: unknown = await response.json().catch(() => null);
  if (
    data &&
    typeof data === 'object' &&
    'error' in data &&
    typeof (data as { error?: unknown }).error === 'string'
  ) {
    return (data as { error: string }).error;
  }
  return `Server returned status ${response.status}`;
}

/**
 * Sends a student question (with optional highlighted PDF text and page context)
 * to the server-side Gemini endpoint and validates the structured JSON response.
 */
export async function askGeminiTutor(
  payload: TutorAskRequest,
): Promise<GeminiTutorStructuredResponse> {
  const response = await fetch('/api/tutor/ask', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const data: unknown = await response.json().catch(() => null);
  const validated = validateGeminiTutorResponse(data);
  if (!validated.ok) {
    throw new Error(validated.error);
  }

  return validated.value;
}

/**
 * Sends a cropped screen capture and student question to the server-side
 * multimodal Gemini endpoint and validates the structured JSON response.
 */
export async function analyzeScreenRegion(
  payload: ScreenAnalyzeRequest,
): Promise<ScreenAnalyzeStructuredResponse> {
  const response = await fetch('/api/tutor/screen', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const data: unknown = await response.json().catch(() => null);
  const validated = validateScreenAnalyzeResponse(data);
  if (!validated.ok) {
    throw new Error(validated.error);
  }

  return validated.value;
}

/**
 * Generates an adaptive, 3D-synchronized guided voice lesson from Gemini
 * for whichever 3D model is currently displayed on stage, using client LRU
 * caching and single-flight request deduplication.
 */
export async function requestTeachLesson(
  payload: TeachLessonRequest,
  signal?: AbortSignal,
): Promise<TeachLessonResponse> {
  const prepared = getPreparedShowcaseLesson(payload);
  if (prepared) {
    return prepared;
  }

  const key = buildClientTeachCacheKey(payload);
  const cached = clientLessonCache.get(key);
  if (cached) {
    clientLessonCache.delete(key);
    clientLessonCache.set(key, cached);
    return { ...cached, cached: true };
  }

  const existing = teachRequestInFlight.get(key);
  if (existing && !signal) {
    return existing;
  }

  const isFirstOnly = payload.segmentMode === 'first-only';
  const minSegmentsRequired = isFirstOnly
    ? 1
    : APP_CONFIG.voiceTutorConfig.minSegments;

  const promise = (async () => {
    const response = await fetch('/api/tutor/teach', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    const data: unknown = await response.json().catch(() => null);
    const validated = validateTeachLessonResponse(
      data,
      payload.components,
      payload.difficulty,
      payload.personality,
      payload.systemTitle,
      minSegmentsRequired,
    );
    if (!validated.ok) {
      throw new Error(validated.error);
    }

    const result: TeachLessonResponse = {
      ...validated.value,
      isPartialFirstSegment:
        typeof (data as { isPartialFirstSegment?: unknown })?.isPartialFirstSegment === 'boolean'
          ? Boolean((data as { isPartialFirstSegment?: boolean }).isPartialFirstSegment)
          : isFirstOnly,
      cached: Boolean((data as { cached?: unknown })?.cached),
      latencyMs:
        typeof (data as { latencyMs?: unknown })?.latencyMs === 'number'
          ? (data as { latencyMs: number }).latencyMs
          : undefined,
    };

    clientLessonCache.set(key, result);
    while (clientLessonCache.size > MAX_CLIENT_LESSON_CACHE) {
      const oldest = clientLessonCache.keys().next().value;
      if (!oldest) break;
      clientLessonCache.delete(oldest);
    }
    return result;
  })();

  if (!signal) {
    teachRequestInFlight.set(key, promise);
  }
  try {
    return await promise;
  } finally {
    teachRequestInFlight.delete(key);
  }
}

/**
 * Synthesizes natural neural speech audio (WAV) for a lesson segment via Gemini TTS.
 */
export async function requestTeachTtsAudio(
  payload: TeachTtsRequest,
  signal?: AbortSignal,
): Promise<TeachTtsResponse> {
  const response = await fetch('/api/tutor/tts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const data: unknown = await response.json().catch(() => null);
  const validated = validateTeachTtsResponse(data);
  if (!validated.ok) {
    throw new Error(validated.error);
  }

  return validated.value;
}

export interface AppHealthInfo {
  readonly status: string;
  readonly geminiConfigured: boolean;
  readonly appUrl: string | null;
}

/**
 * Queries server health and optional APP_URL for standalone launch links.
 */
export async function fetchRuntimeHealth(): Promise<AppHealthInfo | null> {
  try {
    const response = await fetch('/api/health');
    if (!response.ok) return null;
    const data: unknown = await response.json().catch(() => null);
    if (!data || typeof data !== 'object') return null;
    const obj = data as Record<string, unknown>;
    return {
      status: typeof obj.status === 'string' ? obj.status : 'ok',
      geminiConfigured: Boolean(obj.geminiConfigured),
      appUrl: typeof obj.appUrl === 'string' ? obj.appUrl : null,
    };
  } catch {
    return null;
  }
}
