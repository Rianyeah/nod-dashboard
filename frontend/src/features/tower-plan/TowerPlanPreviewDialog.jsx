import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  Scan,
} from 'lucide-react';

import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  clampPan,
  clampZoom,
  zoomAroundPoint,
} from './towerPlanPreviewTransform';

const DOCUMENT_SIZE = { width: 1900, height: 1200 };
const ZOOM_STEP = 0.1;

function centeredTransform(viewport, fitScale) {
  return {
    zoom: 1,
    x: (viewport.width - DOCUMENT_SIZE.width * fitScale) / 2,
    y: (viewport.height - DOCUMENT_SIZE.height * fitScale) / 2,
  };
}

export default function TowerPlanPreviewDialog({
  alt,
  onOpenChange,
  open,
  source,
}) {
  const [transform, setTransform] = useState({ zoom: 1, x: 0, y: 0 });
  const [fitScale, setFitScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const viewportRef = useRef(null);
  const dragRef = useRef(null);
  const fitModeRef = useRef(true);

  const getViewportSize = useCallback(() => {
    const rect = viewportRef.current?.getBoundingClientRect();
    return {
      width: rect?.width || 0,
      height: rect?.height || 0,
    };
  }, []);

  const fitDocument = useCallback((node = viewportRef.current) => {
    const rect = node?.getBoundingClientRect();
    if (!rect?.width || !rect?.height) return;

    const nextFitScale = Math.min(
      rect.width / DOCUMENT_SIZE.width,
      rect.height / DOCUMENT_SIZE.height,
    );
    setFitScale(nextFitScale);
    setTransform(centeredTransform(rect, nextFitScale));
    fitModeRef.current = true;
  }, []);

  const setViewportNode = useCallback((node) => {
    viewportRef.current = node;
    if (node && open) {
      requestAnimationFrame(() => fitDocument(node));
    }
  }, [fitDocument, open]);

  useEffect(() => {
    const node = viewportRef.current;
    if (!open || !node || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(() => {
      if (fitModeRef.current) fitDocument(node);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [fitDocument, open]);

  const updateZoom = (nextZoomValue, point) => {
    const viewport = getViewportSize();
    if (!viewport.width || !viewport.height) return;

    const nextZoom = clampZoom(nextZoomValue);
    const anchor = point || {
      x: viewport.width / 2,
      y: viewport.height / 2,
    };
    fitModeRef.current = false;
    setTransform((current) => clampPan(
      zoomAroundPoint(current, nextZoom, anchor),
      viewport,
      {
        width: DOCUMENT_SIZE.width * fitScale,
        height: DOCUMENT_SIZE.height * fitScale,
      },
    ));
  };

  const resetView = () => {
    const viewport = getViewportSize();
    if (!viewport.width || !viewport.height) return;
    setTransform(centeredTransform(viewport, fitScale));
    fitModeRef.current = true;
  };

  const handleWheel = (event) => {
    event.preventDefault();
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const direction = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
    updateZoom(transform.zoom + direction, {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
  };

  const handlePointerDown = (event) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: transform.x,
      originY: transform.y,
    };
    fitModeRef.current = false;
    setIsDragging(true);
  };

  const handlePointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const viewport = getViewportSize();
    setTransform((current) => clampPan(
      {
        zoom: current.zoom,
        x: drag.originX + event.clientX - drag.startX,
        y: drag.originY + event.clientY - drag.startY,
      },
      viewport,
      {
        width: DOCUMENT_SIZE.width * fitScale,
        height: DOCUMENT_SIZE.height * fitScale,
      },
    ));
  };

  const handlePointerUp = (event) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setIsDragging(false);
  };

  const handleOpenChange = (nextOpen) => {
    if (!nextOpen) {
      dragRef.current = null;
      setIsDragging(false);
    }
    onOpenChange(nextOpen);
  };

  const zoomPercent = Math.round(transform.zoom * 100);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="h-[min(92vh,940px)] max-w-[min(96vw,1580px)] grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden rounded-2xl p-3 sm:max-w-[min(96vw,1580px)]"
        onOpenAutoFocus={() => {
          requestAnimationFrame(() => fitDocument());
        }}
      >
        <DialogHeader className="gap-3 pr-12 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <DialogTitle className="flex items-center gap-2">
              <Maximize2 className="size-4 text-primary" />
              Engineering preview
            </DialogTitle>
            <DialogDescription>
              Scroll untuk zoom, lalu drag untuk memindahkan gambar.
            </DialogDescription>
          </div>

          <div
            aria-label="Preview controls"
            className="flex flex-wrap items-center gap-1.5"
            role="toolbar"
          >
            <Button
              aria-label="Zoom Out"
              disabled={transform.zoom <= 0.5}
              size="icon-sm"
              type="button"
              variant="outline"
              onClick={() => updateZoom(transform.zoom - ZOOM_STEP)}
            >
              <Minus />
            </Button>
            <span
              aria-live="polite"
              className="w-14 text-center text-xs font-medium tabular-nums"
            >
              {zoomPercent}%
            </span>
            <Button
              aria-label="Zoom In"
              disabled={transform.zoom >= 2.5}
              size="icon-sm"
              type="button"
              variant="outline"
              onClick={() => updateZoom(transform.zoom + ZOOM_STEP)}
            >
              <Plus />
            </Button>
            <Button
              className="gap-1.5"
              size="sm"
              type="button"
              variant="outline"
              onClick={() => fitDocument()}
            >
              <Scan />
              <span>Fit</span>
            </Button>
            <Button
              className="gap-1.5"
              size="sm"
              type="button"
              variant="outline"
              onClick={resetView}
            >
              <RotateCcw />
              <span>Reset</span>
            </Button>
          </div>
        </DialogHeader>

        <div
          ref={setViewportNode}
          aria-label="Zoomable tower plan preview"
          className={[
            'relative min-h-0 touch-none overflow-hidden rounded-xl border border-border bg-slate-900',
            isDragging ? 'cursor-grabbing' : 'cursor-grab',
          ].join(' ')}
          role="region"
          style={{
            backgroundImage: [
              'linear-gradient(rgba(148,163,184,.12) 1px, transparent 1px)',
              'linear-gradient(90deg, rgba(148,163,184,.12) 1px, transparent 1px)',
            ].join(','),
            backgroundSize: '24px 24px',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
        >
          <img
            alt={alt}
            className="pointer-events-none absolute left-0 top-0 max-w-none select-none shadow-2xl"
            draggable="false"
            height={DOCUMENT_SIZE.height}
            src={source}
            style={{
              height: `${DOCUMENT_SIZE.height}px`,
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${fitScale * transform.zoom})`,
              transformOrigin: 'top left',
              width: `${DOCUMENT_SIZE.width}px`,
            }}
            width={DOCUMENT_SIZE.width}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
