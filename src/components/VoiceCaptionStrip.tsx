import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  EyeOff,
  Loader2,
  Pause,
  Play,
  Volume2,
} from 'lucide-react';
import type { TeachLessonSegment } from '../types/tutor';

export interface VoiceCaptionStripData {
  readonly stepNumber: number;
  readonly totalSteps: number;
  readonly componentLabel: string;
  readonly difficulty: string;
  readonly personality: string;
  readonly captionText: string;
  readonly isPlaying: boolean;
  readonly isBufferingAudio?: boolean;
  readonly segments?: readonly TeachLessonSegment[];
  readonly activeSegmentIndex?: number;
  readonly onTogglePlayPause?: () => void;
  readonly onJumpToSegment?: (index: number) => void;
  readonly onHideCaptions?: () => void;
}

/**
 * Dedicated non-overlay caption strip rendered OUTSIDE and directly below
 * the 3D canvas viewport so moving 3D parts are never obscured.
 */
export function VoiceCaptionStrip({ caption }: { caption: VoiceCaptionStripData | null }) {
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);

  if (!caption) {
    return null;
  }

  const hasMultipleSegments = Boolean(caption.segments && caption.segments.length > 0);

  return (
    <div
      data-testid="voice-stage-captions"
      aria-live="polite"
      className="shrink-0 bg-[#0A0F1B] border border-cyan-500/35 rounded-md px-3 py-2 space-y-1.5"
    >
      {/* Top status & compact controls row */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span className="inline-flex items-center gap-1 text-cyan-300 font-semibold whitespace-nowrap">
            {caption.isBufferingAudio ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-cyan-400" aria-hidden="true" />
                Preparing audio...
              </>
            ) : (
              <>
                <Volume2 className="w-3 h-3 text-cyan-400" aria-hidden="true" />
                {caption.isPlaying ? 'Speaking' : 'Paused'}
              </>
            )}
          </span>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <span className="text-slate-300 whitespace-nowrap">
            Step {caption.stepNumber}/{caption.totalSteps}
          </span>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <span className="text-cyan-200 truncate max-w-[200px] sm:max-w-[280px]">
            {caption.componentLabel}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] text-slate-400 capitalize hidden sm:inline">
            {caption.difficulty} · {caption.personality}
          </span>

          {caption.onTogglePlayPause && (
            <button
              type="button"
              data-testid="caption-play-pause-btn"
              onClick={caption.onTogglePlayPause}
              aria-label={caption.isPlaying ? 'Pause voice lesson' : 'Resume voice lesson'}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-sans font-medium text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              {caption.isPlaying ? (
                <>
                  <Pause className="w-3 h-3 text-cyan-400" aria-hidden="true" />
                  <span className="hidden sm:inline">Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 text-cyan-400" aria-hidden="true" />
                  <span className="hidden sm:inline">Play</span>
                </>
              )}
            </button>
          )}

          {hasMultipleSegments && (
            <button
              type="button"
              data-testid="caption-expand-btn"
              onClick={() => setIsTranscriptOpen((prev) => !prev)}
              aria-expanded={isTranscriptOpen}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-sans font-medium text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              {isTranscriptOpen ? (
                <>
                  <ChevronUp className="w-3 h-3" aria-hidden="true" />
                  Collapse
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" aria-hidden="true" />
                  Transcript
                </>
              )}
            </button>
          )}

          {caption.onHideCaptions && (
            <button
              type="button"
              data-testid="caption-hide-btn"
              onClick={caption.onHideCaptions}
              title="Hide captions"
              aria-label="Hide captions"
              className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-sans font-medium text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              <EyeOff className="w-3 h-3" aria-hidden="true" />
              <span className="hidden sm:inline">Hide</span>
            </button>
          )}
        </div>
      </div>

      {/* Compact 2-3 line active caption text */}
      <p
        data-testid="voice-caption-text"
        className={`text-xs text-slate-100 leading-relaxed ${
          isTranscriptOpen ? '' : 'line-clamp-2 sm:line-clamp-3'
        }`}
      >
        {caption.captionText}
      </p>

      {/* Optional expandable full transcript drawer */}
      {isTranscriptOpen && caption.segments && caption.segments.length > 0 && (
        <div
          data-testid="voice-transcript-drawer"
          className="pt-1.5 border-t border-slate-800/90 max-h-36 overflow-y-auto studio-scroll space-y-1.5"
        >
          {caption.segments.map((seg, idx) => {
            const isCurrent = idx === (caption.activeSegmentIndex ?? caption.stepNumber - 1);
            return (
              <button
                key={seg.id}
                type="button"
                onClick={() => caption.onJumpToSegment?.(idx)}
                className={`w-full text-left px-2 py-1 rounded border text-[11px] transition-colors ${
                  isCurrent
                    ? 'bg-cyan-500/12 border-cyan-500/45 text-slate-100'
                    : 'bg-[#080C15] border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <span className="font-mono font-semibold text-cyan-300 mr-1.5">
                  {idx + 1}. {seg.title}:
                </span>
                <span>{seg.captionText}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
