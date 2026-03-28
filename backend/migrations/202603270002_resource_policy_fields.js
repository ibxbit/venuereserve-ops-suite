/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable("resources", (table) => {
    table.integer("booking_window_days").unsigned().notNullable().defaultTo(30);
    table
      .integer("min_duration_minutes")
      .unsigned()
      .notNullable()
      .defaultTo(30);
    table
      .integer("max_duration_minutes")
      .unsigned()
      .notNullable()
      .defaultTo(240);
    table
      .integer("early_check_in_minutes")
      .unsigned()
      .notNullable()
      .defaultTo(10);
    table
      .integer("late_check_in_grace_minutes")
      .unsigned()
      .notNullable()
      .defaultTo(15);
    table.boolean("allow_slot_stitching").notNullable().defaultTo(true);
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.alterTable("resources", (table) => {
    table.dropColumn("allow_slot_stitching");
    table.dropColumn("late_check_in_grace_minutes");
    table.dropColumn("early_check_in_minutes");
    table.dropColumn("max_duration_minutes");
    table.dropColumn("min_duration_minutes");
    table.dropColumn("booking_window_days");
  });
};
