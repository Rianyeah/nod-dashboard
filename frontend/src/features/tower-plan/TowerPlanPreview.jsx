import { useMemo, useState } from 'react';
import { Braces, Maximize2 } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import TowerPlanPreviewDialog from './TowerPlanPreviewDialog';
import { towerPlanSvgDataUrl } from './towerPlanSvg';

export default function TowerPlanPreview({ plan }) {
  const [open, setOpen] = useState(false);
  const source = useMemo(() => towerPlanSvgDataUrl(plan), [plan]);
  const alt = `Tower plan ${plan.siteName || 'tanpa Site ID'}`;

  return (
    <>
      <Card className="overflow-visible border border-[var(--border-strong)] py-0">
        <CardHeader className="border-b border-[var(--border-strong)] px-4 py-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Braces className="size-4 text-primary" />
            Engineering preview
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3">
          <button
            aria-label="Perbesar engineering preview"
            className="group relative block w-full overflow-hidden rounded-xl border border-[var(--border-strong)] bg-muted/30 text-left shadow-[var(--shadow-sm)] outline-none transition hover:border-primary/50 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
            type="button"
            onClick={() => setOpen(true)}
          >
            <img
              alt={alt}
              className="block aspect-[19/12] w-full object-contain"
              src={source}
            />
            <span className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 rounded-full border border-[var(--border-strong)] bg-[var(--bg-glass)] px-2 py-1 text-[9px] text-[var(--text-primary)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <Maximize2 className="size-3" />
              Preview 19:12
            </span>
          </button>
        </CardContent>
      </Card>

      <TowerPlanPreviewDialog
        alt={alt}
        onOpenChange={setOpen}
        open={open}
        source={source}
      />
    </>
  );
}
