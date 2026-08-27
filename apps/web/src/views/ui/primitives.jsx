/**
 * @file Presentational primitives shared by every screen.
 *
 * @module views/ui/primitives
 */

/** Visual variants a button can take. */
const BUTTON_VARIANTS = Object.freeze({
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-200',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-soft',
  danger: 'bg-bad text-white hover:opacity-90',
  ghost: 'text-ink-soft hover:bg-surface-soft',
});

/** Tone to colour mapping, shared by badges and status pills. */
const TONES = Object.freeze({
  pending: 'bg-warn-soft text-warn',
  progress: 'bg-info-soft text-info',
  success: 'bg-ok-soft text-ok',
  failure: 'bg-bad-soft text-bad',
  neutral: 'bg-surface-soft text-ink-soft',
});

/**
 * A button.
 *
 * The busy state disables the control as well as changing the label, because a
 * double-tapped Place Order is the one duplicate this system most wants to avoid
 * (UC-01 exception flow E1).
 *
 * @param {object} props - Component props.
 * @param {import('react').ReactNode} props.children - Button label.
 * @param {'primary' | 'secondary' | 'danger' | 'ghost'} [props.variant] - Visual style.
 * @param {boolean} [props.busy] - Show a working state and block further taps.
 * @param {boolean} [props.disabled] - Disable the button.
 * @param {boolean} [props.full] - Stretch to the container width.
 * @param {'button' | 'submit'} [props.type] - Native button type.
 * @param {() => void} [props.onClick] - Click handler.
 * @returns {import('react').ReactNode} The button.
 */
export function Button({
  children,
  variant = 'primary',
  busy = false,
  disabled = false,
  full = false,
  type = 'button',
  onClick,
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-70 ${BUTTON_VARIANTS[variant]} ${full ? 'w-full' : ''}`}
    >
      {busy ? <Spinner small /> : null}
      {children}
    </button>
  );
}

/**
 * A small status label.
 *
 * @param {object} props - Component props.
 * @param {import('react').ReactNode} props.children - Label text.
 * @param {'pending' | 'progress' | 'success' | 'failure' | 'neutral'} [props.tone] - Colour.
 * @returns {import('react').ReactNode} The badge.
 */
export function Badge({ children, tone = 'neutral' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * A bordered content panel.
 *
 * @param {object} props - Component props.
 * @param {import('react').ReactNode} props.children - Panel content.
 * @param {string} [props.title] - Optional heading.
 * @param {import('react').ReactNode} [props.action] - Control shown beside the heading.
 * @param {string} [props.className] - Extra classes.
 * @returns {import('react').ReactNode} The card.
 */
export function Card({ children, title, action, className = '' }) {
  return (
    <section className={`border-line bg-surface rounded-xl border p-4 sm:p-5 ${className}`}>
      {title || action ? (
        <header className="mb-3 flex items-center justify-between gap-3">
          {title ? <h2 className="text-base font-semibold">{title}</h2> : <span />}
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/**
 * A loading indicator.
 *
 * @param {object} props - Component props.
 * @param {boolean} [props.small] - Render at button size.
 * @param {string} [props.label] - Text shown beside the spinner.
 * @returns {import('react').ReactNode} The spinner.
 */
export function Spinner({ small = false, label }) {
  return (
    <span className="text-ink-soft inline-flex items-center gap-2" role="status">
      <span
        className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${small ? 'h-4 w-4' : 'h-6 w-6'}`}
      />
      {label ? <span className="text-sm">{label}</span> : null}
      <span className="sr-only">Loading</span>
    </span>
  );
}

/**
 * A message banner.
 *
 * @param {object} props - Component props.
 * @param {import('react').ReactNode} props.children - Message.
 * @param {'pending' | 'progress' | 'success' | 'failure' | 'neutral'} [props.tone] - Colour.
 * @param {import('react').ReactNode} [props.action] - Control shown at the end.
 * @returns {import('react').ReactNode} The banner, or nothing when there is no message.
 */
export function Alert({ children, tone = 'failure', action }) {
  if (!children) {
    return null;
  }
  return (
    <div
      role="alert"
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm ${TONES[tone]}`}
    >
      <span>{children}</span>
      {action}
    </div>
  );
}

/**
 * What a list shows when it has nothing in it.
 *
 * An empty state that explains itself is the difference between "there is nothing here
 * yet" and "this is broken" — and the second is what a blank page always looks like.
 *
 * @param {object} props - Component props.
 * @param {string} props.title - Headline.
 * @param {string} [props.hint] - What to do about it.
 * @param {import('react').ReactNode} [props.action] - Suggested next step.
 * @returns {import('react').ReactNode} The empty state.
 */
export function EmptyState({ title, hint, action }) {
  return (
    <div className="border-line rounded-xl border border-dashed px-6 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {hint ? <p className="text-ink-soft mt-1 text-sm">{hint}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

/**
 * An amount in taka.
 *
 * Formatting lives in one component so a price never appears with a different number of
 * decimal places on two screens.
 *
 * @param {object} props - Component props.
 * @param {number} props.amount - Amount in taka.
 * @param {boolean} [props.bold] - Emphasise the amount.
 * @returns {import('react').ReactNode} The formatted amount.
 */
export function Money({ amount, bold = false }) {
  const formatted = Number(amount ?? 0)
    .toFixed(2)
    .replace(/\.00$/, '');
  return <span className={bold ? 'font-semibold' : undefined}>৳{formatted}</span>;
}

/**
 * A page heading with an optional subtitle and action.
 *
 * @param {object} props - Component props.
 * @param {string} props.title - Page title.
 * @param {string} [props.subtitle] - Supporting line.
 * @param {import('react').ReactNode} [props.action] - Control shown on the right.
 * @returns {import('react').ReactNode} The header.
 */
export function PageHeader({ title, subtitle, action }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
        {subtitle ? <p className="text-ink-soft mt-1 text-sm">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

/**
 * A labelled figure, for a summary row.
 *
 * @param {object} props - Component props.
 * @param {string} props.label - What the figure measures.
 * @param {import('react').ReactNode} props.value - The figure.
 * @param {string} [props.hint] - Extra context.
 * @returns {import('react').ReactNode} The statistic.
 */
export function Stat({ label, value, hint }) {
  return (
    <div className="border-line bg-surface rounded-xl border p-4">
      <p className="text-ink-soft text-xs font-medium tracking-wide uppercase">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {hint ? <p className="text-ink-soft mt-1 text-xs">{hint}</p> : null}
    </div>
  );
}

/**
 * A confirmation dialog.
 *
 * @param {object} props - Component props.
 * @param {boolean} props.open - Whether the dialog is showing.
 * @param {string} props.title - Headline.
 * @param {import('react').ReactNode} props.children - Body.
 * @param {import('react').ReactNode} props.footer - Action buttons.
 * @param {() => void} props.onDismiss - Called when the backdrop is used to close it.
 * @returns {import('react').ReactNode} The dialog, or nothing when closed.
 */
export function Modal({ open, title, children, footer, onDismiss }) {
  if (!open) {
    return null;
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onDismiss}
        className="absolute inset-0 h-full w-full cursor-default"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="border-line bg-surface relative w-full max-w-md rounded-t-2xl border p-5 sm:rounded-2xl"
      >
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="text-ink-soft mt-2 text-sm">{children}</div>
        <div className="mt-5 flex justify-end gap-2">{footer}</div>
      </div>
    </div>
  );
}
