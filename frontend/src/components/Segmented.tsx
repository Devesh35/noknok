interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  // id prefix for aria-controls / aria-labelledby wiring with a tab panel
  idPrefix?: string;
  className?: string;
}

// Pill-shaped tab bar with a thumb that slides to the selected option.
export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  idPrefix = "tab",
  className = "",
}: SegmentedProps<T>) {
  const index = Math.max(
    options.findIndex((option) => option.value === value),
    0,
  );
  return (
    <div
      role="tablist"
      aria-label={label}
      className={`glass relative grid rounded-full p-1 ${className}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-1 left-1 rounded-full bg-brand-600 shadow-md shadow-brand-600/30 transition-transform duration-300 ease-out-soft"
        style={{
          width: `calc((100% - 0.5rem) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          id={`${idPrefix}-${option.value}`}
          aria-selected={value === option.value}
          aria-controls={`${idPrefix}-panel`}
          onClick={() => onChange(option.value)}
          className={`relative min-h-11 truncate rounded-full px-1 text-sm font-semibold transition-colors duration-300 ${
            value === option.value ? "text-white" : "text-soft hover:text-ink"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
