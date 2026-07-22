"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Top app bar for mobile screens. `back` turns the leading slot into a back button;
 * `action` renders a trailing control (e.g. refresh, filter).
 */
export function AppBar({
  title,
  subtitle,
  back = false,
  action,
}: Readonly<{
  title: string;
  subtitle?: string | undefined;
  back?: boolean;
  action?: ReactNode;
}>) {
  const router = useRouter();

  return (
    <header className="mAppBar">
      {back && (
        <button
          type="button"
          className="mIconBtn"
          aria-label="Back"
          onClick={() => router.back()}
        >
          ←
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="mAppBar__title">{title}</div>
        {subtitle && <div className="mAppBar__sub">{subtitle}</div>}
      </div>
      {action}
    </header>
  );
}
