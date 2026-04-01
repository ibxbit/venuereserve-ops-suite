import knex from "knex";
import { config } from "./config.js";

export const db = knex({
  client: "mysql2",
  connection: config.db,
  pool: {
    min: 0,
    max: 10,
  },
});
