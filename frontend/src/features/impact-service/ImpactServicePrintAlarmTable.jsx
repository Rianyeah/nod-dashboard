import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatNumber } from '@/utils/formatters';
import { formatDateLabel } from './impactServiceDateRange';

const PRINT_HEADERS = [
  'Tanggal',
  'Site ID',
  'Site Name',
  'NOP',
  'Alarm Name',
  'Category',
  'Severity',
  'Aging',
  'Status',
  'SOW',
  'Comment',
];

function display(value) {
  return value == null || value === '' ? '-' : String(value);
}

export default function ImpactServicePrintAlarmTable({ alarms, selectedNop }) {
  const rows = alarms?.items || [];

  return (
    <Card
      size="sm"
      className="impact-service-print-only break-before-page border border-border bg-card shadow-none"
    >
      <CardHeader className="border-b border-border">
        <CardTitle className="text-sm font-semibold">OPEN Alarm Prioritas</CardTitle>
        <p className="text-xs text-muted-foreground">
          Maksimal 100 alarm | Critical ke Warning | tanggal terbaru | {selectedNop || 'Semua NOP'}
        </p>
      </CardHeader>
      <CardContent className="px-0">
        <Table className="impact-service-print-table">
          <TableHeader>
            <TableRow>
              {PRINT_HEADERS.map((header) => (
                <TableHead key={header}>{header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{formatDateLabel(row.tanggal)}</TableCell>
                <TableCell>{display(row.site_id)}</TableCell>
                <TableCell>{display(row.site_name)}</TableCell>
                <TableCell>{display(row.nop)}</TableCell>
                <TableCell>{display(row.alarm_name)}</TableCell>
                <TableCell>{display(row.category)}</TableCell>
                <TableCell>{display(row.severity)}</TableCell>
                <TableCell>{row.aging == null ? display(row.aging_range) : `${formatNumber(row.aging)} hari`}</TableCell>
                <TableCell>{display(row.status)}</TableCell>
                <TableCell>{display(row.sow)}</TableCell>
                <TableCell>{display(row.comment)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!rows.length && (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            Tidak ada alarm OPEN pada periode ini.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
