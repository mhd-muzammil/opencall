import type { ReportHistorySession } from "../lib/apiClient";
import { ReportHistoryPanel } from "./ReportHistoryPanel";

export function HistoryDrawer({
  isOpen,
  sessions,
  onClose,
  onOpen,
  onRename,
  onDelete,
}: Readonly<{
  isOpen: boolean;
  sessions: ReportHistorySession[];
  onClose: () => void;
  onOpen: (session: ReportHistorySession) => void;
  onRename: (session: ReportHistorySession, newTitle: string) => void;
  onDelete: (session: ReportHistorySession) => void;
}>) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="drawerOverlay" role="presentation" onMouseDown={onClose}>
      <aside
        className="opsDrawer historyDrawer"
        aria-label="Report history"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="drawerHeader compact">
          <div>
            <p className="eyebrow">Sessions</p>
            <h2>History</h2>
          </div>
          <button className="secondaryButton drawerClose" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <ReportHistoryPanel
          sessions={sessions}
          onOpen={onOpen}
          onRename={onRename}
          onDelete={onDelete}
        />
      </aside>
    </div>
  );
}
