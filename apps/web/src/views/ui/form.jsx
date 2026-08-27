/**
 * @file Form controls.
 *
 * @module views/ui/form
 */

import { useId } from 'react';

/** Classes shared by every text-like control, so they line up on a narrow screen. */
const CONTROL =
  'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none placeholder:text-ink-soft focus:border-brand-500';

/**
 * A labelled field wrapper.
 *
 * The label, the hint, and the error are wired to the control by id rather than by
 * proximity, so a screen reader announces why a field was rejected instead of leaving
 * the message stranded as decoration.
 *
 * @param {object} props - Component props.
 * @param {string} props.label - Field label.
 * @param {(id: string) => import('react').ReactNode} props.children - Renders the control.
 * @param {string} [props.hint] - Supporting text.
 * @param {string} [props.error] - Validation message.
 * @param {boolean} [props.required] - Mark the field as required.
 * @returns {import('react').ReactNode} The field.
 */
export function Field({ label, children, hint, error, required = false }) {
  const id = useId();
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
        {required ? <span className="text-bad ml-0.5">*</span> : null}
      </label>
      {children(id)}
      {error ? (
        <p className="text-bad mt-1 text-xs" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-ink-soft mt-1 text-xs">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * A text input.
 *
 * @param {object} props - Component props.
 * @param {string} props.id - Control id, supplied by {@link Field}.
 * @param {string} props.name - Field name.
 * @param {string} props.value - Current value.
 * @param {(value: string) => void} props.onChange - Called with the new value.
 * @param {string} [props.type] - Input type.
 * @param {string} [props.placeholder] - Placeholder text.
 * @param {boolean} [props.required] - Mark as required.
 * @param {string} [props.autoComplete] - Autofill hint.
 * @param {string} [props.inputMode] - On-screen keyboard hint.
 * @returns {import('react').ReactNode} The input.
 */
export function Input({
  id,
  name,
  value,
  onChange,
  type = 'text',
  placeholder,
  required = false,
  autoComplete,
  inputMode,
}) {
  return (
    <input
      id={id}
      name={name}
      type={type}
      value={value ?? ''}
      placeholder={placeholder}
      required={required}
      autoComplete={autoComplete}
      inputMode={inputMode}
      onChange={(event) => onChange(event.target.value)}
      className={CONTROL}
    />
  );
}

/**
 * A multi-line text input.
 *
 * @param {object} props - Component props.
 * @param {string} props.id - Control id, supplied by {@link Field}.
 * @param {string} props.name - Field name.
 * @param {string} props.value - Current value.
 * @param {(value: string) => void} props.onChange - Called with the new value.
 * @param {string} [props.placeholder] - Placeholder text.
 * @param {number} [props.rows] - Visible rows.
 * @returns {import('react').ReactNode} The textarea.
 */
export function Textarea({ id, name, value, onChange, placeholder, rows = 3 }) {
  return (
    <textarea
      id={id}
      name={name}
      rows={rows}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className={CONTROL}
    />
  );
}

/**
 * A dropdown.
 *
 * @param {object} props - Component props.
 * @param {string} props.id - Control id, supplied by {@link Field}.
 * @param {string} props.name - Field name.
 * @param {string} props.value - Current value.
 * @param {(value: string) => void} props.onChange - Called with the new value.
 * @param {Array<{ value: string, label: string }>} props.options - Available choices.
 * @returns {import('react').ReactNode} The select.
 */
export function Select({ id, name, value, onChange, options }) {
  return (
    <select
      id={id}
      name={name}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
      className={CONTROL}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/**
 * A labelled switch.
 *
 * @param {object} props - Component props.
 * @param {string} props.label - What the switch controls.
 * @param {boolean} props.checked - Current state.
 * @param {(checked: boolean) => void} props.onChange - Called with the new state.
 * @param {string} [props.hint] - Supporting text.
 * @param {boolean} [props.disabled] - Disable the switch.
 * @returns {import('react').ReactNode} The toggle.
 */
export function Toggle({ label, checked, onChange, hint, disabled = false }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={Boolean(checked)}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-brand-600 mt-0.5 h-5 w-5 shrink-0"
      />
      <span>
        <span className="text-sm font-medium">{label}</span>
        {hint ? <span className="text-ink-soft block text-xs">{hint}</span> : null}
      </span>
    </label>
  );
}

/**
 * A quantity stepper.
 *
 * Plus and minus rather than a number input: on a phone this is the difference between
 * one tap and summoning a numeric keyboard to change two items into three (NFR-09).
 *
 * @param {object} props - Component props.
 * @param {number} props.value - Current quantity.
 * @param {(value: number) => void} props.onChange - Called with the new quantity.
 * @param {number} [props.min] - Smallest allowed value.
 * @param {number} [props.max] - Largest allowed value.
 * @param {boolean} [props.busy] - Disable while a change is in flight.
 * @param {string} [props.label] - Accessible name for the group.
 * @returns {import('react').ReactNode} The stepper.
 */
export function QuantityStepper({
  value,
  onChange,
  min = 0,
  max = 50,
  busy = false,
  label = 'Quantity',
}) {
  return (
    <div className="border-line inline-flex items-center rounded-lg border" aria-label={label}>
      <button
        type="button"
        aria-label="Decrease quantity"
        disabled={busy || value <= min}
        onClick={() => onChange(value - 1)}
        className="px-3 py-1.5 text-lg leading-none disabled:opacity-40"
      >
        −
      </button>
      <span className="min-w-8 text-center text-sm font-semibold" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        aria-label="Increase quantity"
        disabled={busy || value >= max}
        onClick={() => onChange(value + 1)}
        className="px-3 py-1.5 text-lg leading-none disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}
