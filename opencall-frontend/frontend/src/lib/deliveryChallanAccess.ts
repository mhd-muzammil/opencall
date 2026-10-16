// Who gets the Delivery Challan section. Kept out of page.tsx so the rule can be tested on
// its own; the sidebar button and the section panel both ask this one function.

/** The section key: the workspace view, and what a special-access login is granted. */
export const DELIVERY_CHALLAN_SECTION = "delivery-challans";

/**
 * The same rule as Quotations, with a key of its own: a SUPER_ADMIN always; a
 * special-access login only when the "delivery-challans" section is granted to it.
 * Region admins do not see it.
 */
export function canSeeDeliveryChallans({
  role,
  isSpecialAccess,
  canSeeSection,
}: Readonly<{
  role: string | null | undefined;
  isSpecialAccess: boolean;
  canSeeSection: (key: string) => boolean;
}>): boolean {
  return (
    (!isSpecialAccess && role === "SUPER_ADMIN") ||
    (isSpecialAccess && canSeeSection(DELIVERY_CHALLAN_SECTION))
  );
}
