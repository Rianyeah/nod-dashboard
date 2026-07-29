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
      <Card className="overflow-visible py-0">
        <CardHeader className="border-b border-border px-4 py-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Braces className="size-4 text-primary" />
            Engineering preview
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3">
          <button
            aria-label="Perbesar engineering preview"
            className="group relative block w-full overflow-hidden rounded-xl border border-border bg-muted/30 text-left shadow-inner outline-none transition hover:border-primary/50 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
            type="button"
            onClick={() => setOpen(true)}
          >
            <img
              alt={alt}
              className="block aspect-[19/12] w-full object-contain"
              src={source}
            />
            <span className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-slate-950/75 px-2 py-1 text-[9px] text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
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
