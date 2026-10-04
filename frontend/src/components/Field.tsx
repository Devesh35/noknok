import {
  useId,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

const CONTROL =
  "min-h-11 w-full rounded-2xl border bg-surface/70 px-3 text-base text-ink shadow-sm outline-none transition duration-200 placeholder:text-faint focus:border-brand-600 focus:bg-surface-hi focus:ring-4 focus:ring-brand-600/15";

function borderFor(error?: string) {
  return error ? "border-red-400" : "border-line";
}

function FieldError({ id, error }: { id: string; error?: string }) {
  if (!error) return null;
  return (
    <p id={id} className="mt-1 animate-rise text-sm text-red-400">
      {error}
    </p>
  );
}

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  label: string;
  error?: string;
  prefix?: string;
}

export function Input({ label, error, prefix, className = "", ...props }: InputProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-body">
        {label}
      </label>
      <div className="flex gap-2">
        {prefix && (
          <span className="inline-flex min-h-11 items-center rounded-2xl border border-line bg-surface/50 px-3 text-base text-soft shadow-sm">
            {prefix}
          </span>
        )}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={`${CONTROL} ${borderFor(error)} ${className}`}
          {...props}
        />
      </div>
      <FieldError id={errorId} error={error} />
    </div>
  );
}

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  error?: string;
}

export function Checkbox({ label, error, ...props }: CheckboxProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="flex min-h-11 items-center gap-3 text-sm text-body">
        <input
          id={id}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="h-5 w-5 shrink-0 accent-brand-600"
          {...props}
        />
        {label}
      </label>
      <FieldError id={errorId} error={error} />
    </div>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  hint?: string;
}

export function Textarea({ label, error, hint, className = "", ...props }: TextareaProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-body">
        {label}
      </label>
      <textarea
        id={id}
        rows={4}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`${CONTROL} py-2.5 ${borderFor(error)} ${className}`}
        {...props}
      />
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      <FieldError id={errorId} error={error} />
    </div>
  );
}

interface ToggleProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

// On/off switch for settings rows.
export function Toggle({ label, hint, checked, onChange, disabled = false }: ToggleProps) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-4 py-1.5">
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="relative h-7 w-12 shrink-0 rounded-full bg-ink/20 transition-colors duration-200 peer-checked:bg-brand-600 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-600/25 peer-disabled:opacity-50 after:absolute after:top-0.5 after:left-0.5 after:h-6 after:w-6 after:rounded-full after:bg-white after:shadow after:transition-transform after:duration-200 peer-checked:after:translate-x-5"
      />
    </label>
  );
}
