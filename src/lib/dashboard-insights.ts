import "server-only";

import { sqlite } from "@/db";

type AssetRow = {
  id: number;
  label: string;
  phone_number: string | null;
  status: string;
  sim_type: string;
  device_id: number | null;
  carrier_id: number;
  carrier_name: string;
  country: string;
  country_code: string;
};

type IdRow = { sim_id: number };
type CountRow = { count: number };

type RecentActivityRow = {
  id: number;
  sim_id: number;
  sim_label: string;
  phone_number: string | null;
  carrier_name: string;
  activity_type: string;
  activity_date: string;
  amount: number | null;
  currency_code: string | null;
  balance_after: number | null;
  valid_until_after: string | null;
};

export type DashboardDistributionItem = {
  key: string;
  label: string;
  count: number;
};

export type DashboardRecentActivity = {
  id: number;
  simId: number;
  simLabel: string;
  phoneNumber: string | null;
  carrierName: string;
  activityType: string;
  activityDate: string;
  amount: number | null;
  currencyCode: string | null;
  balanceAfter: number | null;
  validUntilAfter: string | null;
};

export type DashboardInsights = {
  asset: {
    physical: number;
    esim: number;
    active: number;
    paused: number;
    expired: number;
    inactive: number;
    countries: number;
    carriers: number;
    assignedDevices: number;
    unassignedDevices: number;
    boundServices: number;
    enabledRules: number;
  };
  configuration: {
    noKeepAliveRule: number;
    noBoundService: number;
    unassignedDevice: number;
    missingPhoneNumber: number;
  };
  countryDistribution: DashboardDistributionItem[];
  carrierDistribution: DashboardDistributionItem[];
  recentActivities: DashboardRecentActivity[];
};

function distribution(rows: AssetRow[], keyOf: (row: AssetRow) => string, labelOf: (row: AssetRow) => string) {
  const values = new Map<string, DashboardDistributionItem>();
  for (const row of rows) {
    const key = keyOf(row);
    const current = values.get(key);
    if (current) current.count += 1;
    else values.set(key, { key, label: labelOf(row), count: 1 });
  }
  return [...values.values()].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "zh-CN"));
}

export function getDashboardInsights(): DashboardInsights {
  const sims = sqlite.prepare(`
    SELECT s.id, s.label, s.phone_number, s.status, s.sim_type, s.device_id, s.carrier_id,
           c.name AS carrier_name, c.country, c.country_code
    FROM sim_cards s
    JOIN carriers c ON c.id = s.carrier_id
    ORDER BY s.id
  `).all() as AssetRow[];

  const managed = sims.filter((sim) => sim.status !== "closed");
  const ruleSimIds = new Set(
    (sqlite.prepare("SELECT DISTINCT sim_id FROM sim_keep_alive_rules WHERE enabled = 1").all() as IdRow[]).map((row) => row.sim_id),
  );
  const serviceSimIds = new Set(
    (sqlite.prepare("SELECT DISTINCT sim_id FROM sim_bound_services").all() as IdRow[]).map((row) => row.sim_id),
  );
  const boundServices = (sqlite.prepare("SELECT COUNT(*) AS count FROM sim_bound_services").get() as CountRow).count;
  const enabledRules = (sqlite.prepare("SELECT COUNT(*) AS count FROM sim_keep_alive_rules WHERE enabled = 1").get() as CountRow).count;

  const recentRows = sqlite.prepare(`
    SELECT e.id, e.sim_id, s.label AS sim_label, s.phone_number, c.name AS carrier_name,
           e.activity_type, e.activity_date, e.amount, e.currency_code, e.balance_after, e.valid_until_after
    FROM sim_keep_alive_events e
    JOIN sim_cards s ON s.id = e.sim_id
    JOIN carriers c ON c.id = s.carrier_id
    ORDER BY e.activity_date DESC, e.created_at DESC, e.id DESC
    LIMIT 6
  `).all() as RecentActivityRow[];

  return {
    asset: {
      physical: managed.filter((sim) => sim.sim_type === "physical").length,
      esim: managed.filter((sim) => sim.sim_type === "esim").length,
      active: sims.filter((sim) => sim.status === "active").length,
      paused: sims.filter((sim) => sim.status === "paused").length,
      expired: sims.filter((sim) => sim.status === "expired").length,
      inactive: sims.filter((sim) => sim.status === "closed").length,
      countries: new Set(managed.map((sim) => sim.country_code.toUpperCase())).size,
      carriers: new Set(managed.map((sim) => sim.carrier_id)).size,
      assignedDevices: managed.filter((sim) => sim.device_id !== null).length,
      unassignedDevices: managed.filter((sim) => sim.device_id === null).length,
      boundServices,
      enabledRules,
    },
    configuration: {
      noKeepAliveRule: managed.filter((sim) => !ruleSimIds.has(sim.id)).length,
      noBoundService: managed.filter((sim) => !serviceSimIds.has(sim.id)).length,
      unassignedDevice: managed.filter((sim) => sim.device_id === null).length,
      missingPhoneNumber: managed.filter((sim) => !sim.phone_number?.trim()).length,
    },
    countryDistribution: distribution(managed, (sim) => sim.country_code.toUpperCase(), (sim) => sim.country).slice(0, 6),
    carrierDistribution: distribution(managed, (sim) => String(sim.carrier_id), (sim) => sim.carrier_name).slice(0, 6),
    recentActivities: recentRows.map((row) => ({
      id: row.id,
      simId: row.sim_id,
      simLabel: row.sim_label,
      phoneNumber: row.phone_number,
      carrierName: row.carrier_name,
      activityType: row.activity_type,
      activityDate: row.activity_date,
      amount: row.amount,
      currencyCode: row.currency_code,
      balanceAfter: row.balance_after,
      validUntilAfter: row.valid_until_after,
    })),
  };
}
