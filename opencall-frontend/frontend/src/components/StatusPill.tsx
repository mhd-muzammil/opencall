export type StatusTone = "good" | "warn" | "bad" | "neutral";

export function StatusPill({
  tone,
  children,
}: Readonly<{
  tone: StatusTone;
  children: React.ReactNode;
}>) {
  return <span className={`statusPill ${tone}`}>{children}</span>;
}
