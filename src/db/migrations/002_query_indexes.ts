import type { DatabaseMigration } from "./types";

export const queryIndexAuditMigration: DatabaseMigration = {
  version: 2,
  name: "query_index_audit",
  up(database) {
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_sim_keep_alive_events_timeline
        ON sim_keep_alive_events(sim_id, activity_date DESC, id DESC);

      CREATE INDEX IF NOT EXISTS idx_sim_bound_services_sim_status
        ON sim_bound_services(sim_id, status, id DESC);

      CREATE INDEX IF NOT EXISTS idx_reminder_actions_sim_acted
        ON reminder_actions(sim_id, acted_at DESC, id DESC);

      CREATE INDEX IF NOT EXISTS idx_condition_episodes_subject_observed
        ON condition_episodes(subject_type, subject_id, status, last_observed_at DESC, id DESC);

      CREATE INDEX IF NOT EXISTS idx_sim_cards_status_validity
        ON sim_cards(status, valid_until, id);
    `);
  },
};
