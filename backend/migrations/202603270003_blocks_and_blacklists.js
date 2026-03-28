/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.createTable("resource_blocks", (table) => {
    table.string("id", 36).primary();
    table.string("resource_id", 36).notNullable();
    table.timestamp("start_time").notNullable();
    table.timestamp("end_time").notNullable();
    table.string("reason", 255);
    table.boolean("is_active").notNullable().defaultTo(true);
    table.timestamp("created_at").notNullable();
    table.timestamp("updated_at").notNullable();

    table.foreign("resource_id").references("resources.id");
    table.index(["resource_id", "start_time"]);
  });

  await knex.schema.createTable("reservation_blacklists", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36).notNullable();
    table.string("resource_id", 36);
    table.timestamp("blocked_from").notNullable();
    table.timestamp("blocked_until");
    table.string("reason", 255);
    table.boolean("is_active").notNullable().defaultTo(true);
    table.timestamp("created_at").notNullable();
    table.timestamp("updated_at").notNullable();

    table.foreign("user_id").references("users.id");
    table.foreign("resource_id").references("resources.id");
    table.index(["user_id", "blocked_from"]);
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("reservation_blacklists");
  await knex.schema.dropTableIfExists("resource_blocks");
};
