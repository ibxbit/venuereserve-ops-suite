/**
 * @param {import('knex').Knex} knex
 *
 * CRUD router writes created_at + updated_at on every insert/update, but two
 * resources exposed through the generic CRUD router (`security-events` and
 * `financial-logs`) were declared with only `created_at`. This migration
 * aligns them so the generic CRUD path does not throw at runtime.
 */
exports.up = async function up(knex) {
  const hasSecurityUpdatedAt = await knex.schema.hasColumn(
    "security_events",
    "updated_at",
  );
  if (!hasSecurityUpdatedAt) {
    await knex.schema.alterTable("security_events", (table) => {
      table.timestamp("updated_at");
    });
    await knex("security_events").update({
      updated_at: knex.ref("created_at"),
    });
  }

  const hasFinancialUpdatedAt = await knex.schema.hasColumn(
    "financial_logs",
    "updated_at",
  );
  if (!hasFinancialUpdatedAt) {
    await knex.schema.alterTable("financial_logs", (table) => {
      table.timestamp("updated_at");
    });
    await knex("financial_logs").update({
      updated_at: knex.ref("created_at"),
    });
  }
};

exports.down = async function down(knex) {
  const hasSecurityUpdatedAt = await knex.schema.hasColumn(
    "security_events",
    "updated_at",
  );
  if (hasSecurityUpdatedAt) {
    await knex.schema.alterTable("security_events", (table) => {
      table.dropColumn("updated_at");
    });
  }
  const hasFinancialUpdatedAt = await knex.schema.hasColumn(
    "financial_logs",
    "updated_at",
  );
  if (hasFinancialUpdatedAt) {
    await knex.schema.alterTable("financial_logs", (table) => {
      table.dropColumn("updated_at");
    });
  }
};
