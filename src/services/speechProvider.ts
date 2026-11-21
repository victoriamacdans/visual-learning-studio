import {
  APP_CONFIG,
  GEMINI_TTS_VOICES,
  type ExplanationDifficulty,
  type NarratorPersonality,
} from '../config/appConfig';
import { requestTeachTtsAudio } from './tutorApi';

export interface SpeechVoiceOption {
  readonly id: string;
  readonly name: string;
  readonly lang: string;
  readonly isDefault: boolean;
}

export interface SpeechStyleContext {
  readonly personality: NarratorPersonality;
  readonly difficulty: ExplanationDifficulty;
}

export interface SpeechSpeakOptions {
  readonly voiceId?: string;
  readonly rate?: number;
  readonly pitch?: number;
  readonly styleContext?: SpeechStyleContext;
}

export interface SpeechUtteranceCallbacks {
  readonly onBufferingChange?: (buffering: boolean) => void;
  readonly onStart?: () => void;
  readonly onEnd?: () => void;
  readonly onError?: (message: string) => void;
}

/**
 * Swappable SpeechProvider abstraction for Voice Tutor narration.
 * Keeps the lesson player and 3D stage decoupled from the underlying audio engine.
 */
export interface SpeechProvider {
  readonly kind: 'browser-speech-synthesis' | 'gemini-tts';
  isSupported(): boolean;
  getVoices(): SpeechVoiceOption[];
  subscribeVoicesChanged(listener: () => void): () => void;
  preload?(text: string, options: SpeechSpeakOptions): Promise<void>;
  speak(
    text: string,
    options: SpeechSpeakOptions,
    callbacks: SpeechUtteranceCallbacks,
  ): void;
  pause(): void;
  resume(): void;
  stop(): void;
  unlock(): void;
  dispose?(): void;
}

// 1-sample silent PCM WAV used to authorize HTMLAudioElement playback inside click gestures
const SILENT_WAV_DATA_URI =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

const MAX_CACHED_AUDIO_CLIPS = 48;
const MAX_CONCURRENT_PRELOADS = 2;

function base64ToBlobUrl(base64: string, mimeType: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType || 'audio/wav' });
  return URL.createObjectURL(blob);
}

/**
 * Gemini Neural TTS SpeechProvider backed by server-side gemini-3.8-flash-lite-tts.
 * Synthesizes expressive WAV clips per segment, supports bounded-concurrency background
 * preloading with in-flight deduplication, and preserves a single gesture-unlocked HTMLAudioElement.
 */
export function createGeminiTtsSpeechProvider(): SpeechProvider {
  const audioEl: HTMLAudioElement | null =
    typeof window !== 'undefined' && typeof Audio !== 'undefined'
      ? new Audio()
      : null;

  let activeSessionToken = 0;
  let gestureUnlocked = false;
  let isPausedDuringBuffer = false;
  let activePreloads = 0;
  const preloadQueue: Array<() => void> = [];

  const inFlightCache = new Map<string, Promise<string>>();
  const resolvedUrlCache = new Map<string, string>();

  const buildCacheKey = (text: string, options: SpeechSpeakOptions): string => {
    const voice = options.voiceId || APP_CONFIG.voiceTutorConfig.defaultVoiceName;
    const personality =
      options.styleContext?.personality ?? APP_CONFIG.voiceTutorConfig.defaultPersonality;
    const difficulty =
      options.styleContext?.difficulty ?? APP_CONFIG.voiceTutorConfig.defaultDifficulty;
    return `${voice}::${personality}::${difficulty}::${text.trim()}`;
  };

  const evictOldestIfNeeded = () => {
    while (resolvedUrlCache.size > MAX_CACHED_AUDIO_CLIPS) {
      const oldestKey = resolvedUrlCache.keys().next().value;
      if (!oldestKey) break;
      const oldUrl = resolvedUrlCache.get(oldestKey);
      resolvedUrlCache.delete(oldestKey);
      inFlightCache.delete(oldestKey);
      if (oldUrl) {
        URL.revokeObjectURL(oldUrl);
      }
    }
  };

  const getOrFetchAudioUrl = (
    text: string,
    options: SpeechSpeakOptions,
  ): Promise<string> => {
    const trimmed = text.trim();
    const key = buildCacheKey(trimmed, options);

    const cachedUrl = resolvedUrlCache.get(key);
    if (cachedUrl) {
      // Refresh LRU entry
      resolvedUrlCache.delete(key);
      resolvedUrlCache.set(key, cachedUrl);
      return Promise.resolve(cachedUrl);
    }

    const existingPromise = inFlightCache.get(key);
    if (existingPromise) {
      return existingPromise;
    }

    const fetchPromise = requestTeachTtsAudio({
      text: trimmed,
      voiceName: (options.voiceId ||
        APP_CONFIG.voiceTutorConfig.defaultVoiceName) as typeof APP_CONFIG.voiceTutorConfig.defaultVoiceName,
      personality:
        options.styleContext?.personality ??
        APP_CONFIG.voiceTutorConfig.defaultPersonality,
      difficulty:
        options.styleContext?.difficulty ??
        APP_CONFIG.voiceTutorConfig.defaultDifficulty,
    })
      .then((res) => {
        const blobUrl = base64ToBlobUrl(res.audioBase64, res.mimeType);
        resolvedUrlCache.set(key, blobUrl);
        evictOldestIfNeeded();
        return blobUrl;
      })
      .catch((err) => {
        // Allow future retries after transient failure
        inFlightCache.delete(key);
        throw err;
      });

    inFlightCache.set(key, fetchPromise);
    return fetchPromise;
  };

  const resetAudioElementHandlers = () => {
    if (!audioEl) return;
    audioEl.onplay = null;
    audioEl.onended = null;
    audioEl.onerror = null;
  };

  const drainPreloadQueue = () => {
    while (activePreloads < MAX_CONCURRENT_PRELOADS && preloadQueue.length > 0) {
      const nextTask = preloadQueue.shift();
      nextTask?.();
    }
  };

  return {
    kind: 'gemini-tts',

    isSupported(): boolean {
      return audioEl !== null;
    },

    getVoices(): SpeechVoiceOption[] {
      return GEMINI_TTS_VOICES.map((voice) => ({
        id: voice.id,
        name: voice.label,
        lang: 'en-US',
        isDefault: voice.id === APP_CONFIG.voiceTutorConfig.defaultVoiceName,
      }));
    },

    subscribeVoicesChanged(): () => void {
      return () => {};
    },

    unlock(): void {
      if (!audioEl || gestureUnlocked) return;
      try {
        // Only unlock silently when nothing is actively loaded/playing
        if (audioEl.paused && !audioEl.currentSrc) {
          audioEl.muted = true;
          audioEl.src = SILENT_WAV_DATA_URI;
          void audioEl
            .play()
            .then(() => {
              gestureUnlocked = true;
              if (audioEl.src === SILENT_WAV_DATA_URI) {
                audioEl.pause();
                audioEl.removeAttribute('src');
              }
              audioEl.muted = false;
            })
            .catch(() => {
              audioEl.muted = false;
            });
        } else {
          gestureUnlocked = true;
        }
      } catch {
        audioEl.muted = false;
      }
    },

    async preload(text: string, options: SpeechSpeakOptions): Promise<void> {
      const trimmed = text.trim();
      if (!trimmed || !audioEl) return;
      const key = buildCacheKey(trimmed, options);
      if (resolvedUrlCache.has(key) || inFlightCache.has(key)) return;

      await new Promise<void>((resolve) => {
        const run = () => {
          activePreloads += 1;
          void getOrFetchAudioUrl(trimmed, options)
            .catch(() => {
              // Background preload errors are intentionally silent
            })
            .finally(() => {
              activePreloads = Math.max(0, activePreloads - 1);
              drainPreloadQueue();
              resolve();
            });
        };
        if (activePreloads < MAX_CONCURRENT_PRELOADS) {
          run();
        } else {
          preloadQueue.push(run);
        }
      });
    },

    speak(
      text: string,
      options: SpeechSpeakOptions,
      callbacks: SpeechUtteranceCallbacks,
    ): void {
      if (!audioEl) {
        callbacks.onError?.('Audio playback is unavailable in this browser.');
        return;
      }

      const trimmed = text.trim();
      if (!trimmed) {
        callbacks.onEnd?.();
        return;
      }

      activeSessionToken += 1;
      const sessionToken = activeSessionToken;
      isPausedDuringBuffer = false;

      resetAudioElementHandlers();
      if (!audioEl.paused) {
        audioEl.pause();
      }

      const key = buildCacheKey(trimmed, options);
      const isCached = resolvedUrlCache.has(key);
      if (!isCached) {
        callbacks.onBufferingChange?.(true);
      }

      void getOrFetchAudioUrl(trimmed, options)
        .then((blobUrl) => {
          if (sessionToken !== activeSessionToken) return;
          callbacks.onBufferingChange?.(false);

          let finished = false;
          let startedNotified = false;

          resetAudioElementHandlers();
          audioEl.muted = false;
          audioEl.playbackRate = options.rate ?? APP_CONFIG.voiceTutorConfig.defaultSpeechRate;
          audioEl.src = blobUrl;

          audioEl.onplay = () => {
            if (sessionToken !== activeSessionToken || startedNotified) return;
            startedNotified = true;
            callbacks.onStart?.();
          };

          audioEl.onended = () => {
            if (finished || sessionToken !== activeSessionToken) return;
            finished = true;
            resetAudioElementHandlers();
            callbacks.onEnd?.();
          };

          audioEl.onerror = () => {
            if (finished || sessionToken !== activeSessionToken) return;
            finished = true;
            resetAudioElementHandlers();
            callbacks.onError?.('Audio playback interrupted. Click Retry Audio to continue.');
          };

          if (isPausedDuringBuffer) {
            return;
          }

          void audioEl.play().catch((err: unknown) => {
            if (finished || sessionToken !== activeSessionToken) return;
            finished = true;
            resetAudioElementHandlers();
            const isAutoplayBlocked =
              err instanceof DOMException && err.name === 'NotAllowedError';
            callbacks.onError?.(
              isAutoplayBlocked
                ? 'Browser blocked automatic audio start. Click Play or Retry Audio to hear narration.'
                : 'Unable to play synthesized audio. Click Retry Audio to continue.',
            );
          });
        })
        .catch((err: unknown) => {
          if (sessionToken !== activeSessionToken) return;
          callbacks.onBufferingChange?.(false);
          const message =
            err instanceof Error
              ? err.message
              : 'Unable to synthesize lesson audio. Click Retry Audio to continue.';
          callbacks.onError?.(message);
        });
    },

    pause(): void {
      isPausedDuringBuffer = true;
      if (!audioEl) return;
      if (!audioEl.paused) {
        audioEl.pause();
      }
    },

    resume(): void {
      isPausedDuringBuffer = false;
      if (!audioEl) return;
      if (audioEl.src && audioEl.paused) {
        audioEl.muted = false;
        void audioEl.play().catch(() => {
          // Handled via player state if play cannot resume
        });
      }
    },

    stop(): void {
      activeSessionToken += 1;
      isPausedDuringBuffer = false;
      if (!audioEl) return;
      resetAudioElementHandlers();
      if (!audioEl.paused) {
        audioEl.pause();
      }
      try {
        audioEl.currentTime = 0;
      } catch {
        // Ignore if metadata not loaded
      }
      audioEl.removeAttribute('src');
      audioEl.load();
    },

    dispose(): void {
      this.stop();
      for (const blobUrl of resolvedUrlCache.values()) {
        URL.revokeObjectURL(blobUrl);
      }
      resolvedUrlCache.clear();
      inFlightCache.clear();
    },
  };
}

function getSpeechSynthesisApi(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null;
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    return null;
  }
  return window.speechSynthesis;
}

/**
 * Legacy browser SpeechSynthesis provider preserved for fallback or testing compatibility.
 */
export function createBrowserSpeechSynthesisProvider(): SpeechProvider {
  let activeUtterance: SpeechSynthesisUtterance | null = null;
  let activeSessionToken = 0;

  const mapVoices = (): SpeechVoiceOption[] => {
    const synth = getSpeechSynthesisApi();
    if (!synth) return [];
    const raw = synth.getVoices();
    const seen = new Set<string>();
    const mapped: SpeechVoiceOption[] = [];
    for (const v of raw) {
      const id = v.voiceURI || v.name;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      mapped.push({
        id,
        name: v.name,
        lang: v.lang,
        isDefault: Boolean(v.default),
      });
    }
    return mapped.sort((a, b) => {
      const aEn = a.lang.toLowerCase().startsWith('en') ? 0 : 1;
      const bEn = b.lang.toLowerCase().startsWith('en') ? 0 : 1;
      if (aEn !== bEn) return aEn - bEn;
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  };

  return {
    kind: 'browser-speech-synthesis',

    isSupported(): boolean {
      return getSpeechSynthesisApi() !== null;
    },

    getVoices(): SpeechVoiceOption[] {
      return mapVoices();
    },

    subscribeVoicesChanged(listener: () => void): () => void {
      const synth = getSpeechSynthesisApi();
      if (!synth) return () => {};
      const handler = () => listener();
      if (typeof synth.addEventListener === 'function') {
        synth.addEventListener('voiceschanged', handler);
        return () => synth.removeEventListener('voiceschanged', handler);
      }
      const prev = synth.onvoiceschanged;
      synth.onvoiceschanged = handler;
      return () => {
        if (synth.onvoiceschanged === handler) {
          synth.onvoiceschanged = prev ?? null;
        }
      };
    },

    unlock(): void {
      const synth = getSpeechSynthesisApi();
      if (!synth) return;
      try {
        if (synth.paused) {
          synth.resume();
        }
        if (synth.speaking || synth.pending) {
          synth.cancel();
        }
      } catch {
        // Ignore browser-specific unlock quirks
      }
    },

    speak(
      text: string,
      options: SpeechSpeakOptions,
      callbacks: SpeechUtteranceCallbacks,
    ): void {
      const synth = getSpeechSynthesisApi();
      if (!synth) {
        callbacks.onError?.('Browser speech synthesis is unavailable in this browser.');
        return;
      }

      const trimmed = text.trim();
      if (!trimmed) {
        callbacks.onEnd?.();
        return;
      }

      activeSessionToken += 1;
      const sessionToken = activeSessionToken;

      if (synth.speaking || synth.pending) {
        synth.cancel();
      }

      const utterance = new SpeechSynthesisUtterance(trimmed);
      utterance.rate = options.rate ?? APP_CONFIG.voiceTutorConfig.defaultSpeechRate;
      utterance.pitch = options.pitch ?? 1.0;

      if (options.voiceId) {
        const match = synth
          .getVoices()
          .find((v) => (v.voiceURI || v.name) === options.voiceId);
        if (match) {
          utterance.voice = match;
          utterance.lang = match.lang;
        }
      }

      let finished = false;

      utterance.onstart = () => {
        if (sessionToken !== activeSessionToken) return;
        callbacks.onStart?.();
      };

      utterance.onend = () => {
        if (finished || sessionToken !== activeSessionToken) return;
        finished = true;
        activeUtterance = null;
        callbacks.onEnd?.();
      };

      utterance.onerror = (event) => {
        if (finished || sessionToken !== activeSessionToken) return;
        finished = true;
        activeUtterance = null;
        const errCode = event.error;
        if (errCode === 'canceled' || errCode === 'interrupted') {
          return;
        }
        callbacks.onError?.(`Audio playback error (${errCode || 'unknown'}).`);
      };

      activeUtterance = utterance;
      if (synth.paused) {
        synth.resume();
      }
      synth.speak(utterance);
    },

    pause(): void {
      const synth = getSpeechSynthesisApi();
      if (!synth) return;
      if (synth.speaking && !synth.paused) {
        synth.pause();
      }
    },

    resume(): void {
      const synth = getSpeechSynthesisApi();
      if (!synth) return;
      if (synth.paused) {
        synth.resume();
      }
    },

    stop(): void {
      activeSessionToken += 1;
      const synth = getSpeechSynthesisApi();
      activeUtterance = null;
      if (!synth) return;
      if (synth.speaking || synth.pending || synth.paused) {
        synth.cancel();
      }
    },
  };
}
