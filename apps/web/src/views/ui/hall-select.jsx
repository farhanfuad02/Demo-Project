'use client';

/**
 * @file Gender and hall pickers, bound to the shared hall lists.
 *
 * @module views/ui/hall-select
 */

import { GENDER } from '@hungry-ju/shared/enums';
import { hallsForGender } from '@hungry-ju/shared/halls';
import { Select } from './form.jsx';

/** The two choices, labelled for display. */
const GENDER_OPTIONS = Object.freeze([
  { value: '', label: 'Select…' },
  { value: GENDER.MALE, label: 'Male' },
  { value: GENDER.FEMALE, label: 'Female' },
]);

/**
 * A gender picker.
 *
 * It is asked for because the halls are gender-segregated and not for its own sake, which
 * is why it sits next to the hall everywhere it appears rather than among the identity
 * fields.
 *
 * @param {object} props - Component props.
 * @param {string} props.id - Control id, supplied by `Field`.
 * @param {string} props.value - Current gender.
 * @param {(value: string) => void} props.onChange - Called with the new gender.
 * @param {string} [props.name] - Field name.
 * @returns {import('react').ReactNode} The select.
 */
export function GenderSelect({ id, value, onChange, name = 'gender' }) {
  return <Select id={id} name={name} value={value} onChange={onChange} options={GENDER_OPTIONS} />;
}

/**
 * A hall picker showing only the halls the given gender may live in.
 *
 * Both lists come from `@hungry-ju/shared/halls`, which is the same module the API's
 * validators read, so the dropdown cannot offer a hall the server would refuse. Until a
 * gender is chosen the control is disabled with a prompt rather than empty: an empty
 * dropdown looks broken, while "choose your gender first" says what to do about it.
 *
 * @param {object} props - Component props.
 * @param {string} props.id - Control id, supplied by `Field`.
 * @param {string} props.value - Current hall code.
 * @param {(value: string) => void} props.onChange - Called with the new hall code.
 * @param {string | null} [props.gender] - Gender whose halls to offer.
 * @param {string} [props.name] - Field name.
 * @returns {import('react').ReactNode} The select.
 */
export function HallSelect({ id, value, onChange, gender = null, name = 'hallName' }) {
  const halls = hallsForGender(gender);

  if (halls.length === 0) {
    return (
      <Select
        id={id}
        name={name}
        value=""
        onChange={onChange}
        options={[{ value: '', label: 'Choose your gender first' }]}
      />
    );
  }

  return (
    <Select
      id={id}
      name={name}
      value={value}
      onChange={onChange}
      options={[
        { value: '', label: 'Select…' },
        ...halls.map((hall) => ({ value: hall, label: hall })),
      ]}
    />
  );
}
