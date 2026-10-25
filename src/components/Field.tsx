import type { InputHTMLAttributes } from "react";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  id: string;
  hint?: string;
  error?: string;
}

export default function Field({
  label,
  id,
  hint,
  error,
  className = "",
  disabled,
  ...props
}: FieldProps) {
  const borderStyles = error
    ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500"
    : "border-zinc-200 focus:border-indigo-600 focus:ring-indigo-600";

  return (
    <div className="w-full">
      <label
        htmlFor={id}
        className="block text-base font-medium text-zinc-700 mb-1.5"
      >
        {label}
      </label>
      <input
        id={id}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={
          error ? `${id}-error` : hint ? `${id}-hint` : undefined
        }
        className={`min-h-[44px] h-11 w-full px-3 text-base bg-white text-zinc-900 border rounded-lg placeholder:text-zinc-400 focus:outline-none focus:ring-2 transition-colors disabled:bg-zinc-50 disabled:text-zinc-400 disabled:cursor-not-allowed ${borderStyles} ${className}`}
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-sm text-rose-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-sm text-zinc-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
