"use client";

import { useLayoutEffect, useRef } from "react";
import { formatThousands, sanitizeDigits } from "@/lib/format/numeric-input";

// Moves the caret to sit after the same digit it followed before
// reformatting — otherwise inserting a separator mid-type would bounce the
// caret to the end of the field on every keystroke.
function restoreCaret(input: HTMLInputElement, digitsBeforeCaret: number) {
  const formatted = input.value;
  if (digitsBeforeCaret <= 0) {
    input.setSelectionRange(0, 0);
    return;
  }
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (formatted[i] >= "0" && formatted[i] <= "9") {
      seen++;
      if (seen === digitsBeforeCaret) {
        input.setSelectionRange(i + 1, i + 1);
        return;
      }
    }
  }
  input.setSelectionRange(formatted.length, formatted.length);
}

// Uncontrolled masked number input: displays "1.000.000" while typing,
// pasting, or deleting, but the paired hidden input (same `name`) always
// carries the raw digit string a server action's FormData.get(name) expects
// — no dots ever reach the schema/server. Reformatting happens imperatively
// on the DOM node instead of through React state, so React 19's automatic
// uncontrolled-form reset after a successful action still clears this field
// exactly like the native type="number" input it replaces.
export function NumericTextInput({
  id,
  name,
  defaultValue,
  required,
  disabled,
  placeholder,
  ariaLabel,
  ariaInvalid,
  className,
}: {
  id?: string;
  name: string;
  defaultValue?: number | string | null;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  ariaInvalid?: boolean;
  className?: string;
}) {
  const initialDigits = sanitizeDigits(String(defaultValue ?? ""));

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const caret = input.selectionStart ?? input.value.length;
    const digitsBeforeCaret = sanitizeDigits(input.value.slice(0, caret)).length;
    const digits = sanitizeDigits(input.value);

    input.value = formatThousands(digits);
    restoreCaret(input, digitsBeforeCaret);

    const hidden = input.nextElementSibling as HTMLInputElement | null;
    if (hidden && hidden.name === name) {
      hidden.value = digits;
    }
  }

  return (
    <>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        defaultValue={formatThousands(initialDigits)}
        onChange={handleChange}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        required={required}
        disabled={disabled}
        className={className}
      />
      <input type="hidden" name={name} defaultValue={initialDigits} />
    </>
  );
}

// Controlled variant for the rare caller that needs the raw value lifted
// into its own React state (e.g. a review-before-submit step that re-renders
// the typed amount elsewhere on screen). Same formatting/caret behavior as
// NumericTextInput, just driven by props instead of the DOM.
export function NumericTextInputControlled({
  id,
  rawValue,
  onRawValueChange,
  required,
  disabled,
  placeholder,
  ariaLabel,
  className,
}: {
  id?: string;
  rawValue: string;
  onRawValueChange: (digits: string) => void;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaretDigitsRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const input = inputRef.current;
    const digitsBeforeCaret = pendingCaretDigitsRef.current;
    if (!input || digitsBeforeCaret === null) return;
    pendingCaretDigitsRef.current = null;
    restoreCaret(input, digitsBeforeCaret);
  });

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const caret = input.selectionStart ?? input.value.length;
    pendingCaretDigitsRef.current = sanitizeDigits(input.value.slice(0, caret)).length;
    onRawValueChange(sanitizeDigits(input.value));
  }

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={formatThousands(rawValue)}
      onChange={handleChange}
      placeholder={placeholder}
      aria-label={ariaLabel}
      required={required}
      disabled={disabled}
      className={className}
    />
  );
}
