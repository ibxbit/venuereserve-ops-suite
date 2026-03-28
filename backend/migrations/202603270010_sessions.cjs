/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.createTable("sessions", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36).notNullable();
    table.string("token", 255).notNullable().unique();
    table.string("role", 30).notNullable();
    table.timestamp("created_at").notNullable();
    table.timestamp("expires_at").notNullable();

    table.foreign("user_id").references("users.id");
    table.index(["token"]);
    table.index(["expires_at"]);
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("sessions");
};
