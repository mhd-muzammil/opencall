"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import "./mobile.css";
import { clearSession, readSession, type ClientSession } from "../../lib/session";
import { MobileSessionContext, canSeeMobileSection } from "./session";

/**
 * Mobile app shell (/m). Completely separate from the desktop web pages — this layout
 * owns its own stylesheet, so nothing here can affect the existing web UI.
 *
 * The APK is a thin Capacitor shell that loads this route, which is why a web deploy
 * updates the app instantly: the app has no bundled UI of its own.
 */

interface Tab {
  href: string;
  label: string;
  icon: string;
  /** Section key this tab needs; undefined = always visible. */
  section?: string;
}

const TABS: Tab[] = [
  { href: "/m", label: "Home", icon: "🏠" },
  { href: "/m/records", label: "Records", icon: "📋", section: "records" },
  { href: "/m/closed", label: "Closed", icon: "📁", section: "closed-calls" },
  { href: "/m/more", label: "More", icon: "⋯" },
];

export default function MobileLayout({ children }: Readonly<{ children: ReactNode }>) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<ClientSession | null>(null);
  const [loaded, setLoaded] = useState(false);

  const isLoginRoute = pathname === "/m/login";

  useEffect(() => {
    const s = readSession();
    setSession(s);
    setLoaded(true);
    if (!s && !isLoginRoute) {
      router.replace("/m/login");
    }
  }, [router, isLoginRoute]);

  const visibleTabs = useMemo(
    () => TABS.filter((t) => !t.section || canSeeMobileSection(session, t.section)),
    [session],
  );

  const contextValue = useMemo(
    () => ({
      session,
      signOut: () => {
        clearSession();
        setSession(null);
        router.replace("/m/login");
      },
      refreshSession: () => setSession(readSession()),
    }),
    [session, router],
  );

  if (!loaded) {
    return (
      <div className="mApp">
        <div className="mCenter">
          <div>
            <div className="mSpinner" />
            <div className="mMuted">Loading…</div>
          </div>
        </div>
      </div>
    );
  }

  // The login screen renders on its own, with no app bar or tabs.
  if (isLoginRoute) {
    return (
      <div className="mApp">
        <MobileSessionContext.Provider value={contextValue}>
          {children}
        </MobileSessionContext.Provider>
      </div>
    );
  }

  if (!session) {
    return null; // redirecting to /m/login
  }

  return (
    <div className="mApp">
      <MobileSessionContext.Provider value={contextValue}>
        {children}
        <nav className="mTabBar" aria-label="Main">
          {visibleTabs.map((tab) => {
            const active =
              tab.href === "/m" ? pathname === "/m" : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`mTab ${active ? "mTab--active" : ""}`}
              >
                <span className="mTab__icon" aria-hidden="true">{tab.icon}</span>
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </nav>
      </MobileSessionContext.Provider>
    </div>
  );
}
