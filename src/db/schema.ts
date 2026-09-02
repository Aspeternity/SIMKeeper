import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
