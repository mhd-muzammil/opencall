"use client";

import { AppBar } from "../AppBar";
import { isSuperAdminSession, useMobileSession } from "../session";
import { VendorDashboard } from "../../../features/dashboard/components/VendorDashboard";

/**
 * Vendor Dashboard on the phone.
 *
 * The desktop component again, for the same reason as the Renewal Pipeline: this is where
 * vendor logins are created and cases assigned to them, and a second implementation of who
 * may see what would eventually disagree with the first.
 *
 * `report` is null here. The desktop passes the report it already has loaded so the
 * dashboard can show case counts without re-fetching; the mobile shell holds no report, and
 * the component treats null as "not loaded yet" rather than as an error.
 *
 * Super Admin only, matching the desktop — the sidebar entry there is inside the
 * super-admin-only block.
 */
export default function MobileVendorPage() {
  const { session } = useMobileSession();
  const token = session?.token ?? "";

  if (!session) return null;

  if (!isSuperAdminSession(session)) {
    return (
      <>
        <AppBar title="Vendor Dashboard" back />
        <main className="mMain">
          <div className="mCard mMuted">Only a Super Admin can open the Vendor Dashboard.</div>
        </main>
      </>
    );
  }

  return (
    <>
      <AppBar title="Vendor Dashboard" subtitle="Vendor access and case assignment" back />
      <main className="mMain">
        <div style={{ overflowX: "auto", minWidth: 0 }}>
          <VendorDashboard token={token} report={null} />
        </div>
      </main>
    </>
  );
}
