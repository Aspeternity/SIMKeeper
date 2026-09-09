import "server-only";

import { sqlite } from "@/db";
import {
  DASHBOARD_MODULE_IDS,
  type DashboardModuleId,
  type DashboardPreferences,
  type DashboardSimOption,
  cloneDefaultDashboardPreferences,
} from "@/lib/dashboard-preferences-shared";

const SETTINGS_KEY = "dashboard_preferences_v1";
const FOCUSED_SIM_LIMIT = 6;

function isModuleId(value: unknown): value is DashboardModuleId {
  return typeof value === "string" && (DASHBOARD_MODULE_IDS as readonly string[]).includes(value);
}

function normalizePreferences(value: unknown): DashboardPreferences {
  const defaults = cloneDefaultDashboardPreferences();
  if (!value || typeof value !== "object") return defaults;

  const source = value as Partial<DashboardPreferences> & { modules?: unknown; focusedSimIds?: unknown };
  const seen = new Set<DashboardModuleId>();
  const modules: DashboardPreferences["modules"] = [];

  if (Array.isArray(source.modules)) {
    for (const item of source.modules) {
      if (!item || typeof item !== "object") continue;
      const candidate = item as { id?: unknown; visible?: unknown };
      if (!isModuleId(candidate.id) || seen.has(candidate.id)) continue;
      modules.push({ id: candidate.id, visible: candidate.visible !== false });
      seen.add(candidate.id);
    }
  }

  for (const id of DASHBOARD_MODULE_IDS) {
    if (!seen.has(id)) modules.push({ id, visible: true });
  }

  const horizonDays = source.horizonDays === 7 || source.horizonDays === 60 ? source.horizonDays : 30;
  const distributionLimit = source.distributionLimit === 3 || source.distributionLimit === 10 ? source.distributionLimit : 6;
  const focusedSimIds = Array.isArray(source.focusedSimIds)
    ? [...new Set(source.focusedSimIds.filter((id): id is number => Number.isInteger(id) && Number(id) > 0).map(Number))].slice(0, FOCUSED_SIM_LIMIT)
    : [];

  return {
    version: 1,
    modules,
    horizonDays,
    distributionLimit,
    focusedSimIds,
  };
}

export function getDashboardPreferences(): DashboardPreferences {
  const row = sqlite.prepare("SELECT value FROM settings WHERE key = ?").get(SETTINGS_KEY) as { value?: string } | undefined;
  if (!row?.value) return cloneDefaultDashboardPreferences();

  try {
    return normalizePreferences(JSON.parse(row.value));
  } catch {
    return cloneDefaultDashboardPreferences();
  }
}

export function saveDashboardPreferences(value: unknown): DashboardPreferences {
  const preferences = normalizePreferences(value);
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(SETTINGS_KEY, JSON.stringify(preferences), now);
  return preferences;
}

export function resetDashboardPreferences(): DashboardPreferences {
  sqlite.prepare("DELETE FROM settings WHERE key = ?").run(SETTINGS_KEY);
  return cloneDefaultDashboardPreferences();
}

export function getDashboardSimOptions(): DashboardSimOption[] {
  return sqlite.prepare(`
    SELECT s.id, s.label, s.phone_number AS phoneNumber, c.name AS carrierName, c.country
    FROM sim_cards s
    JOIN carriers c ON c.id = s.carrier_id
    WHERE s.status <> 'closed'
    ORDER BY c.country, c.name, s.label
  `).all() as DashboardSimOption[];
}
