import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
  currencyCode: text("currency_code"),
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
