import { FieldError } from "./FormError";

// Shared across every text/select input in the app — a fix here reaches
// every consumer at once (LOCK Gate 4: "perbaiki shared component/design
// token, bukan hanya satu halaman"). focus:ring is visible against both
// light and dark backgrounds; disabled gets a distinct opacity + cursor so
// it reads as inactive without becoming illegible; aria-invalid gets a red
// border so an error state is visible on the control itself, not only in
// the text below it.
//
// Exported (not just used internally) so compact, non-labeled controls that
// can't use the full TextField/SelectField wrapper (e.g. an inline
// disposition <select> next to a button) can still apply the exact same
// base token instead of hand-rolling a near-duplicate className.
export const inputClassName =
  "rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-red-500 dark:border-neutral-700 dark:aria-[invalid=true]:border-red-500";

// <select> gets its own token instead of reusing inputClassName's
// bg-transparent: a native select's dropdown popup is OS-rendered and
// doesn't follow the card background it sits on, so the closed box needs an
// explicit light surface (white/slate-900 text) that matches the
// select/option/optgroup rule in globals.css — otherwise the box and its
// own popup can show mismatched colors. Keep every disabled/focus/error
// utility class identical to inputClassName so shared behavior stays
// consistent between text and select fields.
export const selectClassName =
  "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-neutral-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-slate-50 disabled:text-slate-400 aria-[invalid=true]:border-red-500 dark:border-neutral-700";

export function TextField({
  label,
  name,
  defaultValue,
  required,
  disabled,
  type = "text",
  errors,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  required?: boolean;
  disabled?: boolean;
  type?: string;
  errors?: string[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue ?? undefined}
        required={required}
        disabled={disabled}
        aria-invalid={errors && errors.length > 0}
        className={inputClassName}
      />
      <FieldError messages={errors} />
    </div>
  );
}

export function TextAreaField({
  label,
  name,
  defaultValue,
  errors,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  errors?: string[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <textarea
        id={name}
        name={name}
        defaultValue={defaultValue ?? undefined}
        rows={3}
        className={inputClassName}
      />
      <FieldError messages={errors} />
    </div>
  );
}

export function CheckboxField({
  label,
  name,
  defaultChecked,
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
}) {
  return (
    <label htmlFor={name} className="flex items-center gap-2 text-sm">
      <input
        id={name}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-700"
      />
      {label}
    </label>
  );
}

export function SelectField({
  label,
  name,
  defaultValue,
  options,
  errors,
  disabled,
  placeholder = "—",
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  options: Array<{ value: string; label: string }>;
  errors?: string[];
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue ?? ""}
        disabled={disabled}
        aria-invalid={errors && errors.length > 0}
        className={selectClassName}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldError messages={errors} />
    </div>
  );
}
