import { getMarkerColor, getStatusLabel } from '../../utils/mapColors';

export default function StatusBadge({ availability, statusSite, size = 'sm' }) {
  const color = getMarkerColor(availability, statusSite);
  const label = getStatusLabel(availability, statusSite);

  const sizeClasses = {
    xs: 'text-xs px-1.5 py-0.5',
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-1',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${sizeClasses[size]}`}
      style={{
        backgroundColor: `${color}18`,
        color: color,
        border: `1px solid ${color}30`,
      }}
    >
      <span
        className="w-2 h-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}
