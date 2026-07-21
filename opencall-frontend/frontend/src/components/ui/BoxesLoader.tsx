// 3D "boxes rolling onto a platform" loader (adapted from UIverse) rendered
// with plain global CSS — no styled-components. Styles live in globals.css
// under the .bxLoader* namespace, themed to the app accent.

/** The bare animation, ~200x230px. Place on a solid white surface: the roll-in
 *  edges are hidden by white mask panels, so a non-white backdrop shows seams. */
export function BoxesLoader() {
  return (
    <div className="bxLoader" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
        <div key={n} className={`bxBox bxBox${n}`}>
          <div />
        </div>
      ))}
      <div className="bxGround">
        <div />
      </div>
    </div>
  );
}

/**
 * Full-screen blocking overlay for long operations (report generation, upload
 * processing). Mount only while busy; it fades in after ~250ms so quick
 * actions never flash it.
 */
export function BusyOverlay({
  label = "Preparing your report…",
  sublabel = "Crunching the day's records",
}: Readonly<{ label?: string; sublabel?: string }>) {
  return (
    <div className="busyOverlay" role="status" aria-live="polite">
      <div className="busyOverlayCard">
        <BoxesLoader />
        <strong className="busyOverlayLabel">{label}</strong>
        <span className="busyOverlaySublabel">{sublabel}</span>
      </div>
    </div>
  );
}
