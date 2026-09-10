import React from "react";
import { createPortal } from "react-dom";

/**
 * THE modal shell for Closed Calls — one portal, one backdrop, one close path.
 *
 * There used to be two of these: `RecordsDrillModal` and the customer-feedback dialog,
 * each with its own copy of the portal, the backdrop click-to-close, the stopPropagation
 * on the panel and the escape hatch for server-side rendering. Two copies meant two
 * chances for a modal to trap focus differently or to sit under a glassy card, and the
 * feedback one had already been portalled to `<body>` specifically because an ancestor
 * with `backdrop-filter` hijacks `position: fixed`.
 *
 * Portalled to `<body>` for that reason, and given its own `.ccModalBg` scope because a
 * portal renders OUTSIDE `.closedCalls` and would otherwise inherit none of the tokens.
 */
export function DrillModal({
  title,
  subtitle,
  narrow = false,
  onClose,
  closeDisabled = false,
  children,
  footer,
}: Readonly<{
  title: string;
  /** The scope line under the title: how many records, for which region and dates. */
  subtitle?: React.ReactNode;
  /** Form dialogs are narrow; record lists get the full width. */
  narrow?: boolean;
  onClose: () => void;
  /** Blocks backdrop / × / Escape while a save is in flight. */
  closeDisabled?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
}>) {
  // Escape closes it. Registered on the document because the panel does not hold focus
  // on open, so a key handler on the panel itself would never fire.
  React.useEffect(() => {
    if (closeDisabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [closeDisabled, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="ccModalBg"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !closeDisabled) onClose();
      }}
    >
      <div
        className={`ccModal${narrow ? " ccNarrow" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="ccMh">
          <div>
            <h3>{title}</h3>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button
            type="button"
            className="ccX"
            onClick={onClose}
            disabled={closeDisabled}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="ccMb">{children}</div>
        {footer ? <div className="ccMf">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
