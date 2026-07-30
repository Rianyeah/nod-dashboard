import { useMemo } from 'react';
import { useTheme } from './useTheme';

export function useDashboardThemeTokens() {
  const { theme } = useTheme();

  return useMemo(() => ({
    theme,
    primary: 'var(--primary)',
    primaryLight: 'var(--primary-light)',
    success: 'var(--success)',
    warning: 'var(--warning)',
    danger: 'var(--danger)',
    info: 'var(--info)',
    textPrimary: 'var(--text-primary)',
    textSecondary: 'var(--text-secondary)',
    textMuted: 'var(--text-muted)',
    border: 'var(--border)',
    borderLight: 'var(--border-light)',
    borderStrong: 'var(--border-strong)',
    surfaceElevated: 'var(--bg-elevated)',
    chartAccent: 'var(--chart-accent)',
    chartNeutral1: 'var(--chart-neutral-1)',
    chartNeutral2: 'var(--chart-neutral-2)',
    chartSuccess: 'var(--chart-success)',
    chartWarning: 'var(--chart-warning)',
    chartDanger: 'var(--chart-danger)',
    chartInfo: 'var(--chart-info)',
    chartGrid: 'var(--chart-grid)',
    chartGridStrong: 'var(--chart-grid-strong)',
    axisTick: 'var(--chart-axis)',
    tooltipBg: 'var(--chart-tooltip-bg)',
    tooltipBorder: 'var(--chart-tooltip-border)',
    cursorFill: 'var(--chart-cursor)',
    tableRowHover: 'var(--table-row-hover)',
    tableHeaderBg: 'var(--table-header-bg)',
    controlBg: 'var(--control-bg)',
  }), [theme]);
}
