import "server-only";

import { sqlite } from "@/db";
import { ensureCarrierConnectorDiagnosticTables } from "@/lib/carrier-connectors/diagnostics";
import { ensureCarrierConnectorTables } from "@/lib/carrier-connectors/store";
import { ensureEsimProfileTable } from "@/lib/esim-profiles";
import { getKeepAliveActivityLabel } from "@/lib/keep-alive";

export type SimLifecycleCategory =
  | "system"
  | "balance"
  | "validity"
  | "device"
  | "service"
  | "identity"
  | "esim"
  | "keep_alive"
  | "sync"
  | "status";

export type SimLifecycleSource = "lifecycle" | "keep_alive" | "sync_snapshot" | "sync_health";

export type SimLifecycleItem = {
  id: string;
  simId: number;
  eventType: string;
  category: SimLifecycleCategory;
  occurredAt: string;
  title: string;
  detail: string | null;
  source: SimLifecycleSource;
};

type RawLifecycleEvent = {
  id: number;
  sim_id: number;
  event_type: string;
  category: SimLifecycleCategory;
  occurred_at: string;
  title: string;
  detail: string | null;
};

type RawKeepAliveEvent = {
  id: number;
  sim_id: number;
  activity_type: string;
  activity_date: string;
  amount: number | null;
  currency_code: string | null;
  balance_after: number | null;
  valid_until_after: string | null;
  notes: string | null;
  created_at: string;
};

type RawSyncSnapshot = {
  id: number;
  sim_id: number;
  connector_id: number | null;
  source_name: string;
  source_provider: string;
  balance: number | null;
  currency_code: string | null;
  balance_valid_until: string | null;
  account_status: string;
  synced_at: string;
};

type RawSyncAttempt = {
  id: number;
  connector_id: number;
  attempted_at: string;
  completed_at: string;
  status: "success" | "error";
  error_type: string | null;
  error_message: string | null;
};

const TRIGGER_NAMES = [
  "simkeeper_lifecycle_sim_created",
  "simkeeper_lifecycle_device_changed",
  "simkeeper_lifecycle_validity_changed",
  "simkeeper_lifecycle_status_changed",
  "simkeeper_lifecycle_carrier_changed",
  "simkeeper_lifecycle_sim_type_changed",
  "simkeeper_lifecycle_balance_synced",
  "simkeeper_lifecycle_balance_manual",
  "simkeeper_lifecycle_identity_updated",
  "simkeeper_lifecycle_service_bound",
  "simkeeper_lifecycle_service_moved",
  "simkeeper_lifecycle_service_updated",
  "simkeeper_lifecycle_service_deleted",
  "simkeeper_lifecycle_esim_created",
  "simkeeper_lifecycle_esim_updated",
  "simkeeper_lifecycle_esim_deleted",
] as const;

let initialized = false;

function nowSql() {
  return "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
}

export function dropSimLifecycleTriggers() {
  for (const trigger of TRIGGER_NAMES) sqlite.exec(`DROP TRIGGER IF EXISTS ${trigger};`);
  initialized = false;
}

function createLifecycleTriggers() {
  const now = nowSql();
  sqlite.exec(`
    CREATE TRIGGER simkeeper_lifecycle_sim_created
    AFTER INSERT ON sim_cards
    BEGIN
      INSERT OR IGNORE INTO sim_lifecycle_events (
        sim_id, event_type, category, occurred_at, title, detail, dedupe_key, created_at
      ) VALUES (
        NEW.id,
        'sim_created',
        'system',
        NEW.created_at,
        '号码加入 SIMKeeper',
        COALESCE((SELECT name FROM carriers WHERE id = NEW.carrier_id), '未知运营商')
          || ' · '
          || CASE NEW.sim_type WHEN 'esim' THEN 'eSIM' ELSE '实体 SIM' END,
        printf('sim:%d:created', NEW.id),
        ${now}
      );
    END;

    CREATE TRIGGER simkeeper_lifecycle_device_changed
    AFTER UPDATE OF device_id ON sim_cards
    WHEN OLD.device_id IS NOT NEW.device_id
    BEGIN
      INSERT OR IGNORE INTO sim_lifecycle_events (
        sim_id, event_type, category, occurred_at, title, detail, dedupe_key, created_at
      ) VALUES (
        NEW.id,
        'device_changed',
        'device',
        COALESCE(NEW.updated_at, ${now}),
        '存放设备变更',
        COALESCE((SELECT name FROM devices WHERE id = OLD.device_id), '未分配')
          || ' → '
          || COALESCE((SELECT name FROM devices WHERE id = NEW.device_id), '未分配'),
        printf('sim:%d:device:%s', NEW.id, COALESCE(NEW.updated_at, ${now})),
        ${now}
      );
    END;

    CREATE TRIGGER simkeeper_lifecycle_validity_changed
    AFTER UPDATE OF valid_until ON sim_cards
    WHEN OLD.valid_until IS NOT NEW.valid_until
      AND NOT EXISTS (
        SELECT 1
        FROM sim_keep_alive_events e
        WHERE e.sim_id = NEW.id
          AND e.valid_until_after IS NEW.valid_until
          AND ABS(strftime('%s', COALESCE(NEW.updated_at, ${now})) - strftime('%s', e.created_at)) <= 5
      )
    BEGIN
      INSERT OR IGNORE INTO sim_lifecycle_events (
        sim_id, event_type, category, occurred_at, title, detail, dedupe_key, created_at
      ) VALUES (
        NEW.id,
        'validity_changed',
        'validity',
        COALESCE(NEW.updated_at, ${now}),
        '号码有效期更新',
        COALESCE(OLD.valid_until, '未设置') || ' → ' || COALESCE(NEW.valid_until, '未设置'),
        printf('sim:%d:validity:%s', NEW.id, COALESCE(NEW.updated_at, ${now})),
        ${now}
      );
    END;

    CREATE TRIGGER simkeeper_lifecycle_status_changed
    AFTER UPDATE OF status ON sim_cards
    WHEN OLD.status IS NOT NEW.status
    BEGIN
      INSERT OR IGNORE INTO sim_lifecycle_events (
        sim_id, event_type, category, occurred_at, title, detail, dedupe_key, created_at
      ) VALUES (
        NEW.id,
        'status_changed',
        'status',
        COALESCE(NEW.updated_at, ${now}),
        '号码状态变更',
        CASE OLD.status
          WHEN 'active' THEN '正常'
          WHEN 'paused' THEN '暂停使用'
          WHEN 'expired' THEN '已失效'
          WHEN 'closed' THEN '已注销'
          ELSE OLD.status
        END
        || ' → '
        || CASE NEW.status
          WHEN 'active' THEN '正常'
          WHEN 'paused' THEN '暂停使用'
          WHEN 'expired' THEN '已失效'
          WHEN 'closed' THEN '已注销'
          ELSE NEW.status
        END,
        printf('sim:%d:status:%s', NEW.id, COALESCE(NEW.updated_at, ${now})),
        ${now}
      );
    END;

    CREATE TRIGGER simkeeper_lifecycle_carrier_changed
    AFTER UPDATE OF carrier_id ON sim_cards
    WHEN OLD.carrier_id IS NOT NEW.carrier_id
    BEGIN
      INSERT OR IGNORE INTO sim_lifecycle_events (
        sim_id, event_type, category, occurred_at, title, detail, dedupe_key, created_at
      ) VALUES (
        NEW.id,
        'carrier_changed',
        'system',
        COALESCE(NEW.updated_at, ${now}),
        '运营商变更',
        COALESCE((SELECT name FROM carriers WHERE id = OLD.carrier_id), '未知运营商')
          || ' → '
          || COALESCE((SELECT name FROM carriers WHERE id = NEW.carrier_id), '未知运营商'),
        printf('sim:%d:carrier:%s', NEW.id, COALESCE(NEW.updated_at, ${now})),
        ${now}
      );
    END;

    CREATE TRIGGER simkeeper_lifecycle_sim_type_changed
    AFTER UPDATE OF sim_type ON sim_cards
    WHEN OLD.sim_type IS NOT NEW.sim_type
    BEGIN
      INSERT OR IGNORE INTO sim_lifecycle_events (
        sim_id, event_type, category, occurred_at, title, detail, dedupe_key, created_at
      ) VALUES (
        NEW.id,
        'sim_type_changed',
        'system',
        COALESCE(NEW.updated_at, ${now}),
        'SIM 类型变更',
        CASE OLD.sim_type WHEN 'esim' THEN 'eSIM' ELSE '实体 SIM' END
          || ' → '
          || CASE NEW.sim_type WHEN 'esim' THEN 'eSIM' ELSE '实体 SIM' END,
        printf('sim:%d:type:%s', NEW.id, COALESCE(NEW.updated_at, ${now})),
        ${now}
      );
    END;

    CREATE TRIGGER simkeeper_lifecycle_balance_synced
    AFTER UPDATE OF balance, currency_code ON sim_cards
    WHEN (OLD.balance IS NOT NEW.balance OR OLD.currency_code IS NOT NEW.currency_code)
      AND EXISTS (
        SELECT 1
        FROM sim_sync_snapshots ss
        WHERE ss.sim_id = NEW.id
          AND ss.synced_at = NEW.balance_updated_at
          AND ss.balance IS NEW.balance
          AND ss.currency_code IS NEW.currency_code
      )
    BEGIN
      INSERT OR IGNORE INTO sim_lifecycle_events (
        sim_id, event_type, category, occurred_at, title, detail, dedupe_key, created_at
      ) VALUES (
        NEW.id,
        'balance_synced',
        'balance',
        COALESCE(NEW.balance_updated_at, NEW.updated_at, ${now}),
        '余额自动同步',
        (CASE WHEN OLD.balance IS NULL THEN '未记录' ELSE COALESCE(OLD.currency_code || ' ', '') || printf('%g', OLD.balance) END)
          || ' → '
          || (CASE WHEN NEW.balance IS NULL THEN '未记录' ELSE COALESCE(NEW.currency_code || ' ', '') || printf('%g', NEW.balance) END),
        printf('sim:%d:balance-sync:%s', NEW.id, COALESCE(NEW.balance_updated_at, NEW.updated_at, ${now})),
        ${now}
      );
    END;

    CREATE TRIGGER simkeeper_lifecycle_balance_manual
    AFTER UPDATE OF balance, currency_code ON sim_cards
    WHEN (OLD.balance IS NOT NEW.balance OR OLD.currency_code IS NOT NEW.currency_code)
      AND NOT EXISTS (
        SELECT 1
        FROM sim_sync_snapshots ss
        WHERE ss.sim_id = NEW.id
          AND ss.synced_at = NEW.balance_updated_at
          AND ss.balance IS NEW.balance
          AND ss.currency_code IS NEW.currency_code
      )
      AND NOT EXISTS (
        SELECT 1
        FROM sim_keep_alive_events e
        WHERE e.sim_id = NEW.id
          AND e.balance_after IS NEW.balance
          AND ABS(strftime('%s', COALESCE(NEW.updated_at, ${now})) - strftime('%s', e.created_at)) <= 5
      )
    BEGIN
      INSERT OR IGNORE INTO sim_lifecycle_events (
        sim_id, event_type, category, occurred_at, title, detail, dedupe_key, created_at
      ) VALUES (
        NEW.id,
        'balance_manual_adjusted',
        'balance',
        COALESCE(NEW.balance_updated_at, NEW.updated_at, ${now}),
        '余额手动调整',
        (CASE WHEN OLD.balance IS NULL THEN '未记录' ELSE COALESCE(OLD.currency_code || ' ', '') || printf('%g', OLD.balance) END)
          || ' → '
          || (CASE WHEN NEW.balance IS NULL THEN '未记录' ELSE COALESCE(NEW.currency_code || ' ', '') || printf('%g', NEW.balance) END),
        printf('sim:%d:balance-manual:%s', NEW.id, COALESCE(NEW.balance_updated_at, NEW.updated_at, ${now})),
        ${now}
      );
    END;

    CREATE TRIGGER simkeeper_lifecycle_identity_updated
    AFTER UPDATE OF identity_status, identity_name, identity_document_type, identity_document_type_custom,
                    identity_document_number, identity_country_code, identity_notes ON sim_cards
    WHEN OLD.identity_status IS NOT NEW.identity_status
      OR OLD.identity_name IS NOT NEW.identity_name
      OR OLD.identity_document_type IS NOT NEW.identity_document_type
      OR OLD.identity_document_type_custom IS NOT NEW.identity_document_type_custom
      OR OLD.identity_document_number IS NOT NEW.identity_document_number
      OR OLD.identity_country_code IS NOT NEW.identity_country_code
      OR OLD.identity_notes IS NOT NEW.identity_notes
    BEGIN
      INSERT OR IGNORE INTO sim_lifecycle_events (
        sim_id, event_type, category, occurred_at, title, detail, dedupe_key, created_at
      ) VALUES (
        NEW.id,
        'identity_updated',
        'identity',
        COALESCE(NEW.updated_at, ${now}),
        '实名信息更新',
        CASE
          WHEN OLD.identity_status IS NOT NEW.identity_status THEN
            '实名状态：'
            || CASE OLD.identity_status WHEN 'registered' THEN '已实名' WHEN 'unregistered' THEN '未实名' ELSE '未记录' END
            || ' → '
            || CASE NEW.identity_status WHEN 'registered' THEN '已实名' WHEN 'unregistered' THEN '未实名' ELSE '未记录' END
          ELSE '实名主体或证件资料已更新（敏感字段不在时间线展示）'
        END,
        printf('sim:%d:identity:%s', NEW.id, COALESCE(NEW.updated_at, ${now})),
        ${now}
      );
    END;

    CREATE TRIGGER simkeeper_lifecycle_service_bound
    AFTER INSERT ON sim_bound_services
    BEGIN
      INSERT OR IGNORE INTO sim_lifecycle_events (
        sim_id, event_type, category, occurred_at, title, detail, dedupe_key, created_at
      ) VALUES (
        NEW.sim_id,
        'service_bound',
        'service',
        NEW.created_at,
        '绑定服务',
        NEW.service_name
          || CASE NEW.status
            WHEN 'active' THEN ' · 当前绑定'
            WHEN 'migrated' THEN ' · 已迁移'
            WHEN 'unbound' THEN ' · 已解绑'
            ELSE ''
          END,
        printf('service:%d:bound', NEW.id),
        ${now}
      );
    END;

    CREATE TRIGGER simkeeper_lifecycle_service_moved
    AFTER UPDATE OF sim_id ON sim_bound_services
    WHEN OLD.sim_id IS NOT NEW.sim_id
    BEGIN
      INSERT OR IGNORE INTO sim_lifecycle_events (
        sim_id, event_type, category, occurred_at, title, detail, dedupe_key, created_at
      ) VALUES (
        OLD.sim_id,
        'service_moved_out',
        'service',
        COALESCE(NEW.updated_at, ${now}),
        '绑定服务移出',
        NEW.service_name,
        printf('service:%d:moved-out:%s', NEW.id, COALESCE(NEW.updated_at, ${now})),
        ${now}
      );
      INSERT OR IGNORE INTO sim_lifecycle_events (
        sim_id, event_type, category, occurred_at, title, detail, dedupe_key, created_at
      ) VALUES (
        NEW.sim_id,
        'service_moved_in',
        'service',
        COALESCE(NEW.updated_at, ${now}),
        '绑定服务移入',
        NEW.service_name,
        printf('service:%d:moved-in:%s', NEW.id, COALESCE(NEW.updated_at, ${now})),
        ${now}
      );
    END;

    CREATE TRIGGER simkeeper_lifecycle_service_updated
    AFTER UPDATE OF service_name, status ON sim_bound_services
    WHEN OLD.sim_id IS NEW.sim_id
      AND (OLD.service_name IS NOT NEW.service_name OR OLD.status IS NOT NEW.status)
    BEGIN
      INSERT OR IGNORE INTO sim_lifecycle_events (
        sim_id, event_type, category, occurred_at, title, detail, dedupe_key, created_at
      ) VALUES (
        NEW.sim_id,
        'service_updated',
        'service',
        COALESCE(NEW.updated_at, ${now}),
        '绑定服务更新',
        NEW.service_name
          || CASE WHEN OLD.status IS NOT NEW.status THEN
            ' · '
            || CASE OLD.status WHEN 'active' THEN '当前绑定' WHEN 'migrated' THEN '已迁移' WHEN 'unbound' THEN '已解绑' ELSE OLD.status END
            || ' → '
            || CASE NEW.status WHEN 'active' THEN '当前绑定' WHEN 'migrated' THEN '已迁移' WHEN 'unbound' THEN '已解绑' ELSE NEW.status END
          ELSE '' END,
        printf('service:%d:updated:%s', NEW.id, COALESCE(NEW.updated_at, ${now})),
        ${now}
      );
    END;

    CREATE TRIGGER simkeeper_lifecycle_service_deleted
    AFTER DELETE ON sim_bound_services
    BEGIN
      INSERT OR IGNORE INTO sim_lifecycle_events (
        sim_id, event_type, category, occurred_at, title, detail, dedupe_key, created_at
      ) VALUES (
        OLD.sim_id,
        'service_unbound',
        'service',
        ${now},
        '解除绑定服务',
        OLD.service_name,
        printf('service:%d:deleted', OLD.id),
        ${now}
      );
    END;

    CREATE TRIGGER simkeeper_lifecycle_esim_created
    AFTER INSERT ON sim_esim_profiles
    BEGIN
      INSERT OR IGNORE INTO sim_lifecycle_events (
        sim_id, event_type, category, occurred_at, title, detail, dedupe_key, created_at
      ) VALUES (
        NEW.sim_id,
        'esim_profile_created',
        'esim',
        NEW.created_at,
        'eSIM 激活配置已归档',
        '配置状态：' || CASE NEW.profile_status
          WHEN 'unused' THEN '未安装 / 未使用'
          WHEN 'installed' THEN '已安装'
          WHEN 'used' THEN '激活码已使用'
          WHEN 'expired' THEN '已失效'
          ELSE '未知'
        END,
        printf('esim:%d:created', NEW.id),
        ${now}
      );
    END;

    CREATE TRIGGER simkeeper_lifecycle_esim_updated
    AFTER UPDATE ON sim_esim_profiles
    WHEN OLD.profile_status IS NOT NEW.profile_status
      OR OLD.source IS NOT NEW.source
      OR OLD.reuse_policy IS NOT NEW.reuse_policy
      OR OLD.notes IS NOT NEW.notes
      OR OLD.smdp_address_encrypted IS NOT NEW.smdp_address_encrypted
      OR OLD.activation_code_encrypted IS NOT NEW.activation_code_encrypted
      OR OLD.confirmation_code_encrypted IS NOT NEW.confirmation_code_encrypted
      OR OLD.lpa_string_encrypted IS NOT NEW.lpa_string_encrypted
      OR OLD.original_qr_encrypted IS NOT NEW.original_qr_encrypted
    BEGIN
      INSERT OR IGNORE INTO sim_lifecycle_events (
        sim_id, event_type, category, occurred_at, title, detail, dedupe_key, created_at
      ) VALUES (
        NEW.sim_id,
        'esim_profile_updated',
        'esim',
        NEW.updated_at,
        CASE WHEN OLD.profile_status IS NOT NEW.profile_status THEN 'eSIM 配置状态变更' ELSE 'eSIM 激活配置已更新' END,
        CASE WHEN OLD.profile_status IS NOT NEW.profile_status THEN
          CASE OLD.profile_status
            WHEN 'unused' THEN '未安装 / 未使用'
            WHEN 'installed' THEN '已安装'
            WHEN 'used' THEN '激活码已使用'
            WHEN 'expired' THEN '已失效'
            ELSE '未知'
          END
          || ' → '
          || CASE NEW.profile_status
            WHEN 'unused' THEN '未安装 / 未使用'
            WHEN 'installed' THEN '已安装'
            WHEN 'used' THEN '激活码已使用'
            WHEN 'expired' THEN '已失效'
            ELSE '未知'
          END
        ELSE '归档内容已更新；激活凭据不会在时间线中明文展示' END,
        printf('esim:%d:updated:%s', NEW.id, NEW.updated_at),
        ${now}
      );
    END;

    CREATE TRIGGER simkeeper_lifecycle_esim_deleted
    AFTER DELETE ON sim_esim_profiles
    BEGIN
      INSERT OR IGNORE INTO sim_lifecycle_events (
        sim_id, event_type, category, occurred_at, title, detail, dedupe_key, created_at
      ) VALUES (
        OLD.sim_id,
        'esim_profile_deleted',
        'esim',
        ${now},
        'eSIM 激活配置已移除',
        '已删除本机保存的 eSIM 激活配置归档',
        printf('esim:%d:deleted', OLD.id),
        ${now}
      );
    END;
  `);
}

function backfillExistingBaselines() {
  const now = nowSql();
  sqlite.exec(`
    INSERT OR IGNORE INTO sim_lifecycle_events (
      sim_id, event_type, category, occurred_at, title, detail, dedupe_key, created_at
    )
    SELECT
      s.id,
      'sim_created',
      'system',
      s.created_at,
      '号码加入 SIMKeeper',
      COALESCE(c.name, '未知运营商') || ' · ' || CASE s.sim_type WHEN 'esim' THEN 'eSIM' ELSE '实体 SIM' END,
      printf('sim:%d:created', s.id),
      ${now}
    FROM sim_cards s
    LEFT JOIN carriers c ON c.id = s.carrier_id;

    INSERT OR IGNORE INTO sim_lifecycle_events (
      sim_id, event_type, category, occurred_at, title, detail, dedupe_key, created_at
    )
    SELECT
      b.sim_id,
      'service_bound',
      'service',
      b.created_at,
      '绑定服务',
      b.service_name
        || CASE b.status
          WHEN 'active' THEN ' · 当前绑定'
          WHEN 'migrated' THEN ' · 已迁移'
          WHEN 'unbound' THEN ' · 已解绑'
          ELSE ''
        END,
      printf('service:%d:bound', b.id),
      ${now}
    FROM sim_bound_services b;

    INSERT OR IGNORE INTO sim_lifecycle_events (
      sim_id, event_type, category, occurred_at, title, detail, dedupe_key, created_at
    )
    SELECT
      e.sim_id,
      'esim_profile_created',
      'esim',
      e.created_at,
      'eSIM 激活配置已归档',
      '配置状态：' || CASE e.profile_status
        WHEN 'unused' THEN '未安装 / 未使用'
        WHEN 'installed' THEN '已安装'
        WHEN 'used' THEN '激活码已使用'
        WHEN 'expired' THEN '已失效'
        ELSE '未知'
      END,
      printf('esim:%d:created', e.id),
      ${now}
    FROM sim_esim_profiles e;
  `);
}

export function ensureSimLifecycleTables() {
  if (initialized) return;

  ensureCarrierConnectorTables();
  ensureCarrierConnectorDiagnosticTables();
  ensureEsimProfileTable();

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sim_lifecycle_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sim_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      category TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT,
      metadata_json TEXT,
      dedupe_key TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (sim_id) REFERENCES sim_cards(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sim_lifecycle_events_sim_time
      ON sim_lifecycle_events(sim_id, occurred_at DESC, id DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sim_lifecycle_events_dedupe
      ON sim_lifecycle_events(dedupe_key)
      WHERE dedupe_key IS NOT NULL;
  `);

  dropSimLifecycleTriggers();
  createLifecycleTriggers();
  backfillExistingBaselines();
  initialized = true;
}

function formatMoney(value: number | null, currencyCode: string | null) {
  if (value === null) return "未记录";
  return `${currencyCode ? `${currencyCode} ` : ""}${Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 6 })}`;
}

function accountStatusLabel(value: string) {
  if (value === "active") return "正常";
  if (value === "suspended") return "暂停";
  if (value === "expired") return "已失效";
  if (value === "closed") return "已关闭";
  return "未知";
}

function errorTypeLabel(value: string | null) {
  if (value === "authentication") return "凭据失效";
  if (value === "configuration") return "配置错误";
  if (value === "rate_limit") return "请求受限";
  if (value === "maintenance") return "运营商维护";
  if (value === "unsupported") return "暂不支持";
  if (value === "permanent") return "永久错误";
  return "临时错误";
}

function listGenericEvents(simId: number): SimLifecycleItem[] {
  const rows = sqlite
    .prepare(
      `SELECT id, sim_id, event_type, category, occurred_at, title, detail
       FROM sim_lifecycle_events
       WHERE sim_id = ?
       ORDER BY occurred_at DESC, id DESC
       LIMIT 200`,
    )
    .all(simId) as RawLifecycleEvent[];

  return rows.map((row) => ({
    id: `lifecycle:${row.id}`,
    simId: row.sim_id,
    eventType: row.event_type,
    category: row.category,
    occurredAt: row.occurred_at,
    title: row.title,
    detail: row.detail,
    source: "lifecycle",
  }));
}

function listKeepAliveTimeline(simId: number): SimLifecycleItem[] {
  const rows = sqlite
    .prepare(
      `SELECT id, sim_id, activity_type, activity_date, amount, currency_code,
              balance_after, valid_until_after, notes, created_at
       FROM sim_keep_alive_events
       WHERE sim_id = ?
       ORDER BY activity_date DESC, id DESC
       LIMIT 100`,
    )
    .all(simId) as RawKeepAliveEvent[];

  return rows.map((row) => {
    const details = [
      row.amount !== null ? `金额 ${formatMoney(row.amount, row.currency_code)}` : "",
      row.balance_after !== null ? `活动后余额 ${formatMoney(row.balance_after, row.currency_code)}` : "",
      row.valid_until_after ? `有效期至 ${row.valid_until_after}` : "",
      row.notes || "",
    ].filter(Boolean);
    return {
      id: `keepalive:${row.id}`,
      simId: row.sim_id,
      eventType: `keep_alive_${row.activity_type}`,
      category: "keep_alive" as const,
      occurredAt: `${row.activity_date}T12:00:00.000Z`,
      title: getKeepAliveActivityLabel(row.activity_type),
      detail: details.length ? details.join(" · ") : null,
      source: "keep_alive" as const,
    };
  });
}

function listSnapshotTimeline(simId: number, genericEvents: SimLifecycleItem[]): SimLifecycleItem[] {
  const rows = sqlite
    .prepare(
      `SELECT id, sim_id, connector_id, source_name, source_provider, balance,
              currency_code, balance_valid_until, account_status, synced_at
       FROM sim_sync_snapshots
       WHERE sim_id = ?
       ORDER BY synced_at ASC, id ASC
       LIMIT 100`,
    )
    .all(simId) as RawSyncSnapshot[];

  const genericSyncTimes = new Set(
    genericEvents
      .filter((item) => item.eventType === "balance_synced")
      .map((item) => item.occurredAt),
  );
  const result: SimLifecycleItem[] = [];
  let previous: RawSyncSnapshot | null = null;

  for (const row of rows) {
    const detail: string[] = [];
    const balanceChanged = !previous || previous.balance !== row.balance || previous.currency_code !== row.currency_code;
    const validityChanged = !previous || previous.balance_valid_until !== row.balance_valid_until;
    const accountChanged = !previous || previous.account_status !== row.account_status;

    if (balanceChanged && !genericSyncTimes.has(row.synced_at)) {
      detail.push(
        previous
          ? `余额 ${formatMoney(previous.balance, previous.currency_code)} → ${formatMoney(row.balance, row.currency_code)}`
          : `余额 ${formatMoney(row.balance, row.currency_code)}`,
      );
    }
    if (validityChanged && row.balance_valid_until) {
      detail.push(
        previous?.balance_valid_until
          ? `余额有效期 ${previous.balance_valid_until} → ${row.balance_valid_until}`
          : `余额有效期至 ${row.balance_valid_until}`,
      );
    }
    if (accountChanged && row.account_status !== "unknown") {
      detail.push(
        previous && previous.account_status !== "unknown"
          ? `账户状态 ${accountStatusLabel(previous.account_status)} → ${accountStatusLabel(row.account_status)}`
          : `账户状态 ${accountStatusLabel(row.account_status)}`,
      );
    }

    if (detail.length) {
      const title = detail.length > 1
        ? "运营商同步数据更新"
        : balanceChanged && !genericSyncTimes.has(row.synced_at)
          ? "余额自动同步"
          : validityChanged
            ? "余额有效期更新"
            : "运营商账户状态更新";
      result.push({
        id: `snapshot:${row.id}`,
        simId: row.sim_id,
        eventType: "sync_snapshot_changed",
        category: "sync",
        occurredAt: row.synced_at,
        title,
        detail: `${row.source_name} · ${detail.join(" · ")}`,
        source: "sync_snapshot",
      });
    }

    previous = row;
  }

  return result;
}

function listSyncHealthTimeline(simId: number): SimLifecycleItem[] {
  const link = sqlite
    .prepare(
      `SELECT l.connector_id, c.name
       FROM carrier_connector_sims l
       JOIN carrier_connectors c ON c.id = l.connector_id
       WHERE l.sim_id = ?
       LIMIT 1`,
    )
    .get(simId) as { connector_id: number; name: string } | undefined;
  if (!link) return [];

  const rows = sqlite
    .prepare(
      `SELECT id, connector_id, attempted_at, completed_at, status, error_type, error_message
       FROM carrier_connector_attempts
       WHERE connector_id = ?
       ORDER BY attempted_at ASC, id ASC
       LIMIT 200`,
    )
    .all(link.connector_id) as RawSyncAttempt[];

  const result: SimLifecycleItem[] = [];
  let previousStatus: "success" | "error" | null = null;
  let previousErrorType: string | null = null;

  for (const row of rows) {
    if (row.status === "error") {
      if (previousStatus !== "error" || previousErrorType !== row.error_type) {
        result.push({
          id: `sync-health:${row.id}`,
          simId,
          eventType: "sync_error",
          category: "sync",
          occurredAt: row.attempted_at,
          title: "同步异常",
          detail: `${link.name} · ${errorTypeLabel(row.error_type)}${row.error_message ? ` · ${row.error_message}` : ""}`,
          source: "sync_health",
        });
      }
      previousStatus = "error";
      previousErrorType = row.error_type;
      continue;
    }

    if (previousStatus === "error") {
      result.push({
        id: `sync-health:${row.id}`,
        simId,
        eventType: "sync_recovered",
        category: "sync",
        occurredAt: row.attempted_at,
        title: "同步恢复",
        detail: `${link.name} · 运营商连接重新同步成功`,
        source: "sync_health",
      });
    }
    previousStatus = "success";
    previousErrorType = null;
  }

  return result;
}

export function listSimLifecycleTimeline(simId: number, limit = 80): SimLifecycleItem[] {
  ensureSimLifecycleTables();
  const normalizedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const generic = listGenericEvents(simId);
  const items = [
    ...generic,
    ...listKeepAliveTimeline(simId),
    ...listSnapshotTimeline(simId, generic),
    ...listSyncHealthTimeline(simId),
  ];

  return items
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id))
    .slice(0, normalizedLimit);
}
