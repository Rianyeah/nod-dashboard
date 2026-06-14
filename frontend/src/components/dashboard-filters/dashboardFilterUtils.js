export const ALL_FILTER_VALUE = '__all__';

export function normalizeFilterOptions(options = []) {
  return options
    .map((option) => {
      if (option == null) return null;
      if (typeof option !== 'object') {
        return { value: String(option), label: String(option) };
      }

      const value = option.value ?? option.id;
      if (value == null) return null;

      return {
        value: String(value),
        label: String(option.label ?? option.name ?? value),
      };
    })
    .filter(Boolean);
}

export function toFilterControlValue(value) {
  return value == null || value === '' ? ALL_FILTER_VALUE : String(value);
}

export function fromFilterControlValue(value) {
  return value === ALL_FILTER_VALUE ? '' : value;
}

export function countActiveFilters(filters = {}) {
  return Object.values(filters).filter((value) => (
    value != null && value !== '' && value !== ALL_FILTER_VALUE
  )).length;
}

export function parseLocalDate(value) {
  if (!value) return undefined;
  const [year, month, day] = String(value).split('-').map(Number);
  if (!year || !month || !day) return undefined;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function formatLocalDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
