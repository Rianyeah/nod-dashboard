import { useEffect, useMemo, useState } from 'react';
import {
  ArrowCounterClockwiseIcon,
  CalendarBlankIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CaretUpDownIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  XIcon,
} from '@phosphor-icons/react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from '@/components/ui/pagination';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

import {
  ALL_FILTER_VALUE,
  countActiveFilters,
  formatLocalDate,
  fromFilterControlValue,
  normalizeFilterOptions,
  parseLocalDate,
  toFilterControlValue,
} from './dashboardFilterUtils';

function useDesktopCalendar() {
  const [isDesktop, setIsDesktop] = useState(() => (
    typeof window === 'undefined' ? true : window.matchMedia('(min-width: 768px)').matches
  ));

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return isDesktop;
}

function CompactField({ id: controlId, label, className, children }) {
  if (!label) return children;

  return (
    <Field className={cn('min-w-[132px] gap-1', className)}>
      <FieldLabel
        htmlFor={controlId}
        className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
      >
        {label}
      </FieldLabel>
      {children}
    </Field>
  );
}

export function DashboardFilterBar({ children, actions, chips, className, ...props }) {
  return (
    <section
      data-slot="dashboard-filter-bar"
      className={cn(
        'flex flex-col gap-2 rounded-xl border border-border bg-card/70 p-2.5 shadow-sm backdrop-blur-sm',
        className,
      )}
      {...props}
    >
      <div className="flex flex-wrap items-end gap-2 lg:flex-nowrap">
        <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2 lg:flex-nowrap">{children}</div>
        {actions ? (
          <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5 lg:w-auto lg:shrink-0 lg:flex-nowrap">
            {actions}
          </div>
        ) : null}
      </div>
      {chips}
    </section>
  );
}

export function DashboardFilterSelect({
  id: controlId,
  label,
  value,
  onChange,
  options = [],
  allLabel = 'Semua',
  includeAll = true,
  className,
  triggerClassName,
  testId,
  ariaLabel,
  ...props
}) {
  const normalizedOptions = useMemo(() => normalizeFilterOptions(options), [options]);
  const controlValue = includeAll ? toFilterControlValue(value) : String(value ?? '');

  return (
    <CompactField id={controlId} label={label} className={className}>
      <Select
        value={controlValue}
        onValueChange={(nextValue) => onChange?.(fromFilterControlValue(nextValue))}
        {...props}
      >
        <SelectTrigger
          id={controlId}
          data-testid={testId}
          aria-label={ariaLabel}
          size="sm"
          className={cn('w-full min-w-[132px] rounded-lg', triggerClassName)}
        >
          <SelectValue placeholder={allLabel} />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          <SelectGroup>
            {includeAll ? <SelectItem value={ALL_FILTER_VALUE}>{allLabel}</SelectItem> : null}
            {normalizedOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </CompactField>
  );
}

export function DashboardCombobox({
  id: controlId,
  label,
  value,
  onChange,
  options = [],
  allLabel = 'Semua',
  searchPlaceholder = 'Cari pilihan...',
  emptyLabel = 'Pilihan tidak ditemukan.',
  includeAll = true,
  className,
  triggerClassName,
  ...props
}) {
  const [open, setOpen] = useState(false);
  const normalizedOptions = useMemo(() => normalizeFilterOptions(options), [options]);
  const controlValue = includeAll ? toFilterControlValue(value) : String(value ?? '');
  const selectedOption = normalizedOptions.find((option) => option.value === controlValue);
  const selectedLabel = controlValue === ALL_FILTER_VALUE
    ? allLabel
    : selectedOption?.label || allLabel;

  const selectValue = (nextValue) => {
    onChange?.(fromFilterControlValue(nextValue));
    setOpen(false);
  };

  return (
    <CompactField id={controlId} label={label} className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={controlId}
            type="button"
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            className={cn('w-full min-w-[148px] justify-between rounded-lg font-normal', triggerClassName)}
            {...props}
          >
            <span className="truncate">{selectedLabel}</span>
            <CaretUpDownIcon data-icon="inline-end" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[220px] p-0">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyLabel}</CommandEmpty>
              <CommandGroup>
                {includeAll ? (
                  <CommandItem
                    value={`${allLabel} ${ALL_FILTER_VALUE}`}
                    data-checked={controlValue === ALL_FILTER_VALUE}
                    onSelect={() => selectValue(ALL_FILTER_VALUE)}
                  >
                    {allLabel}
                  </CommandItem>
                ) : null}
                {normalizedOptions.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={`${option.label} ${option.value}`}
                    data-checked={controlValue === option.value}
                    onSelect={() => selectValue(option.value)}
                  >
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </CompactField>
  );
}

export function DashboardPeriodPicker(props) {
  return <DashboardCombobox searchPlaceholder="Cari periode..." {...props} />;
}

export function DashboardDateRangePicker({
  id: controlId,
  label = 'Rentang Tanggal',
  value = { from: '', to: '' },
  onApply,
  className,
  triggerClassName,
  disabled,
  minDate,
  triggerTestId,
  applyTestId,
  contentAlign = 'start',
  ...props
}) {
  const isDesktop = useDesktopCalendar();
  const [open, setOpen] = useState(false);
  const appliedRange = useMemo(() => ({
    from: parseLocalDate(value.from),
    to: parseLocalDate(value.to),
  }), [value.from, value.to]);
  const [draftRange, setDraftRange] = useState(appliedRange);

  const applyRange = () => {
    if (!draftRange?.from || !draftRange?.to) return;
    onApply?.({
      from: formatLocalDate(draftRange.from),
      to: formatLocalDate(draftRange.to),
    });
    setOpen(false);
  };

  const rangeLabel = appliedRange.from && appliedRange.to
    ? `${format(appliedRange.from, 'dd MMM yyyy', { locale: id })} - ${format(appliedRange.to, 'dd MMM yyyy', { locale: id })}`
    : 'Pilih rentang tanggal';

  return (
    <CompactField id={controlId} label={label} className={className}>
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (nextOpen) setDraftRange(appliedRange);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={controlId}
            data-testid={triggerTestId}
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className={cn('w-full min-w-[230px] justify-start rounded-lg font-normal', triggerClassName)}
            {...props}
          >
            <CalendarBlankIcon data-icon="inline-start" />
            <span className="truncate">{rangeLabel}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align={contentAlign} className="w-auto gap-2 p-2">
          <Calendar
            mode="range"
            selected={draftRange}
            onSelect={setDraftRange}
            numberOfMonths={isDesktop ? 2 : 1}
            defaultMonth={draftRange?.from || appliedRange.from}
            disabled={minDate ? { before: parseLocalDate(minDate) } : undefined}
          />
          <div className="flex items-center justify-end gap-1.5 border-t border-border pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button
              data-testid={applyTestId}
              data-range-from={formatLocalDate(draftRange?.from)}
              data-range-to={formatLocalDate(draftRange?.to)}
              type="button"
              size="sm"
              disabled={!draftRange?.from || !draftRange?.to}
              onClick={applyRange}
            >
              Terapkan
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </CompactField>
  );
}

export function DashboardFilterSheet({
  title = 'Filter lanjutan',
  description = 'Atur filter tambahan lalu terapkan perubahan.',
  values = {},
  onApply,
  onReset,
  children,
  triggerLabel = 'Filter',
  testId,
  className,
}) {
  const [open, setOpen] = useState(false);
  const [draftValues, setDraftValues] = useState(values);
  const activeCount = countActiveFilters(values);

  const handleOpenChange = (nextOpen) => {
    setOpen(nextOpen);
    setDraftValues(values);
  };

  const setDraftValue = (key, nextValue) => {
    setDraftValues((current) => ({ ...current, [key]: nextValue }));
  };

  const applyDraft = () => {
    onApply(draftValues);
    setOpen(false);
  };

  const resetDraft = () => {
    const nextValues = onReset?.();
    if (nextValues) setDraftValues(nextValues);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="sm" data-testid={testId}>
          <FunnelIcon data-icon="inline-start" />
          {triggerLabel}
          {activeCount ? <Badge variant="secondary">{activeCount}</Badge> : null}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className={cn('w-full sm:max-w-md', className)}>
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
          {typeof children === 'function'
            ? children({ draftValues, setDraftValue })
            : children}
        </div>
        <SheetFooter className="border-t border-border p-4">
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={resetDraft}>
              <ArrowCounterClockwiseIcon data-icon="inline-start" />
              Bersihkan
            </Button>
            <div className="flex items-center gap-1.5">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                Batal
              </Button>
              <Button type="button" size="sm" onClick={applyDraft}>
                Terapkan
              </Button>
            </div>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function DashboardFilterPopover({
  title = 'Filter lanjutan',
  description = 'Atur filter tambahan lalu terapkan perubahan.',
  values = {},
  onApply,
  onReset,
  children,
  triggerLabel = 'Filter',
  testId,
  className,
  align = 'end',
}) {
  const [open, setOpen] = useState(false);
  const [draftValues, setDraftValues] = useState(values);
  const activeCount = countActiveFilters(values);

  const handleOpenChange = (nextOpen) => {
    setOpen(nextOpen);
    setDraftValues(values);
  };

  const setDraftValue = (key, nextValue) => {
    setDraftValues((current) => ({ ...current, [key]: nextValue }));
  };

  const applyDraft = () => {
    onApply(draftValues);
    setOpen(false);
  };

  const resetDraft = () => {
    const nextValues = onReset?.();
    if (nextValues) setDraftValues(nextValues);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" data-testid={testId}>
          <FunnelIcon data-icon="inline-start" />
          {triggerLabel}
          {activeCount ? <Badge variant="secondary">{activeCount}</Badge> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className={cn('w-[min(94vw,540px)] gap-0 overflow-hidden p-0', className)}
      >
        <PopoverHeader className="border-b border-border p-3">
          <PopoverTitle>{title}</PopoverTitle>
          <PopoverDescription className="text-xs">{description}</PopoverDescription>
        </PopoverHeader>
        <div className="grid max-h-[min(62vh,520px)] grid-cols-1 gap-2 overflow-y-auto p-3 sm:grid-cols-2">
          {typeof children === 'function'
            ? children({ draftValues, setDraftValue })
            : children}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border p-3">
          <Button type="button" variant="ghost" size="sm" onClick={resetDraft}>
            <ArrowCounterClockwiseIcon data-icon="inline-start" />
            Bersihkan
          </Button>
          <div className="flex items-center gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button type="button" size="sm" onClick={applyDraft}>
              Terapkan
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function DashboardFilterChips({ items = [], onRemove, className }) {
  const visibleItems = items.filter((item) => (
    item?.value != null && item.value !== '' && item.value !== ALL_FILTER_VALUE
  ));

  if (!visibleItems.length) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {visibleItems.map((item) => (
        <Badge key={item.key} variant="secondary" className="gap-1 py-0.5 pl-2 pr-1">
          <span>{item.label}: {item.displayValue ?? item.value}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Hapus filter ${item.label}`}
            onClick={() => onRemove?.(item.key)}
          >
            <XIcon />
          </Button>
        </Badge>
      ))}
    </div>
  );
}

export function DashboardTableToolbar({ children, actions, className, ...props }) {
  return (
    <div
      data-slot="dashboard-table-toolbar"
      className={cn('flex flex-wrap items-end justify-between gap-2', className)}
      {...props}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">{children}</div>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </div>
  );
}

export function DashboardSearchInput({
  id: controlId,
  value,
  onChange,
  placeholder = 'Cari...',
  className,
  ...props
}) {
  return (
    <InputGroup className={cn('h-8 min-w-[220px] flex-1 sm:max-w-[300px]', className)}>
      <InputGroupAddon>
        <MagnifyingGlassIcon />
      </InputGroupAddon>
      <InputGroupInput
        id={controlId}
        type="search"
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        {...props}
      />
      {value ? (
        <InputGroupAddon align="inline-end">
          <InputGroupButton aria-label="Bersihkan pencarian" onClick={() => onChange?.('')}>
            <XIcon />
          </InputGroupButton>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  );
}

export function DashboardPagination({
  page,
  totalPages,
  onPageChange,
  disabled = false,
  className,
  testIdPrefix = 'dashboard',
  previousTestId,
  nextTestId,
}) {
  const safeTotalPages = Math.max(totalPages || 1, 1);

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-2', className)}>
      <span className="text-xs text-muted-foreground">
        Halaman {page || 1} dari {safeTotalPages}
      </span>
      <Pagination className="mx-0 w-auto justify-end">
        <PaginationContent>
          <PaginationItem>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid={previousTestId || `${testIdPrefix}-previous-page`}
              disabled={disabled || page <= 1}
              onClick={() => onPageChange?.(page - 1)}
            >
              <CaretLeftIcon data-icon="inline-start" />
              Sebelumnya
            </Button>
          </PaginationItem>
          <PaginationItem>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid={nextTestId || `${testIdPrefix}-next-page`}
              disabled={disabled || page >= safeTotalPages}
              onClick={() => onPageChange?.(page + 1)}
            >
              Berikutnya
              <CaretRightIcon data-icon="inline-end" />
            </Button>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
