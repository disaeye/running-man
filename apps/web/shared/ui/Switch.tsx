"use client";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: SwitchProps) {
  return (
    <label
      className={`inline-flex items-center gap-2 ${
        disabled ? "cursor-not-allowed" : "cursor-pointer"
      }`}
    >
      {label && (
        <span className="text-subheadline text-text-primary select-none">
          {label}
        </span>
      )}
      <button
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => {
          if (!disabled) onChange(!checked);
        }}
        className={`
          focus-ring
          relative inline-flex h-6 w-11 shrink-0
          rounded-full border-2 border-transparent
          transition-colors duration-fast ease-default
          ${checked ? "bg-accent" : "bg-border-default"}
          ${disabled ? "opacity-50" : ""}
        `.trim()}
      >
        <span
          className={`
            pointer-events-none inline-block h-5 w-5
            rounded-full bg-text-inverse shadow-sm
            transform transition-transform duration-fast ease-default
            ${checked ? "translate-x-5" : "translate-x-0"}
          `.trim()}
        />
      </button>
    </label>
  );
}
