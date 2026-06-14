import { BellRingingIcon } from '@phosphor-icons/react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatNumber } from '@/utils/formatters';
import { ChartEmptyState } from './ImpactServiceStates';

export default function ImpactServiceTopAlarms({ rows }) {
  return (
    <Card size="sm" className="impact-service-top-alarms animate-fade-in border border-border bg-card/95 shadow-sm [--card-spacing:--spacing(3)]">
      <CardHeader className="border-b border-border pb-3">
        <div className="flex items-start gap-2">
          <div className="flex size-8 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <BellRingingIcon weight="duotone" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Top Alarm Names</CardTitle>
            <CardDescription className="mt-0.5 text-[11px]">
              Peringkat alarm berdasarkan volume dan site terdampak.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        {rows.length ? (
          <ScrollArea className="h-[230px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-xs">#</TableHead>
                  <TableHead className="text-xs">Alarm</TableHead>
                  <TableHead className="text-right text-xs">Total</TableHead>
                  <TableHead className="text-right text-xs">Sites</TableHead>
                  <TableHead className="text-right text-xs">OPEN</TableHead>
                  <TableHead className="text-right text-xs">CLEAR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={row.alarm_name}>
                    <TableCell className="px-2 py-1.5 font-mono text-xs text-muted-foreground">{index + 1}</TableCell>
                    <TableCell className="max-w-[420px] truncate px-2 py-1.5 font-medium">{row.alarm_name}</TableCell>
                    <TableCell className="px-2 py-1.5 text-right font-mono font-semibold">{formatNumber(row.total)}</TableCell>
                    <TableCell className="px-2 py-1.5 text-right font-mono text-muted-foreground">{formatNumber(row.impacted_sites)}</TableCell>
                    <TableCell className="px-2 py-1.5 text-right font-mono text-destructive">{formatNumber(row.open)}</TableCell>
                    <TableCell className="px-2 py-1.5 text-right font-mono text-emerald-400">{formatNumber(row.clear)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        ) : <ChartEmptyState label="Belum ada alarm yang dapat diperingkat." />}
      </CardContent>
    </Card>
  );
}
