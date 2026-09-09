import "server-only";

import { sqlite } from "@/db";
import {
  DEFAULT_SITE_DESCRIPTION,
  DEFAULT_SITE_NAME,
  MAX_SITE_DESCRIPTION_LENGTH,
  MAX_SITE_LOGO_BYTES,
  MAX_SITE_NAME_LENGTH,
  SITE_LOGO_MIME_TYPES,
  type SiteSettings,
} from "@/lib/site-settings-shared";

const SETTINGS_KEY = "site_settings_v1";

type StoredSiteSettings = {
  version: 1;
  siteName: string;
  siteDescription: string;
  logoMimeType: string | null;
  logoBase64: string | null;
  logoUpdatedAt: string | null;
};

type SiteLogoUpdate = {
  mimeType: string;
  base64: string;
};

function defaultStoredSettings(): StoredSiteSettings {
  return {
    version: 1,
    siteName: DEFAULT_SITE_NAME,
    siteDescription: DEFAULT_SITE_DESCRIPTION,
    logoMimeType: null,
    logoBase64: null,
    logoUpdatedAt: null,
  };
}

function normalizeStoredSettings(value: unknown): StoredSiteSettings {
  const defaults = defaultStoredSettings();
  if (!value || typeof value !== "object") return defaults;

  const source = value as Partial<StoredSiteSettings>;
  const siteName = typeof source.siteName === "string" && source.siteName.trim()
    ? source.siteName.trim().slice(0, MAX_SITE_NAME_LENGTH)
    : DEFAULT_SITE_NAME;
  const siteDescription = typeof source.siteDescription === "string"
    ? source.siteDescription.trim().slice(0, MAX_SITE_DESCRIPTION_LENGTH)
    : DEFAULT_SITE_DESCRIPTION;
  const logoMimeType = typeof source.logoMimeType === "string" && SITE_LOGO_MIME_TYPES.includes(source.logoMimeType as (typeof SITE_LOGO_MIME_TYPES)[number])
    ? source.logoMimeType
    : null;
  const logoBase64 = logoMimeType && typeof source.logoBase64 === "string" && source.logoBase64.length > 0
    ? source.logoBase64
    : null;
  const logoUpdatedAt = logoBase64 && typeof source.logoUpdatedAt === "string" ? source.logoUpdatedAt : null;

  return {
    version: 1,
    siteName,
    siteDescription,
    logoMimeType: logoBase64 ? logoMimeType : null,
    logoBase64,
    logoUpdatedAt,
  };
}

function readStoredSettings(): StoredSiteSettings {
  const row = sqlite.prepare("SELECT value FROM settings WHERE key = ?").get(SETTINGS_KEY) as { value?: string } | undefined;
  if (!row?.value) return defaultStoredSettings();

  try {
    return normalizeStoredSettings(JSON.parse(row.value));
  } catch {
    return defaultStoredSettings();
  }
}

function toPublicSettings(value: StoredSiteSettings): SiteSettings {
  const hasLogo = Boolean(value.logoMimeType && value.logoBase64);
  return {
    siteName: value.siteName,
    siteDescription: value.siteDescription,
    hasLogo,
    logoUrl: hasLogo ? `/api/site-branding/logo?v=${encodeURIComponent(value.logoUpdatedAt || "1")}` : null,
    logoUpdatedAt: hasLogo ? value.logoUpdatedAt : null,
  };
}

export function getSiteSettings(): SiteSettings {
  return toPublicSettings(readStoredSettings());
}

export function getSiteLogo() {
  const value = readStoredSettings();
  if (!value.logoMimeType || !value.logoBase64) return null;

  try {
    const bytes = Buffer.from(value.logoBase64, "base64");
    if (!bytes.length || bytes.length > MAX_SITE_LOGO_BYTES) return null;
    return {
      bytes,
      mimeType: value.logoMimeType,
      updatedAt: value.logoUpdatedAt,
    };
  } catch {
    return null;
  }
}

export function saveSiteSettings(input: {
  siteName: string;
  siteDescription: string;
  logo?: SiteLogoUpdate | null;
}): SiteSettings {
  const current = readStoredSettings();
  const now = new Date().toISOString();
  const next: StoredSiteSettings = {
    ...current,
    siteName: input.siteName.trim().slice(0, MAX_SITE_NAME_LENGTH) || DEFAULT_SITE_NAME,
    siteDescription: input.siteDescription.trim().slice(0, MAX_SITE_DESCRIPTION_LENGTH),
  };

  if (input.logo === null) {
    next.logoMimeType = null;
    next.logoBase64 = null;
    next.logoUpdatedAt = null;
  } else if (input.logo) {
    next.logoMimeType = input.logo.mimeType;
    next.logoBase64 = input.logo.base64;
    next.logoUpdatedAt = now;
  }

  sqlite
    .prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(SETTINGS_KEY, JSON.stringify(next), now);

  return toPublicSettings(next);
}
