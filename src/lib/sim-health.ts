import "server-only";

import { sqlite } from "@/db";
import { listCarrierConnectors } from "@/lib/carrier-connectors/store";
import { getConnectorAccountStatusLabel, getConnectorHealthStatusLabel } from "@/lib/carrier-connectors/types";
import { getRawUnifiedReminderItems } from "@/lib/current-reminders";
import { getLifecycleToday } from "@/lib/lifecycle-engine";
import { getReminderRelativeLabel, getReminderTaskHref, type ReminderItem } from "@/lib/reminders";
import {
  getSimHealthStatusLabel,
  type SimHealthItem,
  type SimHealthOverview,
  type SimHealthReason,
  type SimHealthReasonSeverity,
  type SimHealthStatus,
} from "@/lib/sim-health-types";

type SimHealthRow = {
  id: number;
  label: string;
  phone_number: string | null;
  status: string;
  balance_updated_at: string | null;
  updated_at: string | null;
  carrier_name: string;
  country: string;
};

type RankedReason = SimHealthReason & { rank: number };

const statusRank: Record<SimHealthStatus, number> = {
  critical: 0,
  attention: 1,
  setup: 2,
  healthy: 3,
  paused: 4,
  inactive: 5,
};

const reasonSeverityRank: Record<SimHealthReasonSeverity, number> = {
  critical: 0,
  attention: 1,
  setup: 2,
};

function addReason(store: Map<number, RankedReason[]>, simId: number, reason: RankedReason) {
  const current = store.get(simId) ?? [];
  const existingIndex = current.findIndex((item) => item.key === reason.key);
  if (existingIndex >= 0) current[existingIndex] = reason;
  else current.push(reason);
  store.set(simId, current);
}

function reminderSeverity(reminder: ReminderItem): SimHealthReasonSeverity {
  if (reminder.status === "unscheduled") return "setup";
  if (reminder.status === "overdue" || reminder.status === "grace" || reminder.status === "today") return "critical";
  return "attention";
}

function reminderRank(reminder: ReminderItem) {
  if (reminder.status === "overdue") return 20;
  if (reminder.status === "grace") return 21;
  if (reminder.status === "today") return 22;
  if (reminder.kind === "low_balance") return 40;
  if (reminder.status === "upcoming") return 50;
  return 70;
}

function connectorReason(connector: ReturnType<typeof listCarrierConnectors>[number]) {
  const health = connector.healthStatus;
  if (health === "healthy" || health === "syncing" || health === "paused") return null;

  let severity: SimHealthReasonSeverity;
  let title: string;
  let rank: number;

  if (health === "authentication") {
    severity = "critical";
    title = "运营商认证失效";
    rank = 10;
  } else if (health === "error") {
    severity = "critical";
    title = "运营商同步异常";
    rank = 30;
  } else if (health === "retrying") {
    severity = "attention";
    title = "运营商同步等待重试";
    rank = 35;
  } else if (health === "stale") {
    severity = "attention";
    title = "运营商数据已过期";
    rank = 45;
  } else {
    severity = "setup";
    title = "运营商连接等待首次同步";
    rank = 80;
  }

  const detail = [
    `${connector.providerLabel} · ${connector.name}`,
    getConnectorHealthStatusLabel(health),
    connector.lastError || null,
    connector.failureCount > 0 ? `连续失败 ${connector.failureCount} 次` : null,
  ].filter(Boolean).join(" · ");

  return {
    key: `connector:${connector.id}:health`,
    source: "connector" as const,
    severity,
    title,
    detail,
    href: "/settings/carrier-connectors",
    rank,
  };
}

function accountReason(connectorId: number, accountStatus: string | null | undefined) {
  if (accountStatus === "expired" || accountStatus === "closed") {
    return {
      key: `connector:${connectorId}:account`,
      source: "account" as const,
      severity: "critical" as const,
      title: accountStatus === "closed" ? "运营商账户已关闭" : "运营商账户已过期",
      detail: `运营商返回账户状态：${getConnectorAccountStatusLabel(accountStatus)}`,
      href: "/settings/carrier-connectors",
      rank: 15,
    };
  }
  if (accountStatus === "suspended") {
    return {
      key: `connector:${connectorId}:account`,
      source: "account" as const,
      severity: "attention" as const,
      title: "运营商账户受限",
      detail: `运营商返回账户状态：${getConnectorAccountStatusLabel(accountStatus)}`,
      href: "/settings/carrier-connectors",
      rank: 32,
    };
  }
  return null;
}

function latestIso(...values: Array<string | null | undefined>) {
  let latestValue: string | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!value) continue;
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) continue;
    if (timestamp > latestTime) {
      latestTime = timestamp;
      latestValue = value;
    }
  }
  return latestValue;
}

function selectHealthStatus(simStatus: string, reasons: RankedReason[]): SimHealthStatus {
  if (simStatus === "closed") return "inactive";
  if (reasons.some((reason) => reason.severity === "critical")) return "critical";
  if (reasons.some((reason) => reason.severity === "attention")) return "attention";
  if (reasons.some((reason) => reason.severity === "setup")) return "setup";
  if (simStatus === "paused") return "paused";
  return "healthy";
}

function buildSummary(items: SimHealthItem[]) {
  const summary = {
    total: items.length,
    healthy: 0,
    attention: 0,
    critical: 0,
    setup: 0,
    paused: 0,
    inactive: 0,
    needsAttention: 0,
  };

  for (const item of items) {
    if (item.healthStatus === "healthy") summary.healthy += 1;
    else if (item.healthStatus === "attention") summary.attention += 1;
    else if (item.healthStatus === "critical") summary.critical += 1;
    else if (item.healthStatus === "setup") summary.setup += 1;
    else if (item.healthStatus === "paused") summary.paused += 1;
    else summary.inactive += 1;
  }
  summary.needsAttention = summary.attention + summary.setup;
  return summary;
}

export function getSimHealthOverview(today = getLifecycleToday()): SimHealthOverview {
  const sims = sqlite
    .prepare(
      `SELECT s.id, s.label, s.phone_number, s.status, s.balance_updated_at, s.updated_at,
              c.name AS carrier_name, c.country
       FROM sim_cards s
       JOIN carriers c ON c.id = s.carrier_id
       ORDER BY c.country COLLATE NOCASE, c.name COLLATE NOCASE, s.label COLLATE NOCASE, s.id`,
    )
    .all() as SimHealthRow[];

  const reasonsBySim = new Map<number, RankedReason[]>();
  const updatedAtBySim = new Map<number, string | null>();
  for (const sim of sims) updatedAtBySim.set(sim.id, latestIso(sim.updated_at, sim.balance_updated_at));

  for (const reminder of getRawUnifiedReminderItems(today)) {
    // Connector state is expanded directly below so every linked SIM receives the same
    // account-level health signal. The reminder engine intentionally emits only one
    // connector task to avoid duplicate work in the reminder center.
    if (reminder.kind === "sync_health") continue;
    const severity = reminderSeverity(reminder);
    addReason(reasonsBySim, reminder.simId, {
      key: `reminder:${reminder.key}`,
      source: reminder.kind === "low_balance" ? "balance" : "lifecycle",
      severity,
      title: reminder.title,
      detail: `${getReminderRelativeLabel(reminder)} · ${reminder.detail}`,
      href: getReminderTaskHref(reminder),
      rank: reminderRank(reminder),
    });
  }

  for (const connector of listCarrierConnectors()) {
    if (connector.provider === "mock" || !connector.linkedSims.length) continue;
    const healthReason = connectorReason(connector);

    for (const linkedSim of connector.linkedSims) {
      updatedAtBySim.set(
        linkedSim.id,
        latestIso(
          updatedAtBySim.get(linkedSim.id),
          connector.lastAttemptAt,
          connector.lastSuccessAt,
          connector.dataUpdatedAt,
          linkedSim.latestSnapshot?.syncedAt,
        ),
      );

      if (healthReason) addReason(reasonsBySim, linkedSim.id, healthReason);
      const account = accountReason(connector.id, linkedSim.latestSnapshot?.accountStatus);
      if (account) addReason(reasonsBySim, linkedSim.id, account);
    }
  }

  for (const sim of sims) {
    if (sim.status === "expired") {
      addReason(reasonsBySim, sim.id, {
        key: `sim:${sim.id}:expired`,
        source: "sim_status",
        severity: "critical",
        title: "号码状态已过期",
        detail: "号码当前被标记为已过期，请确认是否需要充值、续期或更新状态。",
        href: "/sims",
        rank: 0,
      });
    }
  }

  const items = sims.map<SimHealthItem>((sim) => {
    const rankedReasons = sim.status === "closed"
      ? []
      : [...(reasonsBySim.get(sim.id) ?? [])].sort((left, right) => {
          const severityDiff = reasonSeverityRank[left.severity] - reasonSeverityRank[right.severity];
          if (severityDiff !== 0) return severityDiff;
          return left.rank - right.rank || left.title.localeCompare(right.title, "zh-CN");
        });
    const healthStatus = selectHealthStatus(sim.status, rankedReasons);
    const reasons = rankedReasons.map(({ rank: _rank, ...reason }) => reason);
    const primaryReason = reasons[0] ?? null;
    const summary = primaryReason?.title
      ?? (healthStatus === "paused"
        ? "号码已暂停，但仍会继续检查有效期和保号风险"
        : healthStatus === "inactive"
          ? "号码已关闭，不再参与当前健康告警"
          : "未检测到需要处理的风险");

    return {
      simId: sim.id,
      simLabel: sim.label,
      phoneNumber: sim.phone_number,
      carrierName: sim.carrier_name,
      country: sim.country,
      simStatus: sim.status,
      healthStatus,
      healthLabel: getSimHealthStatusLabel(healthStatus),
      summary,
      primaryReason,
      reasons,
      updatedAt: updatedAtBySim.get(sim.id) ?? null,
    };
  }).sort((left, right) => {
    const statusDiff = statusRank[left.healthStatus] - statusRank[right.healthStatus];
    if (statusDiff !== 0) return statusDiff;
    return left.simLabel.localeCompare(right.simLabel, "zh-CN");
  });

  return { items, summary: buildSummary(items) };
}
