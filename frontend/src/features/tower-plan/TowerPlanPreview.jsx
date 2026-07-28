import { useMemo } from 'react';
import { Braces, Maximize2 } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { towerPlanSvgDataUrl } from './towerPlanSvg';

export default function TowerPlanPreview({ plan }) {
  const source = useMemo(() => towerPlanSvgDataUrl(plan), [plan]);
  return (
    <Card className="overflow-visible py-0">
      <CardHeader className="border-b border-border px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Braces className="size-4 text-primary" />
          Engineering preview
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3">
        <div className="group relative overflow-hidden rounded-xl border border-border bg-white shadow-inner">
          <img
            alt={`Tower plan ${plan.siteName || 'tanpa Site ID'}`}
            className="block aspect-[25/32] w-full object-contain"
            src={source}
          />
          <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-slate-950/75 px-2 py-1 text-[9px] text-white opacity-0 transition-opacity group-hover:opacity-100">
            <Maximize2 className="size-3" />
            Preview 25:32
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
