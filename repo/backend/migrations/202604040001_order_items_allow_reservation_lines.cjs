/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable("order_items", (table) => {
    table.string("catalog_item_id", 36).nullable().alter();
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex("order_items").whereNull("catalog_item_id").del();
  await knex.schema.alterTable("order_items", (table) => {
    table.string("catalog_item_id", 36).notNullable().alter();
  });
};
