import { FieldError } from "./FormError";
import { NumericTextInput } from "./NumericTextInput";

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
  "h-[42px] rounded-lg border-[1.5px] border-neutral-300 bg-white px-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:bg-neutral-50 disabled:text-neutral-400 aria-[invalid=true]:border-red-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:disabled:bg-neutral-950 dark:aria-[invalid=true]:border-red-500";

// <select> gets its own token instead of reusing inputClassName's bg: a
// native select's dropdown popup is OS-rendered and doesn't follow the card
// background it sits on, so the closed box needs an explicit light surface
// (white/slate-900 text) that matches the select/option/optgroup rule in
// globals.css — otherwise the box and its own popup can show mismatched
// colors. Keep every disabled/focus/error utility class identical to
// inputClassName so shared behavior stays consistent between text and
// select fields.
export const selectClassName =
  "h-[42px] rounded-lg border-[1.5px] border-neutral-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:bg-slate-50 disabled:text-slate-400 aria-[invalid=true]:border-red-500 dark:border-neutral-700";

// Composite Rp-prefixed currency control — same outer border/radius/height
// as inputClassName, split into a muted prefix chip and a masked NumericTextInput.
// Displays "1.000.000" while typing; the paired hidden input (same `name`)
// still carries the raw digit string, so server-side parsing of the
// submitted form value is unchanged.
export function CurrencyField({
  label,
  name,
  defaultValue,
  required,
  disabled,
  errors,
}: {
  label: string;
  name: string;
  defaultValue?: number | null;
  required?: boolean;
  disabled?: boolean;
  errors?: string[];
}) {
  const hasError = !!errors && errors.length > 0;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
        {required ? <span className="text-red-600 dark:text-red-400"> *</span> : null}
      </label>
      <div
        className={`flex h-[42px] items-center overflow-hidden rounded-lg border-[1.5px] border-neutral-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/30 dark:border-neutral-700 ${
          hasError ? "border-red-500 dark:border-red-500" : ""
        } ${disabled ? "bg-neutral-50 dark:bg-neutral-950" : "bg-white dark:bg-neutral-900"}`}
      >
        <span className="flex h-full shrink-0 items-center border-r border-neutral-300 bg-neutral-100 px-3 text-sm font-semibold text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
          Rp
        </span>
        <NumericTextInput
          id={name}
          name={name}
          defaultValue={defaultValue}
          required={required}
          disabled={disabled}
          ariaInvalid={hasError}
          className="h-full flex-1 border-none bg-transparent px-3 text-sm text-neutral-900 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:text-neutral-400 dark:text-neutral-100"
        />
      </div>
      <FieldError messages={errors} />
    </div>
  );
}

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

// Labeled counterpart to TextField for non-currency numeric business fields
// (duration, quantity, etc.) — same layout, but the input is a masked
// NumericTextInput instead of a raw type="number" input, so "30" formats
// consistently with every other numeric field once values grow past 999.
export function NumericField({
  label,
  name,
  defaultValue,
  required,
  disabled,
  errors,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  required?: boolean;
  disabled?: boolean;
  errors?: string[];
}) {
  const hasError = !!errors && errors.length > 0;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <NumericTextInput
        id={name}
        name={name}
        defaultValue={defaultValue}
        required={required}
        disabled={disabled}
        ariaInvalid={hasError}
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
