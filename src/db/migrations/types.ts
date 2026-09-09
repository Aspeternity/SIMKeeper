import type Database from "better-sqlite3";

export type MigrationDatabase = Database.Database;

export type DatabaseMigration = {
  version: number;
  name: string;
  up: (database: MigrationDatabase) => void;
};
