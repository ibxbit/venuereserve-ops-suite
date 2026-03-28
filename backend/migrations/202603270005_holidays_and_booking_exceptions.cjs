/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.createTable("holiday_rules", (table) => {
    table.string("id", 36).primary();
    table.date("holiday_date").notNullable().unique();
    table.string("name", 120).notNullable();
    table.boolean("is_closed").notNullable().defaultTo(false);
    table.string("open_time", 8).notNullable().defaultTo("06:00:00");
    table.string("close_time", 8).notNullable().defaultTo("22:00:00");
    table.text("notes");
    table.boolean("is_active").notNullable().defaultTo(true);
    table.timestamp("created_at").notNullable();
    table.timestamp("updated_at").notNullable();
  });

  await knex.schema.createTable("booking_exception_requests", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36).notNullable();
    table.string("resource_id", 36).notNullable();
    table.timestamp("start_time").notNullable();
    table.timestamp("end_time").notNullable();
    table.string("status", 20).notNullable().defaultTo("pending");
    table.text("request_reason").notNullable();
    table.text("decision_reason");
    table.string("decision_by_user_id", 36);
    table.timestamp("decided_at");
    table.text("payload_json");
    table.timestamp("created_at").notNullable();
    table.timestamp("updated_at").notNullable();

    table.foreign("user_id").references("users.id");
    table.foreign("resource_id").references("resources.id");
    table.foreign("decision_by_user_id").references("users.id");
    table.index(["status", "created_at"]);
    table.index(["user_id", "start_time"]);
  });

  await knex("holiday_rules").insert({
    id: "holiday-july-4",
    holiday_date: "2026-07-04",
    name: "Independence Day",
    is_closed: false,
    open_time: "08:00:00",
    close_time: "14:00:00",
    notes: "Reduced operating hours for holiday schedule",
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("booking_exception_requests");
  await knex.schema.dropTableIfExists("holiday_rules");
};
