"use client";

import { AppBar } from "../AppBar";
import { isSuperAdminSession, useMobileSession } from "../session";
import { AdminRtplStatusesManager } from "../../../components/AdminRtplStatusesManager";

/**
 * RTPL Statuses on the phone.
 *
 * The desktop manager itself. These statuses are the vocabulary every other screen reads —
 * the dashboards group by them, the records table offers them in its dropdown — so there
 * must be exactly one place they are defined. A parallel editor would let the same status
 * exist twice under two spellings.
 *
 * The component reads its own session, so no token is threaded in; it is mounted here only
 * once the mobile shell has confirmed a Super Admin, matching the desktop, where the
 * sidebar entry sits inside the super-admin-only block.
 */
export default function MobileRtplStatusesPage() {
  const { session } = useMobileSession();

  if (!session) return null;

  if (!isSuperAdminSession(session)) {
    return (
      <>
        <AppBar title="RTPL Statuses" back />
        <main className="mMain">
          <div className="mCard mMuted">Only a Super Admin can manage RTPL statuses.</div>
        </main>
      </>
    );
  }

  return (
    <>
      <AppBar title="RTPL Statuses" subtitle="Status list used across the app" back />
      <main className="mMain">
        <div style={{ overflowX: "auto", minWidth: 0 }}>
          <AdminRtplStatusesManager />
        </div>
      </main>
    </>
  );
}
