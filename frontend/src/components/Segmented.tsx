interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  // `count` sits after the label on the same line, dimmer.
  options: { value: T; label: string; count?: number }[];
  // id prefix for aria-controls / aria-labelledby wiring with a tab panel
  idPrefix?: string;
  className?: string;
}

// Pill-shaped tab bar with a thumb that slides to the selected option. Every
// option gets the same width; when they don't all fit, the bar scrolls
// sideways instead of squeezing the labels.
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
    <div className={`no-scrollbar overflow-x-auto rounded-full ${className}`}>
      <div
        role="tablist"
        aria-label={label}
        className="glass relative grid min-w-full w-max rounded-full p-1"
        style={{
          gridTemplateColumns: `repeat(${options.length}, minmax(5rem, 1fr))`,
        }}
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
            onClick={(event) => {
              onChange(option.value);
              event.currentTarget.scrollIntoView({
                block: "nearest",
                inline: "nearest",
                behavior: "smooth",
              });
            }}
            className={`relative flex min-h-11 items-center justify-center gap-1 rounded-full px-0.5 text-[13px] leading-tight font-semibold transition-colors md:px-1 md:text-sm duration-300 ${
              value === option.value ? "text-white" : "text-soft hover:text-ink"
            }`}
          >
            <span className="min-w-0 truncate">{option.label}</span>
            {option.count !== undefined && (
              <span className="text-xs font-medium opacity-70">
                {option.count}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
