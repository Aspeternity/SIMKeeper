import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const carriers = sqliteTable("carriers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  country: text("country").notNull(),
  countryCode: text("country_code").notNull(),
  website: text("website"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const simCards = sqliteTable("sim_cards", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull(),
  phoneNumber: text("phone_number"),
  carrierId: integer("carrier_id")
    .notNull()
    .references(() => carriers.id, { onDelete: "restrict" }),
  simType: text("sim_type").notNull(),
  iccid: text("iccid"),
  balance: real("balance"),
  currencyCode: text("currency_code"),
  status: text("status").notNull(),
  activationDate: text("activation_date"),
  validUntil: text("valid_until"),
  identityStatus: text("identity_status").notNull().default("unknown"),
  identityName: text("identity_name"),
  identityDocumentType: text("identity_document_type"),
  identityDocumentTypeCustom: text("identity_document_type_custom"),
  identityDocumentNumber: text("identity_document_number"),
  identityCountryCode: text("identity_country_code"),
  identityNotes: text("identity_notes"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const simTariffs = sqliteTable("sim_tariffs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  simId: integer("sim_id")
    .notNull()
    .unique()
    .references(() => simCards.id, { onDelete: "cascade" }),
  planName: text("plan_name"),
  planType: text("plan_type").notNull().default("unknown"),
  currencyCode: text("currency_code"),
  purchaseCost: real("purchase_cost"),
  recurringFee: real("recurring_fee"),
  recurringPeriodValue: integer("recurring_period_value"),
  recurringPeriodUnit: text("recurring_period_unit"),
  administrationFee: real("administration_fee"),
  autoRenew: text("auto_renew").notNull().default("unknown"),
  localOutgoingCall: text("local_outgoing_call"),
  localIncomingCall: text("local_incoming_call"),
  localOutgoingSms: text("local_outgoing_sms"),
  localIncomingSms: text("local_incoming_sms"),
  localData: text("local_data"),
  internationalOutgoingCall: text("international_outgoing_call"),
  internationalOutgoingSms: text("international_outgoing_sms"),
  roamingOutgoingCall: text("roaming_outgoing_call"),
  roamingIncomingCall: text("roaming_incoming_call"),
  roamingOutgoingSms: text("roaming_outgoing_sms"),
  roamingIncomingSms: text("roaming_incoming_sms"),
  roamingData: text("roaming_data"),
  localIncomingSmsPolicy: text("local_incoming_sms_policy").notNull(),
  roamingIncomingSmsPolicy: text("roaming_incoming_sms_policy").notNull(),
  roamingAvailable: text("roaming_available").notNull(),
  usageSummary: text("usage_summary"),
  sourceUrl: text("source_url"),
  verifiedAt: text("verified_at"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const simTariffRates = sqliteTable(
  "sim_tariff_rates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tariffId: integer("tariff_id")
      .notNull()
      .references(() => simTariffs.id, { onDelete: "cascade" }),
    serviceCode: text("service_code").notNull(),
    mode: text("mode").notNull(),
    amount: real("amount"),
    billingUnit: text("billing_unit"),
    legacyText: text("legacy_text"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("idx_sim_tariff_rates_tariff_service").on(table.tariffId, table.serviceCode)],
);

export const simTariffRateRules = sqliteTable(
  "sim_tariff_rate_rules",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tariffId: integer("tariff_id")
      .notNull()
      .references(() => simTariffs.id, { onDelete: "cascade" }),
    serviceCode: text("service_code").notNull(),
    label: text("label"),
    mode: text("mode").notNull(),
    amount: real("amount"),
    billingUnit: text("billing_unit"),
    packagePrice: real("package_price"),
    packageAllowanceAmount: real("package_allowance_amount"),
    packageAllowanceUnit: text("package_allowance_unit"),
    validityValue: integer("validity_value"),
    validityUnit: text("validity_unit"),
    autoRenew: text("auto_renew").notNull().default("unknown"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_sim_tariff_rate_rules_tariff_id").on(table.tariffId),
    index("idx_sim_tariff_rate_rules_tariff_service").on(table.tariffId, table.serviceCode),
  ],
);

export const simTariffRuleConditions = sqliteTable(
  "sim_tariff_rule_conditions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ruleId: integer("rule_id")
      .notNull()
      .references(() => simTariffRateRules.id, { onDelete: "cascade" }),
    conditionType: text("condition_type").notNull(),
    value: text("value").notNull(),
    value2: text("value_2"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_sim_tariff_rule_conditions_rule_id").on(table.ruleId)],
);

export const simTariffCustomItems = sqliteTable(
  "sim_tariff_custom_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tariffId: integer("tariff_id")
      .notNull()
      .references(() => simTariffs.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    kind: text("kind").notNull(),
    mode: text("mode").notNull(),
    amount: real("amount"),
    billingUnit: text("billing_unit"),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_sim_tariff_custom_items_tariff_id").on(table.tariffId)],
);

export const simKeepAliveRules = sqliteTable(
  "sim_keep_alive_rules",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    simId: integer("sim_id")
      .notNull()
      .references(() => simCards.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    intervalValue: integer("interval_value").notNull(),
    intervalUnit: text("interval_unit").notNull(),
    qualifyingActions: text("qualifying_actions").notNull(),
    minimumRechargeAmount: real("minimum_recharge_amount"),
    rechargeCurrencyCode: text("recharge_currency_code"),
    dueDateSource: text("due_date_source").notNull().default("independent"),
    nextDueDate: text("next_due_date"),
    warningDays: integer("warning_days").notNull().default(30),
    gracePeriodDays: integer("grace_period_days").notNull().default(0),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_sim_keep_alive_rules_sim_id").on(table.simId),
    index("idx_sim_keep_alive_rules_due").on(table.nextDueDate),
  ],
);

export const simKeepAliveEvents = sqliteTable(
  "sim_keep_alive_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    simId: integer("sim_id")
      .notNull()
      .references(() => simCards.id, { onDelete: "cascade" }),
    activityType: text("activity_type").notNull(),
    activityDate: text("activity_date").notNull(),
    amount: real("amount"),
    currencyCode: text("currency_code"),
    balanceAfter: real("balance_after"),
    validUntilAfter: text("valid_until_after"),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_sim_keep_alive_events_sim_id").on(table.simId),
    index("idx_sim_keep_alive_events_date").on(table.simId, table.activityDate),
  ],
);

export const simBoundServices = sqliteTable(
  "sim_bound_services",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    simId: integer("sim_id")
      .notNull()
      .references(() => simCards.id, { onDelete: "cascade" }),
    serviceName: text("service_name").notNull(),
    category: text("category").notNull(),
    bindingType: text("binding_type").notNull(),
    accountIdentifier: text("account_identifier"),
    importance: text("importance").notNull().default("normal"),
    status: text("status").notNull().default("active"),
    website: text("website"),
    boundAt: text("bound_at"),
    verifiedAt: text("verified_at"),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_sim_bound_services_sim_id").on(table.simId),
    index("idx_sim_bound_services_category").on(table.category),
    index("idx_sim_bound_services_status").on(table.status),
    index("idx_sim_bound_services_importance").on(table.importance),
  ],
);