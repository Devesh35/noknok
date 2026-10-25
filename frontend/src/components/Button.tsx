import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white shadow-lg shadow-brand-600/30 hover:shadow-xl hover:shadow-brand-600/40",
  secondary:
    "border border-line bg-surface/70 text-ink shadow-sm backdrop-blur hover:bg-surface-hi",
  ghost: "text-brand-700 hover:bg-brand-600/10",
};

// Shared by <Button> and by <Link>s that should look like buttons.
export function buttonClass(variant: Variant = "primary", className = ""): string {
  return `inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold transition duration-200 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:border-transparent disabled:bg-ink/10 disabled:bg-none disabled:text-muted disabled:shadow-none disabled:brightness-100 disabled:active:scale-100 ${VARIANTS[variant]} ${className}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

export function Button({
  variant = "primary",
  loading = false,
  disabled,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass(variant, className)}
      {...props}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}
