import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Network, RadioTower } from 'lucide-react';

import { DashboardChartPanel } from '../../components/ui/DashboardPrimitives';
import { Button } from '../../components/ui/button';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from '../../components/ui/carousel';
import {
  CellDistributionHeatmap,
  OperationalReadinessHeatmap,
  TransportConfigurationMatrix,
} from './DataPotensiMatrixCharts';
import { shouldHandleCarouselDrag } from './dataPotensiCarouselUtils';


export default function DataPotensiInsightCarousel({
  readinessData = [],
  transportData = [],
  cellDistributionData = [],
}) {
  const [api, setApi] = useState();
  const [current, setCurrent] = useState(0);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const slides = useMemo(() => [
    {
      title: 'Operational Readiness Heatmap',
      icon: CheckCircle2,
      content: <OperationalReadinessHeatmap data={readinessData} />,
    },
    {
      title: 'Transport Configuration Matrix',
      icon: Network,
      content: <TransportConfigurationMatrix data={transportData} />,
    },
    {
      title: 'Cell Distribution Heatmap',
      icon: RadioTower,
      content: <CellDistributionHeatmap data={cellDistributionData} />,
    },
  ], [cellDistributionData, readinessData, transportData]);

  useEffect(() => {
    if (!api) return undefined;

    const syncCarouselState = () => {
      setCurrent(api.selectedScrollSnap());
      setCanScrollPrev(api.canScrollPrev());
      setCanScrollNext(api.canScrollNext());
    };

    syncCarouselState();
    api.on('select', syncCarouselState);
    api.on('reInit', syncCarouselState);

    return () => {
      api.off('select', syncCarouselState);
      api.off('reInit', syncCarouselState);
    };
  }, [api]);

  const activeSlide = slides[current] ?? slides[0];

  const controls = (
    <div className="flex items-center gap-1.5">
      <span className="sr-only" aria-live="polite">
        Slide {current + 1} dari {slides.length}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        aria-label="Slide sebelumnya"
        disabled={!canScrollPrev}
        onClick={() => api?.scrollPrev()}
      >
        <ChevronLeft className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        aria-label="Slide berikutnya"
        disabled={!canScrollNext}
        onClick={() => api?.scrollNext()}
      >
        <ChevronRight className="size-3.5" />
      </Button>
    </div>
  );

  return (
    <DashboardChartPanel
      title={activeSlide.title}
      icon={activeSlide.icon}
      action={controls}
      className="h-full min-h-[440px]"
    >
      <Carousel
        setApi={setApi}
        opts={{
          align: 'start',
          loop: false,
          watchDrag: shouldHandleCarouselDrag,
          breakpoints: {
            '(prefers-reduced-motion: reduce)': { duration: 0 },
          },
        }}
        className="mt-4 min-w-0"
        aria-label="Insight Data Potensi"
      >
        <CarouselContent>
          {slides.map((slide) => (
            <CarouselItem key={slide.title} aria-label={slide.title}>
              {slide.content}
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>

      <div className="mt-4 flex items-center justify-center gap-2" aria-label="Pilih slide insight">
        {slides.map((slide, index) => (
          <button
            key={slide.title}
            type="button"
            aria-label={`Buka ${slide.title}`}
            aria-current={index === current ? 'true' : undefined}
            className={`h-1.5 rounded-full transition-[width,background-color] duration-200 motion-reduce:transition-none ${
              index === current
                ? 'w-6 bg-[var(--primary)]'
                : 'w-1.5 bg-[var(--border-strong)] hover:bg-[var(--text-muted)]'
            }`}
            onClick={() => api?.scrollTo(index)}
          />
        ))}
      </div>
    </DashboardChartPanel>
  );
}
