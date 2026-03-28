/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable("catalog_items", (table) => {
    table.integer("inventory_on_hand").unsigned().notNullable().defaultTo(0);
    table.integer("inventory_reserved").unsigned().notNullable().defaultTo(0);
  });

  await knex.schema.alterTable("orders", (table) => {
    table.string("state", 40).notNullable().defaultTo("pending_payment");
    table.timestamp("expires_at");
    table.timestamp("paid_at");
    table.timestamp("cancelled_at");
    table.text("cancelled_reason");
    table.string("payment_reference_masked", 255);
    table.string("payment_last_four", 4);
  });

  await knex.schema.createTable("idempotency_keys", (table) => {
    table.string("id", 36).primary();
    table.string("operation", 120).notNullable();
    table.string("idempotency_key", 180).notNullable();
    table.integer("status_code").notNullable();
    table.text("response_json").notNullable();
    table.timestamp("created_at").notNullable();
    table.timestamp("expires_at");

    table.unique(["operation", "idempotency_key"]);
    table.index(["expires_at"]);
  });

  await knex.schema.createTable("order_state_events", (table) => {
    table.string("id", 36).primary();
    table.string("order_id", 36).notNullable();
    table.string("from_state", 40);
    table.string("to_state", 40).notNullable();
    table.string("event_type", 80).notNullable();
    table.text("reason");
    table.string("idempotency_key", 180);
    table.string("actor_user_id", 36);
    table.text("payload_json");
    table.timestamp("created_at").notNullable();

    table.foreign("order_id").references("orders.id");
    table.index(["order_id", "created_at"]);
  });

  await knex.schema.createTable("order_holds", (table) => {
    table.string("id", 36).primary();
    table.string("order_id", 36).notNullable();
    table.string("hold_type", 40).notNullable();
    table.string("reference_id", 36).notNullable();
    table.integer("quantity").unsigned().notNullable().defaultTo(1);
    table.string("status", 20).notNullable().defaultTo("held");
    table.text("metadata_json");
    table.timestamp("created_at").notNullable();
    table.timestamp("released_at");

    table.foreign("order_id").references("orders.id");
    table.index(["order_id", "status"]);
  });

  await knex.schema.createTable("order_payments", (table) => {
    table.string("id", 36).primary();
    table.string("order_id", 36).notNullable();
    table.string("payment_method", 40).notNullable();
    table.decimal("amount", 10, 2).notNullable();
    table.string("status", 20).notNullable();
    table.string("masked_reference", 255);
    table.string("last_four", 4);
    table.timestamp("created_at").notNullable();
    table.timestamp("updated_at").notNullable();

    table.foreign("order_id").references("orders.id");
    table.index(["order_id", "created_at"]);
  });

  await knex("catalog_items")
    .where({ category: "merchandise" })
    .update({
      inventory_on_hand: 150,
      inventory_reserved: 0,
      updated_at: new Date(),
    });

  await knex("orders").update({
    state: "pending_payment",
    status: "pending_payment",
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("order_payments");
  await knex.schema.dropTableIfExists("order_holds");
  await knex.schema.dropTableIfExists("order_state_events");
  await knex.schema.dropTableIfExists("idempotency_keys");

  await knex.schema.alterTable("orders", (table) => {
    table.dropColumn("payment_last_four");
    table.dropColumn("payment_reference_masked");
    table.dropColumn("cancelled_reason");
    table.dropColumn("cancelled_at");
    table.dropColumn("paid_at");
    table.dropColumn("expires_at");
    table.dropColumn("state");
  });

  await knex.schema.alterTable("catalog_items", (table) => {
    table.dropColumn("inventory_reserved");
    table.dropColumn("inventory_on_hand");
  });
};
