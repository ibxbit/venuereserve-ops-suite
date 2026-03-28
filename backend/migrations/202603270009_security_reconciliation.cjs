/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable("users", (table) => {
    table.string("role", 40).notNullable().defaultTo("member");
    table.string("password_salt", 255);
    table.string("password_hash", 255);
    table
      .integer("failed_login_attempts")
      .unsigned()
      .notNullable()
      .defaultTo(0);
    table.timestamp("locked_until");
    table.timestamp("last_failed_login_at");
  });

  await knex.schema.createTable("security_events", (table) => {
    table.string("id", 36).primary();
    table.string("event_type", 80).notNullable();
    table.string("severity", 20).notNullable().defaultTo("info");
    table.string("user_id", 36);
    table.string("source_ip", 120);
    table.text("details_json");
    table.boolean("alerted").notNullable().defaultTo(false);
    table.timestamp("created_at").notNullable();

    table.foreign("user_id").references("users.id");
    table.index(["event_type", "created_at"]);
    table.index(["severity", "created_at"]);
  });

  await knex.schema.createTable("financial_logs", (table) => {
    table.string("id", 36).primary();
    table.string("entry_type", 40).notNullable();
    table.string("reference_type", 40).notNullable();
    table.string("reference_id", 36).notNullable();
    table.decimal("amount", 10, 2).notNullable();
    table.string("payment_method", 40);
    table.string("shift_key", 80);
    table.text("metadata_json");
    table.string("previous_hash", 128);
    table.string("entry_hash", 128).notNullable();
    table.timestamp("created_at").notNullable();

    table.index(["entry_type", "created_at"]);
    table.index(["shift_key", "created_at"]);
  });

  await knex.schema.createTable("cash_drawer_counts", (table) => {
    table.string("id", 36).primary();
    table.string("shift_key", 80).notNullable();
    table.timestamp("shift_start").notNullable();
    table.timestamp("shift_end").notNullable();
    table.decimal("expected_total", 10, 2).notNullable();
    table.decimal("counted_total", 10, 2).notNullable();
    table.decimal("variance_amount", 10, 2).notNullable();
    table.boolean("variance_flag").notNullable().defaultTo(false);
    table.string("counted_by_user_id", 36);
    table.text("notes");
    table.timestamp("counted_at").notNullable();
    table.timestamp("created_at").notNullable();
    table.timestamp("updated_at").notNullable();

    table.foreign("counted_by_user_id").references("users.id");
    table.index(["shift_key", "counted_at"]);
  });

  await knex.schema.createTable("user_permissions", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36).notNullable();
    table.string("permission_key", 120).notNullable();
    table.boolean("is_allowed").notNullable().defaultTo(true);
    table.string("granted_by_user_id", 36);
    table.timestamp("created_at").notNullable();
    table.timestamp("updated_at").notNullable();

    table.foreign("user_id").references("users.id");
    table.foreign("granted_by_user_id").references("users.id");
    table.unique(["user_id", "permission_key"]);
  });

  await knex.schema.createTable("fines", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36).notNullable();
    table.string("reservation_id", 36);
    table.decimal("amount", 10, 2).notNullable();
    table.string("status", 20).notNullable().defaultTo("issued");
    table.string("reason", 255).notNullable();
    table.string("issued_by_user_id", 36);
    table.string("paid_order_id", 36);
    table.timestamp("created_at").notNullable();
    table.timestamp("updated_at").notNullable();

    table.foreign("user_id").references("users.id");
    table.foreign("reservation_id").references("reservations.id");
    table.foreign("issued_by_user_id").references("users.id");
    table.foreign("paid_order_id").references("orders.id");
    table.index(["user_id", "created_at"]);
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("fines");
  await knex.schema.dropTableIfExists("user_permissions");
  await knex.schema.dropTableIfExists("cash_drawer_counts");
  await knex.schema.dropTableIfExists("financial_logs");
  await knex.schema.dropTableIfExists("security_events");

  await knex.schema.alterTable("users", (table) => {
    table.dropColumn("last_failed_login_at");
    table.dropColumn("locked_until");
    table.dropColumn("failed_login_attempts");
    table.dropColumn("password_hash");
    table.dropColumn("password_salt");
    table.dropColumn("role");
  });
};
