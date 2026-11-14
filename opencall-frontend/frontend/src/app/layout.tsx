import type { Metadata } from "next";
import "./globals.css";
import { ClientLocationWatcher } from "../components/ClientLocationWatcher";

export const metadata: Metadata = {
  title: "OpenCall Daily Call Plan",
  description: "Daily Call Plan operations dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ClientLocationWatcher />
        {children}
      </body>
    </html>
  );
}
