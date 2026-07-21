// Neutral foundation-stage branding. Do not hardcode PT Gamatara or any
// other legal entity name here — the design-partner identity is business
// context, not application branding.
export const branding = {
  productName: "ADOP",
  subtitle: "AI Dockyard Operating Platform",
  // Sidebar identity (authenticated shell): rendered as `${productName}
  // ${brandedBy}` — "ADOP by CHAMELONIX".
  brandedBy: "by CHAMELONIX",
  // Login/application footer (public, pre-auth pages): a distinct locked
  // string from brandedBy above, not a recombination of it.
  poweredByLabel: "Powered by CHAMELONIX",
  statusLabel: "Foundation Environment",
} as const;
