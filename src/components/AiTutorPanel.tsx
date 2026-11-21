import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import {
  Loader2,
  Maximize2,
  MessageSquare,
  Minimize2,
  Send,
  X,
} from 'lucide-react';
import type { EngineStageInfo, StudyModule } from '../data/jetPropulsionContent';
import type { VoiceLessonPlayerState } from '../hooks/useVoiceLessonPlayer';
import type {
  CapturedScreenRegion,
  GeminiTutorStructuredResponse,
  ScreenAnalyzeStructuredResponse,
  SelectedPdfExcerpt,
} from '../types/tutor';
import { VoiceTutorBar } from './VoiceTutorBar';

export interface TutorMessage {
  readonly id: string;
  readonly role: 'tutor' | 'student';
  readonly text: string;
  readonly contextLabel?: string;
  readonly excerptPreview?: string;
  readonly imagePreviewUrl?: string;
  readonly structured?: GeminiTutorStructuredResponse | ScreenAnalyzeStructuredResponse;
  readonly isError?: boolean;
}

function isScreenAnalysisResponse(
  res: GeminiTutorStructuredResponse | ScreenAnalyzeStructuredResponse,
): res is ScreenAnalyzeStructuredResponse {
  return 'confidenceLevel' in res;
}

interface AiTutorPanelProps {
  studyModule: StudyModule;
  selectedStage: EngineStageInfo;
  activeGeneratedSystemTitle?: string | null;
  activeGeneratedComponentName?: string | null;
  activeModelTitle: string;
  activeDocumentTitle: string;
  messages: readonly TutorMessage[];
  pinnedExcerpt: SelectedPdfExcerpt | null;
  pinnedScreenCapture: CapturedScreenRegion | null;
  isLoading: boolean;
  isExpanded: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  voicePlayer: VoiceLessonPlayerState;
  onTeachMe: () => void;
  onClearExcerpt: () => void;
  onClearScreenCapture: () => void;
  onSendQuestion: (question: string) => void;
  onToggleExpand: () => void;
}

/**
 * Panel 3: Gemini AI Tutor.
 * Connects highlighted PDF excerpts, captured screen regions, and student questions
 * to the server-side Gemini endpoints and renders structured educational explanations.
 */
export function AiTutorPanel({
  studyModule,
  selectedStage,
  activeGeneratedSystemTitle,
  activeGeneratedComponentName,
  activeModelTitle,
  activeDocumentTitle,
  messages,
  pinnedExcerpt,
  pinnedScreenCapture,
  isLoading,
  isExpanded,
  inputRef,
  voicePlayer,
  onTeachMe,
  onClearExcerpt,
  onClearScreenCapture,
  onSendQuestion,
  onToggleExpand,
}: AiTutorPanelProps) {
  const [draft, setDraft] = useState('');
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = logContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, isLoading]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || isLoading) {
      return;
    }
    onSendQuestion(trimmed);
    setDraft('');
  };

  const activeFocusTitle = activeGeneratedSystemTitle
    ? activeGeneratedComponentName
      ? `${activeGeneratedSystemTitle} · ${activeGeneratedComponentName}`
      : activeGeneratedSystemTitle
    : selectedStage.name;

  return (
    <section
      aria-label="Gemini AI Tutor"
      data-testid="panel-tutor"
      className="flex flex-col h-full min-h-0 bg-[#0E131F] border border-slate-800 rounded-lg overflow-hidden"
    >
      {/* Panel Header */}
      <div className="h-11 shrink-0 px-4 border-b border-slate-800 bg-[#111827] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <MessageSquare className="w-4 h-4 text-cyan-400 shrink-0" aria-hidden="true" />
          <h2 className="font-display text-sm font-semibold text-slate-100 whitespace-nowrap">
            Gemini AI Tutor
          </h2>
          <span aria-hidden="true" className="text-slate-600 text-xs hidden sm:inline">
            ·
          </span>
          <span className="text-xs text-slate-400 truncate hidden sm:inline">
            {activeFocusTitle}
          </span>
        </div>

        <button
          type="button"
          onClick={onToggleExpand}
          aria-label={isExpanded ? 'Restore Gemini AI Tutor' : 'Expand Gemini AI Tutor'}
          title={isExpanded ? 'Restore panel layout' : 'Expand Gemini AI Tutor'}
          className="hidden lg:inline-flex p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded transition-colors duration-150 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
        >
          {isExpanded ? (
            <Minimize2 className="w-4 h-4" aria-hidden="true" />
          ) : (
            <Maximize2 className="w-4 h-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Active Study Context Strip */}
      <div className="shrink-0 px-4 py-2 border-b border-slate-800/80 bg-[#0C101B] flex items-center justify-between gap-2 text-xs text-slate-400">
        <span className="truncate" title={activeDocumentTitle}>
          Source:{' '}
          {pinnedScreenCapture
            ? `${pinnedScreenCapture.sourceLabel} (${pinnedScreenCapture.width}×${pinnedScreenCapture.height})`
            : activeDocumentTitle}
        </span>
        <span className="text-[11px] text-slate-500 shrink-0 truncate max-w-[140px]">
          {activeGeneratedSystemTitle
            ? activeGeneratedComponentName ?? 'AI 3D Scene'
            : selectedStage.stationCode}
        </span>
      </div>

      {/* AI Voice Tutor Controls */}
      <VoiceTutorBar
        player={voicePlayer}
        activeModelTitle={activeModelTitle}
        onTeachMe={onTeachMe}
      />

      {/* Conversation Thread */}
      <div
        ref={logContainerRef}
        role="log"
        aria-live="polite"
        aria-label="Tutor conversation"
        className="flex-1 min-h-0 overflow-y-auto studio-scroll p-3.5 space-y-3 bg-[#090D16]"
      >
        {messages.map((msg) => {
          const isStudent = msg.role === 'student';
          const screenMeta =
            msg.structured && isScreenAnalysisResponse(msg.structured)
              ? msg.structured
              : null;

          return (
            <div
              key={msg.id}
              className={`rounded-md p-3.5 text-sm leading-relaxed border ${
                msg.isError
                  ? 'bg-rose-950/35 border-rose-500/40 text-rose-100'
                  : isStudent
                    ? 'bg-[#121D31] border-cyan-500/30 text-slate-100 ml-3'
                    : 'bg-[#101624] border-slate-800 text-slate-200 mr-1'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span
                  className={`text-xs font-semibold ${
                    msg.isError
                      ? 'text-rose-300'
                      : isStudent
                        ? 'text-cyan-300'
                        : 'text-slate-300'
                  }`}
                >
                  {isStudent ? 'Student' : 'Gemini AI Tutor'}
                </span>
                {msg.contextLabel && (
                  <span className="text-[11px] font-mono text-slate-500 truncate max-w-[180px]">
                    {msg.contextLabel}
                  </span>
                )}
              </div>

              {msg.excerptPreview && (
                <blockquote className="mb-2 px-2.5 py-1.5 rounded bg-[#0A101D] border border-slate-700/80 text-xs text-slate-300 italic">
                  “{msg.excerptPreview}”
                </blockquote>
              )}

              {msg.imagePreviewUrl && (
                <div className="mb-2 bg-[#070B13] border border-slate-700/80 rounded p-1.5">
                  <img
                    src={msg.imagePreviewUrl}
                    alt="Captured screen region sent to Gemini"
                    className="max-h-28 w-auto mx-auto object-contain rounded-sm"
                  />
                </div>
              )}

              {msg.structured ? (
                <div className="space-y-3 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-mono text-cyan-400">
                        Main Concept
                      </p>
                      <h3 className="font-display text-sm font-semibold text-slate-100">
                        {msg.structured.mainConcept}
                      </h3>
                    </div>
                    {screenMeta && (
                      <span className="text-[11px] font-mono text-slate-400">
                        Confidence: {screenMeta.confidenceLevel}
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-line">
                    {msg.structured.explanation}
                  </p>

                  {msg.structured.componentsAndRelationships.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-slate-300">
                        Components & Relationships
                      </p>
                      <ul className="space-y-1 text-xs text-slate-300">
                        {msg.structured.componentsAndRelationships.map((item) => (
                          <li key={item} className="flex items-start gap-2">
                            <span aria-hidden="true" className="text-cyan-400">
                              ·
                            </span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {screenMeta && screenMeta.scientificPrinciples.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-slate-300">
                        Scientific & Technical Principles
                      </p>
                      <ul className="space-y-1 text-xs text-slate-300">
                        {screenMeta.scientificPrinciples.map((principle) => (
                          <li key={principle} className="flex items-start gap-2">
                            <span aria-hidden="true" className="text-amber-400">
                              ·
                            </span>
                            <span>{principle}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-800/80 space-y-1 text-xs">
                    <p className="text-slate-400">
                      <span className="text-slate-300 font-medium">
                        Recommended visualization:{' '}
                      </span>
                      {msg.structured.recommendedVisualization}
                    </p>
                    {screenMeta && screenMeta.uncertaintyNote && (
                      <p className="text-slate-400">
                        <span className="text-slate-300 font-medium">
                          Visual note:{' '}
                        </span>
                        {screenMeta.uncertaintyNote}
                      </p>
                    )}
                    <p
                      className={
                        msg.structured.visualizationSupported ||
                        (msg.structured.assetRetrievalPlan &&
                          msg.structured.assetRetrievalPlan.matchedAssetId !== 'none') ||
                        msg.structured.generatedScene3D?.feasible
                          ? 'text-cyan-300 font-medium'
                          : 'text-amber-300 font-medium'
                      }
                    >
                      {msg.structured.visualizationSupported
                        ? `Turbofan 3D updated: focused on ${msg.structured.supportedVisualizationComponent} (${msg.structured.recommendedLayerMode} view)`
                        : msg.structured.assetRetrievalPlan &&
                            msg.structured.assetRetrievalPlan.matchedAssetId !== 'none'
                          ? msg.structured.assetRetrievalPlan.openIllustrativeSubsystemId
                            ? `Opened illustrative subsystem: ${msg.structured.assetRetrievalPlan.openIllustrativeSubsystemId} (${msg.structured.assetRetrievalPlan.conceptualOnlyNotice ?? 'conceptual detail view'})`
                            : `Loaded 3D asset: ${msg.structured.assetRetrievalPlan.matchedAssetId}${
                                msg.structured.assetRetrievalPlan.focusPartId
                                  ? ` · focused on ${msg.structured.assetRetrievalPlan.focusPartId}`
                                  : ` (${msg.structured.assetRetrievalPlan.requestedLevel})`
                              }`
                          : msg.structured.generatedScene3D?.feasible
                            ? `Interactive conceptual 3D generated: ${msg.structured.generatedScene3D.systemTitle} (${msg.structured.generatedScene3D.components.length} components)`
                            : msg.structured.generatedScene3D &&
                                !msg.structured.generatedScene3D.feasible
                              ? `3D modeling skipped: ${msg.structured.generatedScene3D.infeasibilityReason ?? 'non-spatial topic'}`
                              : msg.structured.diagramData
                                ? 'Displaying structured 2D component diagram.'
                                : 'Interactive 3D model unavailable for this topic.'}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm leading-relaxed text-slate-200">{msg.text}</p>
              )}
            </div>
          );
        })}

        {isLoading && (
          <div
            data-testid="tutor-loading"
            className="rounded-md p-3.5 bg-[#101624] border border-slate-800 text-xs text-slate-300 flex items-center gap-2.5"
          >
            <Loader2 className="w-4 h-4 text-cyan-400 animate-spin shrink-0" aria-hidden="true" />
            <span>Analyzing material and preparing visual explanation...</span>
          </div>
        )}
      </div>

      {/* Starter Prompts, Pinned Context & Input Form */}
      <div className="shrink-0 border-t border-slate-800 bg-[#0C101B] p-3 space-y-2.5">
        {pinnedExcerpt && (
          <div
            data-testid="pinned-excerpt-card"
            className="bg-[#101B2D] border border-cyan-500/40 rounded-md p-2.5 space-y-1"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-mono text-cyan-300">
                Highlighted excerpt · Page {pinnedExcerpt.pageNumber}
              </span>
              <button
                type="button"
                onClick={onClearExcerpt}
                aria-label="Remove highlighted excerpt"
                className="p-0.5 text-slate-400 hover:text-slate-100 rounded"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
            <p className="text-xs text-slate-200 line-clamp-2 italic">
              “{pinnedExcerpt.text}”
            </p>
          </div>
        )}

        {!pinnedExcerpt && pinnedScreenCapture && (
          <div
            data-testid="pinned-screen-card"
            className="bg-[#101B2D] border border-cyan-500/40 rounded-md p-2 flex items-center justify-between gap-2.5"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src={pinnedScreenCapture.dataUrl}
                alt="Pinned captured screen context"
                className="h-9 w-14 object-cover rounded border border-slate-700 shrink-0"
              />
              <div className="min-w-0">
                <p className="text-[11px] font-mono text-cyan-300 truncate">
                  Screen capture active ({pinnedScreenCapture.width}×{pinnedScreenCapture.height})
                </p>
                <p className="text-[11px] text-slate-400 truncate">
                  Ask follow-up questions without re-sharing
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClearScreenCapture}
              aria-label="Clear captured screen context"
              className="p-1 text-slate-400 hover:text-slate-100 rounded shrink-0"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        )}

        {!pinnedExcerpt && !pinnedScreenCapture && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-slate-400">
              Suggested questions
            </p>
            <div className="flex flex-wrap gap-1.5">
              {studyModule.starterQuestions.map((question) => (
                <button
                  key={question}
                  type="button"
                  disabled={isLoading}
                  onClick={() => onSendQuestion(question)}
                  className="text-left text-xs text-slate-300 hover:text-cyan-200 disabled:opacity-50 bg-[#111827] hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/40 rounded px-2.5 py-1.5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <label htmlFor="tutor-prompt-input" className="sr-only">
            Ask the Gemini AI Tutor
          </label>
          <input
            ref={inputRef}
            id="tutor-prompt-input"
            type="text"
            value={draft}
            disabled={isLoading}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              pinnedExcerpt
                ? 'Ask a question about the highlighted text...'
                : pinnedScreenCapture
                  ? 'Ask a follow-up or say "Visualize this in 3D"...'
                  : activeGeneratedSystemTitle
                    ? `Ask about ${activeGeneratedComponentName ?? activeGeneratedSystemTitle}...`
                    : `Ask about ${selectedStage.name.toLowerCase()} or "Visualize [concept] in 3D"...`
            }
            className="flex-1 min-w-0 bg-[#080B12] border border-slate-700/80 rounded-md px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!draft.trim() || isLoading}
            aria-label="Send question"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 disabled:bg-slate-800 disabled:text-slate-500 rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <Send className="w-3.5 h-3.5" aria-hidden="true" />
            Ask
          </button>
        </form>
      </div>
    </section>
  );
}
