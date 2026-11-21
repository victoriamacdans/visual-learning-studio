import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Maximize2,
  Minimize2,
  Monitor,
  Sparkles,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { APP_CONFIG, type LearningInputMode } from '../config/appConfig';
import type { StudyModule } from '../data/jetPropulsionContent';
import type { CapturedScreenRegion, SelectedPdfExcerpt } from '../types/tutor';
import { clampPage } from '../utils/studioState';
import { computeBoundedOutputSize } from '../utils/screenCaptureMath';
import { buildSurroundingPageContext } from '../utils/tutorValidation';
import { PdfCanvasViewer } from './PdfCanvasViewer';
import { ScreenLearnPanel } from './ScreenLearnPanel';

export interface UploadedPdfState {
  readonly fileName: string;
  readonly data: Uint8Array;
  readonly numPages: number;
}

interface PdfViewerPanelProps {
  learningInputMode: LearningInputMode;
  onChangeLearningInputMode: (mode: LearningInputMode) => void;
  studyModule: StudyModule;
  pdfSourceMode: 'example' | 'uploaded';
  uploadedPdf: UploadedPdfState | null;
  currentPage: number;
  zoomPercent: number;
  isExpanded: boolean;
  onSelectSourceMode: (mode: 'example' | 'uploaded') => void;
  onUploadPdf: (fileName: string, data: Uint8Array) => void;
  onUploadedPdfLoaded: (numPages: number) => void;
  onPageChange: (nextPage: number) => void;
  onZoomChange: (direction: 'in' | 'out' | 'reset') => void;
  onToggleExpand: () => void;
  onAskGeminiWithSelection: (excerpt: SelectedPdfExcerpt) => void;
  capturedScreenRegion: CapturedScreenRegion | null;
  screenQuestion: string;
  isAnalyzingScreen: boolean;
  onChangeScreenQuestion: (value: string) => void;
  onCaptureScreenRegion: (region: CapturedScreenRegion | null) => void;
  onVisualizeScreen: (questionText: string) => void;
}

/**
 * Panel 1: Learning Materials panel supporting two input modes:
 * - PDF Learning (PDF.js uploaded PDFs + built-in jet propulsion notes + Highlight & Ask)
 * - Learn from Screen (getDisplayMedia capture + region crop + Visualize This)
 */
export function PdfViewerPanel({
  learningInputMode,
  onChangeLearningInputMode,
  studyModule,
  pdfSourceMode,
  uploadedPdf,
  currentPage,
  zoomPercent,
  isExpanded,
  onSelectSourceMode,
  onUploadPdf,
  onUploadedPdfLoaded,
  onPageChange,
  onZoomChange,
  onToggleExpand,
  onAskGeminiWithSelection,
  capturedScreenRegion,
  screenQuestion,
  isAnalyzingScreen,
  onChangeScreenQuestion,
  onCaptureScreenRegion,
  onVisualizeScreen,
}: PdfViewerPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const contentContainerRef = useRef<HTMLDivElement | null>(null);
  const pageTextsRef = useRef<Map<number, string>>(new Map());

  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [selectedText, setSelectedText] = useState('');

  const isUploadedMode = pdfSourceMode === 'uploaded' && uploadedPdf !== null;
  const totalPages = isUploadedMode
    ? Math.max(1, uploadedPdf.numPages)
    : studyModule.pages.length;
  const safePage = clampPage(currentPage, totalPages);
  const activeExamplePage = studyModule.pages[safePage - 1] ?? studyModule.pages[0];
  const scaleFactor = zoomPercent / 100;
  const activeDocumentTitle = isUploadedMode
    ? uploadedPdf.fileName
    : studyModule.documentTitle;

  const getActivePageFullText = useCallback((): string => {
    if (isUploadedMode) {
      return pageTextsRef.current.get(safePage) ?? '';
    }
    return [
      activeExamplePage.sectionTitle,
      activeExamplePage.summary,
      `${activeExamplePage.keyFormula.label}: ${activeExamplePage.keyFormula.expression} (${activeExamplePage.keyFormula.variables})`,
      ...activeExamplePage.keyTakeaways,
    ].join(' ');
  }, [isUploadedMode, safePage, activeExamplePage]);

  // Clear selection banner when switching pages, modules, or document mode
  useEffect(() => {
    setSelectedText('');
  }, [safePage, pdfSourceMode, studyModule.id, uploadedPdf?.fileName]);

  // Monitor browser text selection inside the PDF viewer viewport
  const checkSelection = useCallback(() => {
    const container = contentContainerRef.current;
    if (!container) {
      return;
    }
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      return;
    }
    const text = selection.toString().replace(/\s+/g, ' ').trim();
    if (text.length < 3) {
      return;
    }
    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;
    if (
      (anchorNode && container.contains(anchorNode)) ||
      (focusNode && container.contains(focusNode))
    ) {
      setSelectedText(text.slice(0, APP_CONFIG.aiTutorConfig.maxHighlightChars));
    }
  }, []);

  useEffect(() => {
    const handleSelectionChange = () => {
      const container = contentContainerRef.current;
      const selection = window.getSelection();
      if (!container || !selection || selection.isCollapsed) {
        return;
      }
      const text = selection.toString().replace(/\s+/g, ' ').trim();
      if (text.length >= 3) {
        const anchorNode = selection.anchorNode;
        if (anchorNode && container.contains(anchorNode)) {
          setSelectedText(text.slice(0, APP_CONFIG.aiTutorConfig.maxHighlightChars));
        }
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, []);

  const processPdfFile = async (file: File) => {
    setUploadError(null);
    const isPdfMime =
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdfMime) {
      setUploadError('Please select a valid .pdf file.');
      return;
    }
    if (file.size > APP_CONFIG.pdfDefaults.maxUploadBytes) {
      setUploadError('PDF exceeds the 25 MB upload limit.');
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      pageTextsRef.current.clear();
      onUploadPdf(file.name, new Uint8Array(buffer));
    } catch {
      setUploadError('Could not read the selected PDF file.');
    }
  };

  const handleFileInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await processPdfFile(file);
    }
    event.target.value = '';
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;

    if (
      file.type === 'image/png' ||
      file.type === 'image/jpeg' ||
      file.type === 'image/webp'
    ) {
      const reader = new FileReader();
      reader.onload = () => {
        const resultUrl = typeof reader.result === 'string' ? reader.result : '';
        if (!resultUrl) return;
        const img = new Image();
        img.onload = () => {
          const { width: outW, height: outH } = computeBoundedOutputSize(
            img.naturalWidth || 800,
            img.naturalHeight || 600,
            APP_CONFIG.screenCaptureDefaults.maxImageDimension,
          );
          const canvas = document.createElement('canvas');
          canvas.width = outW;
          canvas.height = outH;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.drawImage(img, 0, 0, outW, outH);
          const dataUrl = canvas.toDataURL(
            'image/jpeg',
            APP_CONFIG.screenCaptureDefaults.jpegQuality,
          );
          const idx = dataUrl.indexOf(';base64,');
          const base64 = idx !== -1 ? dataUrl.slice(idx + ';base64,'.length) : '';
          if (!base64) return;
          onChangeLearningInputMode('screen');
          onCaptureScreenRegion({
            dataUrl,
            base64,
            mimeType: 'image/jpeg',
            width: outW,
            height: outH,
            sourceLabel: file.name,
          });
        };
        img.src = resultUrl;
      };
      reader.readAsDataURL(file);
      return;
    }

    await processPdfFile(file);
  };

  const handlePageTextExtracted = useCallback(
    (pageNum: number, fullText: string) => {
      pageTextsRef.current.set(pageNum, fullText);
    },
    [],
  );

  const handleAskGeminiClick = () => {
    if (!selectedText) {
      return;
    }
    const fullPageText = getActivePageFullText();
    const pageContext = buildSurroundingPageContext(fullPageText, selectedText);
    onAskGeminiWithSelection({
      text: selectedText,
      pageContext,
      pageNumber: safePage,
      documentTitle: activeDocumentTitle,
    });
    setSelectedText('');
    window.getSelection()?.removeAllRanges();
  };

  return (
    <section
      aria-label="PDF Viewer"
      data-testid="panel-pdf"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragActive(true);
      }}
      onDragLeave={() => setIsDragActive(false)}
      onDrop={handleDrop}
      className="flex flex-col h-full min-h-0 bg-[#0E131F] border border-slate-800 rounded-lg overflow-hidden relative"
    >
      {/* Panel Header */}
      <div className="h-11 shrink-0 px-4 border-b border-slate-800 bg-[#111827] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {learningInputMode === 'screen' ? (
            <Monitor className="w-4 h-4 text-cyan-400 shrink-0" aria-hidden="true" />
          ) : (
            <FileText className="w-4 h-4 text-cyan-400 shrink-0" aria-hidden="true" />
          )}
          <h2 className="font-display text-sm font-semibold text-slate-100 whitespace-nowrap">
            {learningInputMode === 'screen' ? 'Learn from Screen' : 'PDF Viewer'}
          </h2>
          <span aria-hidden="true" className="text-slate-600 text-xs hidden sm:inline">
            ·
          </span>
          <span className="text-xs text-slate-400 truncate hidden sm:inline">
            {learningInputMode === 'screen'
              ? 'Screen Capture'
              : isUploadedMode
                ? 'Uploaded PDF'
                : studyModule.label}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <input
            ref={fileInputRef}
            id="pdf-upload-input"
            type="file"
            accept="application/pdf,.pdf"
            onChange={handleFileInputChange}
            className="sr-only"
          />
          {learningInputMode === 'pdf' && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/40 rounded transition-colors duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              Upload PDF
            </button>
          )}

          <button
            type="button"
            onClick={onToggleExpand}
            aria-label={isExpanded ? 'Restore PDF Viewer' : 'Expand PDF Viewer'}
            title={isExpanded ? 'Restore panel layout' : 'Expand Learning Materials'}
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

      {/* Input Mode Switcher: PDF Learning vs Learn from Screen */}
      <div
        role="tablist"
        aria-label="Learning material input mode"
        className="shrink-0 px-3 py-1.5 border-b border-slate-800/80 bg-[#0B101A] grid grid-cols-2 gap-1.5"
      >
        <button
          type="button"
          role="tab"
          data-testid="mode-pdf-learning"
          aria-selected={learningInputMode === 'pdf'}
          onClick={() => onChangeLearningInputMode('pdf')}
          className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded border transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
            learningInputMode === 'pdf'
              ? 'bg-cyan-500/15 border-cyan-500/45 text-cyan-200'
              : 'bg-[#080B12] border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-3.5 h-3.5" aria-hidden="true" />
          PDF Learning
        </button>
        <button
          type="button"
          role="tab"
          data-testid="mode-learn-from-screen"
          aria-selected={learningInputMode === 'screen'}
          onClick={() => onChangeLearningInputMode('screen')}
          className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded border transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
            learningInputMode === 'screen'
              ? 'bg-cyan-500/15 border-cyan-500/45 text-cyan-200'
              : 'bg-[#080B12] border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Monitor className="w-3.5 h-3.5" aria-hidden="true" />
          Learn from Screen
        </button>
      </div>

      {learningInputMode === 'screen' ? (
        <ScreenLearnPanel
          capturedRegion={capturedScreenRegion}
          question={screenQuestion}
          isAnalyzing={isAnalyzingScreen}
          onChangeQuestion={onChangeScreenQuestion}
          onCaptureRegion={onCaptureScreenRegion}
          onVisualize={onVisualizeScreen}
        />
      ) : (
        <>
      {/* Document Control Toolbar */}
      <div className="shrink-0 px-3 py-2 border-b border-slate-800/80 bg-[#0C101B] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {uploadedPdf && (
            <div
              role="group"
              aria-label="Document source"
              className="inline-flex items-center gap-0.5 p-0.5 bg-[#080B12] border border-slate-800 rounded"
            >
              <button
                type="button"
                onClick={() => onSelectSourceMode('uploaded')}
                aria-pressed={isUploadedMode}
                className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                  isUploadedMode
                    ? 'bg-cyan-500/15 text-cyan-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Uploaded
              </button>
              <button
                type="button"
                onClick={() => onSelectSourceMode('example')}
                aria-pressed={!isUploadedMode}
                className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                  !isUploadedMode
                    ? 'bg-cyan-500/15 text-cyan-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Example
              </button>
            </div>
          )}

          <p
            data-testid="pdf-document-title"
            className="text-xs font-mono text-slate-400 truncate max-w-[165px]"
            title={activeDocumentTitle}
          >
            {activeDocumentTitle}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Page Stepper */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onPageChange(safePage - 1)}
              disabled={safePage <= 1}
              aria-label="Previous page"
              className="p-1 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-35 disabled:pointer-events-none rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <span
              data-testid="pdf-page-readout"
              className="text-xs font-mono tabular-nums text-slate-300 px-1 whitespace-nowrap"
            >
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => onPageChange(safePage + 1)}
              disabled={safePage >= totalPages}
              aria-label="Next page"
              className="p-1 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-35 disabled:pointer-events-none rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <span aria-hidden="true" className="h-4 w-px bg-slate-800" />

          {/* Zoom Controls */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onZoomChange('out')}
              disabled={zoomPercent <= APP_CONFIG.pdfDefaults.minZoomPercent}
              aria-label="Zoom out"
              className="p-1 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-35 disabled:pointer-events-none rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              <ZoomOut className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onZoomChange('reset')}
              aria-label="Reset zoom"
              data-testid="pdf-zoom-readout"
              className="text-xs font-mono tabular-nums text-slate-300 hover:text-cyan-300 px-1 py-0.5 rounded transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              {zoomPercent}%
            </button>
            <button
              type="button"
              onClick={() => onZoomChange('in')}
              disabled={zoomPercent >= APP_CONFIG.pdfDefaults.maxZoomPercent}
              aria-label="Zoom in"
              className="p-1 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-35 disabled:pointer-events-none rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              <ZoomIn className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* Upload Error Notice */}
      {uploadError && (
        <div
          role="alert"
          className="shrink-0 px-3.5 py-2 bg-rose-950/50 border-b border-rose-500/40 flex items-center justify-between gap-2 text-xs text-rose-200"
        >
          <span>{uploadError}</span>
          <button
            type="button"
            onClick={() => setUploadError(null)}
            aria-label="Dismiss PDF error"
            className="text-rose-300 hover:text-white p-0.5"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Highlight-and-Ask Contextual Action Bar */}
      {selectedText && (
        <div
          data-testid="highlight-ask-bar"
          className="shrink-0 px-3.5 py-2 bg-[#101E30] border-b border-cyan-500/40 flex items-center justify-between gap-2.5"
        >
          <p className="text-xs text-slate-200 truncate">
            <span className="text-cyan-300 font-medium">Selected: </span>
            “{selectedText}”
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleAskGeminiClick}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              <Sparkles className="w-3 h-3" aria-hidden="true" />
              Ask Gemini
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedText('');
                window.getSelection()?.removeAllRanges();
              }}
              aria-label="Clear selected text"
              className="p-1 text-slate-400 hover:text-slate-100 rounded"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* Document Viewport */}
      <div
        ref={contentContainerRef}
        onMouseUp={checkSelection}
        onKeyUp={checkSelection}
        onTouchEnd={checkSelection}
        className="flex-1 min-h-0 overflow-auto studio-scroll p-3.5 bg-[#090D16] relative"
      >
        {isUploadedMode ? (
          <PdfCanvasViewer
            fileData={uploadedPdf.data}
            fileName={uploadedPdf.fileName}
            currentPage={safePage}
            zoomPercent={zoomPercent}
            onDocumentLoaded={onUploadedPdfLoaded}
            onPageTextExtracted={handlePageTextExtracted}
            onError={setUploadError}
          />
        ) : (
          <article
            style={{
              transform: `scale(${scaleFactor})`,
              transformOrigin: 'top left',
              width: `${100 / scaleFactor}%`,
            }}
            className="bg-[#111726] border border-slate-800/90 rounded-md p-4 space-y-4 transition-transform duration-150 select-text"
          >
            <header className="space-y-1.5 pb-3 border-b border-slate-800">
              <p className="text-xs font-mono text-cyan-400">
                Page {activeExamplePage.pageNumber} of {totalPages} · {studyModule.label}
              </p>
              <h3 className="font-display text-lg font-semibold text-slate-100 leading-snug">
                {activeExamplePage.sectionTitle}
              </h3>
            </header>

            <p className="text-sm text-slate-300 leading-relaxed">
              {activeExamplePage.summary}
            </p>

            {/* Key Formula Block */}
            <div className="bg-[#0B101B] border border-slate-800 rounded-md p-4 space-y-1.5">
              <p className="text-xs font-medium text-slate-400">
                {activeExamplePage.keyFormula.label}
              </p>
              <p className="font-mono text-sm text-cyan-300 break-words">
                {activeExamplePage.keyFormula.expression}
              </p>
              <p className="text-xs text-slate-400">
                {activeExamplePage.keyFormula.variables}
              </p>
            </div>

            {/* Core Takeaways */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-semibold tracking-wide text-slate-300">
                Key Principles
              </h4>
              <ul className="space-y-2">
                {activeExamplePage.keyTakeaways.map((point, index) => (
                  <li
                    key={point}
                    className="flex items-start gap-2.5 text-sm text-slate-300 leading-relaxed"
                  >
                    <span className="font-mono text-xs text-slate-500 mt-0.5 tabular-nums shrink-0">
                      0{index + 1}.
                    </span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>

            <footer className="pt-4 border-t border-slate-800/80 text-xs text-slate-500">
              Highlight any sentence above or upload your own PDF to ask Gemini for a visual explanation.
            </footer>
          </article>
        )}

        {/* Drag-and-Drop Overlay */}
        {isDragActive && (
          <div className="absolute inset-3 border-2 border-dashed border-cyan-400 bg-slate-950/85 rounded-lg flex flex-col items-center justify-center gap-2 z-20 pointer-events-none">
            <Upload className="w-6 h-6 text-cyan-400" aria-hidden="true" />
            <p className="text-sm font-medium text-slate-100">
              Drop PDF document to open in Visual Learning Studio
            </p>
          </div>
        )}
      </div>
        </>
      )}
    </section>
  );
}
