export const STATUS_COLORS = {
  total: 'var(--chart-1)',
  open: 'var(--chart-2)',
  clear: 'var(--chart-3)',
  warning: 'var(--chart-4)',
  impacted: 'var(--chart-5)',
};

export const impactServiceChartConfig = {
  total: {
    label: 'Total',
    color: 'var(--chart-1)',
  },
  open: {
    label: 'OPEN',
    color: 'var(--chart-2)',
  },
  clear: {
    label: 'CLEAR',
    color: 'var(--chart-3)',
  },
};

const AGING_COLORS = [
  'var(--chart-3)',
  'var(--chart-1)',
  'var(--chart-4)',
  '#F97316',
  'var(--chart-2)',
];

export const CATEGORY_COLORS = [
  'var(--chart-1)',
  'var(--chart-5)',
  'var(--chart-4)',
  'var(--chart-3)',
  '#F97316',
  '#E879F9',
  '#22D3EE',
  '#94A3B8',
];

export function getAgingColor(index) {
  return AGING_COLORS[Math.min(index, AGING_COLORS.length - 1)];
}

export function getCategoryColor(index) {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}
