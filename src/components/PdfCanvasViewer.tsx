import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfCanvasViewerProps {
  fileData: Uint8Array;
  fileName: string;
  currentPage: number;
  zoomPercent: number;
  onDocumentLoaded: (numPages: number) => void;
  onPageTextExtracted: (pageNumber: number, fullText: string) => void;
  onError: (message: string) => void;
}

/**
 * Renders an uploaded PDF document using PDF.js canvas + selectable TextLayer,
 * auto-fitting 100% zoom to the panel width so text is never clipped horizontally.
 */
export function PdfCanvasViewer({
  fileData,
  fileName,
  currentPage,
  zoomPercent,
  onDocumentLoaded,
  onPageTextExtracted,
  onError,
}: PdfCanvasViewerProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const loadingTaskRef = useRef<pdfjsLib.PDFDocumentLoadingTask | null>(null);

  const [docReadyVersion, setDocReadyVersion] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [isLoadingDoc, setIsLoadingDoc] = useState(true);
  const [isRenderingPage, setIsRenderingPage] = useState(false);

  // Track available container width so 100% zoom fits cleanly inside the PDF panel
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) {
      return;
    }
    const updateWidth = () => {
      const nextWidth = Math.max(240, el.clientWidth - 4);
      setContainerWidth((prev) => (Math.abs(prev - nextWidth) > 8 ? nextWidth : prev));
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, [isLoadingDoc]);

  // Load PDF binary when a new file is uploaded
  useEffect(() => {
    let cancelled = false;
    setIsLoadingDoc(true);

    if (loadingTaskRef.current) {
      void loadingTaskRef.current.destroy();
      loadingTaskRef.current = null;
    }

    const dataCopy = new Uint8Array(fileData);
    const loadingTask = pdfjsLib.getDocument({ data: dataCopy });
    loadingTaskRef.current = loadingTask;

    loadingTask.promise
      .then((doc) => {
        if (cancelled) {
          void loadingTask.destroy();
          return;
        }
        if (pdfDocRef.current) {
          void pdfDocRef.current.cleanup();
        }
        pdfDocRef.current = doc;
        onDocumentLoaded(doc.numPages);
        setIsLoadingDoc(false);
        setDocReadyVersion((v) => v + 1);
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        setIsLoadingDoc(false);
        const msg =
          err instanceof Error ? err.message : 'Unable to parse uploaded PDF.';
        onError(`Failed to open "${fileName}": ${msg}`);
      });

    return () => {
      cancelled = true;
      void loadingTask.destroy();
    };
  }, [fileData, fileName, onDocumentLoaded, onError]);

  // Clean up cached PDFDocumentProxy on unmount
  useEffect(() => {
    return () => {
      if (pdfDocRef.current) {
        void pdfDocRef.current.cleanup();
        pdfDocRef.current = null;
      }
      if (loadingTaskRef.current) {
        void loadingTaskRef.current.destroy();
        loadingTaskRef.current = null;
      }
    };
  }, []);

  // Render active page + selectable TextLayer when page, zoom, width, or doc changes
  useEffect(() => {
    const doc = pdfDocRef.current;
    const canvas = canvasRef.current;
    const textLayerContainer = textLayerRef.current;

    if (!doc || !canvas || !textLayerContainer || docReadyVersion === 0) {
      return;
    }

    let cancelled = false;
    let renderTask: RenderTask | null = null;
    let textLayerInstance: pdfjsLib.TextLayer | null = null;

    const renderPage = async () => {
      setIsRenderingPage(true);
      try {
        const safePageNum = Math.max(1, Math.min(doc.numPages, currentPage));
        const page = await doc.getPage(safePageNum);
        if (cancelled) {
          return;
        }

        const unscaledViewport = page.getViewport({ scale: 1 });
        const fitWidthScale =
          containerWidth > 0 ? containerWidth / unscaledViewport.width : 1;
        const cssScale = fitWidthScale * (zoomPercent / 100);
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: cssScale });

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Canvas 2D context unavailable.');
        }

        const transform =
          outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;

        renderTask = page.render({
          canvas,
          canvasContext: ctx,
          viewport,
          transform,
        });

        await renderTask.promise;
        if (cancelled) {
          return;
        }

        textLayerContainer.innerHTML = '';
        textLayerContainer.style.width = `${Math.floor(viewport.width)}px`;
        textLayerContainer.style.height = `${Math.floor(viewport.height)}px`;
        textLayerContainer.style.setProperty('--total-scale-factor', String(cssScale));

        const textContent = await page.getTextContent();
        if (cancelled) {
          return;
        }

        const extractedText = textContent.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        onPageTextExtracted(safePageNum, extractedText);

        textLayerInstance = new pdfjsLib.TextLayer({
          textContentSource: textContent,
          container: textLayerContainer,
          viewport,
        });

        await textLayerInstance.render();
      } catch (err: unknown) {
        if (
          cancelled ||
          (err instanceof Error && err.name === 'RenderingCancelledException')
        ) {
          return;
        }
        const msg =
          err instanceof Error ? err.message : 'Error rendering PDF page.';
        onError(msg);
      } finally {
        if (!cancelled) {
          setIsRenderingPage(false);
        }
      }
    };

    void renderPage();

    return () => {
      cancelled = true;
      if (renderTask) {
        renderTask.cancel();
      }
      if (textLayerInstance) {
        textLayerInstance.cancel();
      }
    };
  }, [
    docReadyVersion,
    currentPage,
    zoomPercent,
    containerWidth,
    onPageTextExtracted,
    onError,
  ]);

  if (isLoadingDoc) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-slate-400">
        Loading PDF document...
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="w-full">
      <div
        data-testid="pdf-page-container"
        className="relative mx-auto w-fit bg-white shadow-lg border border-slate-700/80 rounded-sm overflow-hidden select-text"
      >
        <canvas ref={canvasRef} className="block" />
        <div
          ref={textLayerRef}
          data-testid="pdf-text-layer"
          className="textLayer"
        />
        {isRenderingPage && (
          <div className="absolute inset-0 bg-slate-950/30 flex items-center justify-center pointer-events-none">
            <span className="text-xs font-mono text-slate-100 bg-slate-900/90 px-2.5 py-1 rounded border border-slate-700">
              Rendering page...
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
