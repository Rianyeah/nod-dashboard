import { ArrowCounterClockwiseIcon } from '@phosphor-icons/react';

import {
  DashboardCombobox,
  DashboardDateRangePicker,
  DashboardFilterBar,
} from '@/components/dashboard-filters/DashboardFilters';
import { Button } from '@/components/ui/button';
import { parseLocalDate } from './impactServiceDateRange';

export default function ImpactServiceFilters({
  startDate,
  endDate,
  minDate,
  nops,
  selectedNop,
  onApplyRange,
  onNopChange,
  onReset,
  disabled,
}) {
  return (
    <DashboardFilterBar
      className="w-full border-0 bg-transparent p-0 shadow-none backdrop-blur-none xl:w-auto"
      actions={(
        <Button
          data-testid="impact-reset"
          type="button"
          variant="ghost"
          size="sm"
          onClick={onReset}
          disabled={disabled}
        >
          <ArrowCounterClockwiseIcon data-icon="inline-start" />
          Reset
        </Button>
      )}
    >
      <DashboardDateRangePicker
        id="impact-date-range"
        label="Rentang tanggal"
        value={{ from: startDate, to: endDate }}
        onApply={({ from, to }) => onApplyRange({
          from: parseLocalDate(from),
          to: parseLocalDate(to),
        })}
        minDate={minDate}
        triggerTestId="impact-date-range-trigger"
        applyTestId="impact-date-apply"
        contentAlign="end"
        triggerClassName="sm:w-[250px]"
        disabled={disabled}
      />
      <DashboardCombobox
        id="impact-nop"
        data-testid="impact-nop"
        label="NOP"
        value={selectedNop}
        onChange={(value) => onNopChange(value || null)}
        options={nops}
        allLabel="Semua NOP"
        searchPlaceholder="Cari NOP..."
        triggerClassName="sm:w-[155px]"
        disabled={disabled}
      />
    </DashboardFilterBar>
  );
}
