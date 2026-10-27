"use client";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

/**
 * Two nested boxes on purpose: the `button` owns the hit area and the
 * accessibility surface, the inner track owns the 24px pill and its thumb.
 *
 * `min-h-10` puts the hit area at 40px, the floor the UX contract probe
 * enforces for every control, while the track keeps its 24px geometry so the
 * switch's own shape does not grow with the touch target.
 *
 * `role`, `aria-checked`, `disabled` and the focus ring stay on the button: a
 * switch whose state attribute sits on a decorative child is unreadable to
 * assistive tech and unfocusable to the keyboard.
 */
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
          inline-flex min-h-10 w-11 shrink-0 items-center justify-center
          rounded-full
          ${disabled ? "opacity-50" : ""}
        `.trim()}
      >
        <span
          aria-hidden="true"
          className={`
            relative inline-flex h-6 w-11 shrink-0
            rounded-full border-2 border-transparent
            transition-colors duration-fast ease-default
            ${checked ? "bg-accent" : "bg-border-default"}
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
        </span>
      </button>
    </label>
  );
}
