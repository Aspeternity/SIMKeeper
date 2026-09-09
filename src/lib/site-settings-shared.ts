export const DEFAULT_SITE_NAME = "SIMKeeper";
export const DEFAULT_SITE_DESCRIPTION = "Self-hosted SIM & eSIM lifecycle manager";
export const MAX_SITE_NAME_LENGTH = 40;
export const MAX_SITE_DESCRIPTION_LENGTH = 120;
export const MAX_SITE_LOGO_BYTES = 1024 * 1024;
export const SITE_LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const SITE_ACCENT_COLORS = ["indigo", "blue", "teal", "emerald", "violet"] as const;

export type SiteAccentColor = (typeof SITE_ACCENT_COLORS)[number];
export const DEFAULT_SITE_ACCENT_COLOR: SiteAccentColor = "indigo";

export type SiteSettings = {
  siteName: string;
  siteDescription: string;
  accentColor: SiteAccentColor;
  hasLogo: boolean;
  logoUrl: string | null;
  logoUpdatedAt: string | null;
};
