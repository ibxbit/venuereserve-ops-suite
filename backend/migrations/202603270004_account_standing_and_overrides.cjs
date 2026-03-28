/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable("users", (table) => {
    table.integer("standing_score").unsigned().notNullable().defaultTo(100);
    table.timestamp("standing_last_calculated_at");
  });

  await knex.schema.createTable("attendance_history", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36).notNullable();
    table.string("reservation_id", 36).notNullable();
    table.string("event_type", 40).notNullable();
    table.timestamp("event_time").notNullable();
    table.text("metadata_json");
    table.string("actor_user_id", 36);
    table.timestamp("created_at").notNullable();

    table.foreign("user_id").references("users.id");
    table.foreign("reservation_id").references("reservations.id");
    table.index(["user_id", "event_time"]);
    table.index(["event_type", "event_time"]);
  });

  await knex.schema.createTable("account_standing_policies", (table) => {
    table.string("id", 36).primary();
    table.string("name", 80).notNullable();
    table.boolean("is_active").notNullable().defaultTo(true);
    table.integer("lookback_days").unsigned().notNullable().defaultTo(30);
    table.integer("low_score_threshold").unsigned().notNullable().defaultTo(60);
    table.integer("no_show_limit").unsigned().notNullable().defaultTo(2);
    table
      .integer("no_show_penalty_points")
      .unsigned()
      .notNullable()
      .defaultTo(25);
    table
      .integer("check_in_reward_points")
      .unsigned()
      .notNullable()
      .defaultTo(2);
    table.string("peak_start_time", 8).notNullable().defaultTo("17:00:00");
    table.string("peak_end_time", 8).notNullable().defaultTo("20:00:00");
    table.timestamp("created_at").notNullable();
    table.timestamp("updated_at").notNullable();
  });

  await knex.schema.createTable("reservation_overrides", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36).notNullable();
    table.string("resource_id", 36);
    table.timestamp("start_time").notNullable();
    table.timestamp("end_time").notNullable();
    table.string("status", 30).notNullable().defaultTo("approved");
    table.text("reason");
    table.string("approved_by_user_id", 36).notNullable();
    table.timestamp("used_at");
    table.timestamp("created_at").notNullable();
    table.timestamp("updated_at").notNullable();

    table.foreign("user_id").references("users.id");
    table.foreign("resource_id").references("resources.id");
    table.foreign("approved_by_user_id").references("users.id");
    table.index(["user_id", "start_time"]);
    table.index(["status", "used_at"]);
  });

  await knex("account_standing_policies").insert({
    id: "default-standing-policy",
    name: "Default Standing Policy",
    is_active: true,
    lookback_days: 30,
    low_score_threshold: 60,
    no_show_limit: 2,
    no_show_penalty_points: 25,
    check_in_reward_points: 2,
    peak_start_time: "17:00:00",
    peak_end_time: "20:00:00",
    created_at: new Date(),
    updated_at: new Date(),
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("reservation_overrides");
  await knex.schema.dropTableIfExists("account_standing_policies");
  await knex.schema.dropTableIfExists("attendance_history");

  await knex.schema.alterTable("users", (table) => {
    table.dropColumn("standing_last_calculated_at");
    table.dropColumn("standing_score");
  });
};
