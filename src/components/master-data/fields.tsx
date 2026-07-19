import { FieldError } from "./FormError";

const inputClassName =
  "rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:border-neutral-700";

export function TextField({
  label,
  name,
  defaultValue,
  required,
  type = "text",
  errors,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  required?: boolean;
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
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  options: Array<{ value: string; label: string }>;
  errors?: string[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <select id={name} name={name} defaultValue={defaultValue ?? ""} className={inputClassName}>
        <option value="">—</option>
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
