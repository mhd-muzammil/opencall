"use client";

import { AppBar } from "../AppBar";
import { canSeeMobileSection, useMobileSession } from "../session";
import { RenewalPipelinePage } from "../../../features/dashboard/components/RenewalPipelinePage";

/**
 * Renewal Pipeline on the phone.
 *
 * Renders the DESKTOP component itself rather than a second implementation. The screen is a
 * worked list — warranty expiring, who has been called, what they said — and a salesperson
 * reading it on a phone and on a laptop must see the same rows in the same states. Two
 * implementations of "which leads are due this week" would drift, and the drift would show
 * up as a customer contacted twice or not at all.
 *
 * The wrapper gives it the mobile shell and lets a wide table scroll sideways instead of
 * stretching the page — the phone-specific part is the frame, not the content.
 */
export default function MobileRenewalPage() {
  const { session } = useMobileSession();
  const token = session?.token ?? "";
  const allowed = canSeeMobileSection(session, "renewal-pipeline");

  if (!session) return null;

  if (!allowed) {
    return (
      <>
        <AppBar title="Renewal Pipeline" back />
        <main className="mMain">
          <div className="mCard mMuted">
            This login does not have access to the Renewal Pipeline.
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <AppBar title="Renewal Pipeline" subtitle="AMC leads from warranty expiry" back />
      <main className="mMain">
        {/* minWidth:0 stops the grid child from growing to its content and scrolling the
            whole page sideways — the same fix the desktop panel needed. */}
        <div style={{ overflowX: "auto", minWidth: 0 }}>
          <RenewalPipelinePage token={token} />
        </div>
      </main>
    </>
  );
}
