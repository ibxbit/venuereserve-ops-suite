import knex from "knex";
import { config } from "./config.js";

function buildKnex() {
  const client = process.env.TEST_DB_CLIENT || "mysql2";

  if (client === "better-sqlite3") {
    return knex({
      client: "better-sqlite3",
      connection: {
        filename: process.env.TEST_DB_FILENAME || ":memory:",
      },
      useNullAsDefault: true,
      pool: {
        min: 1,
        max: 1,
      },
    });
  }

  return knex({
    client: "mysql2",
    connection: config.db,
    pool: {
      min: 0,
      max: 10,
    },
  });
}

export const db = buildKnex();
