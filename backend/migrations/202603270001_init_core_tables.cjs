/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.createTable("users", (table) => {
    table.string("id", 36).primary();
    table.string("full_name", 120).notNullable();
    table.string("email", 160).notNullable().unique();
    table.string("phone", 40);
    table.string("status", 30).notNullable().defaultTo("active");
    table.timestamp("created_at").notNullable();
    table.timestamp("updated_at").notNullable();
  });

  await knex.schema.createTable("resources", (table) => {
    table.string("id", 36).primary();
    table.string("name", 140).notNullable();
    table.string("type", 80).notNullable();
    table.integer("capacity").unsigned().notNullable().defaultTo(1);
    table.boolean("is_active").notNullable().defaultTo(true);
    table.timestamp("created_at").notNullable();
    table.timestamp("updated_at").notNullable();
  });

  await knex.schema.createTable("reservations", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36).notNullable();
    table.string("resource_id", 36).notNullable();
    table.timestamp("start_time").notNullable();
    table.timestamp("end_time").notNullable();
    table.string("status", 30).notNullable().defaultTo("booked");
    table.text("notes");
    table.timestamp("created_at").notNullable();
    table.timestamp("updated_at").notNullable();

    table.foreign("user_id").references("users.id");
    table.foreign("resource_id").references("resources.id");
    table.index(["resource_id", "start_time"]);
  });

  await knex.schema.createTable("orders", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36).notNullable();
    table.decimal("total_amount", 10, 2).notNullable();
    table.string("status", 30).notNullable().defaultTo("pending");
    table.string("payment_method", 40).notNullable().defaultTo("cash");
    table.text("notes");
    table.timestamp("created_at").notNullable();
    table.timestamp("updated_at").notNullable();

    table.foreign("user_id").references("users.id");
    table.index(["user_id", "created_at"]);
  });

  await knex.schema.createTable("refunds", (table) => {
    table.string("id", 36).primary();
    table.string("order_id", 36).notNullable();
    table.decimal("amount", 10, 2).notNullable();
    table.string("reason", 255);
    table.string("status", 30).notNullable().defaultTo("requested");
    table.timestamp("processed_at");
    table.timestamp("created_at").notNullable();
    table.timestamp("updated_at").notNullable();

    table.foreign("order_id").references("orders.id");
    table.index(["order_id", "created_at"]);
  });

  await knex.schema.createTable("audit_trails", (table) => {
    table.string("id", 36).primary();
    table.string("entity", 80).notNullable();
    table.string("entity_id", 36).notNullable();
    table.string("action", 20).notNullable();
    table.text("payload_json");
    table.string("actor_user_id", 36);
    table.timestamp("created_at").notNullable();
    table.index(["entity", "entity_id"]);
    table.index(["created_at"]);
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("audit_trails");
  await knex.schema.dropTableIfExists("refunds");
  await knex.schema.dropTableIfExists("orders");
  await knex.schema.dropTableIfExists("reservations");
  await knex.schema.dropTableIfExists("resources");
  await knex.schema.dropTableIfExists("users");
};
