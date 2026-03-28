/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.createTable("community_posts", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36).notNullable();
    table.string("parent_post_id", 36);
    table.text("content").notNullable();
    table.string("status", 20).notNullable().defaultTo("published");
    table.string("hold_reason", 255);
    table.integer("flag_count").unsigned().notNullable().defaultTo(0);
    table.string("author_ip", 120);
    table.string("device_fingerprint", 160);
    table.timestamp("published_at");
    table.timestamp("created_at").notNullable();
    table.timestamp("updated_at").notNullable();

    table.foreign("user_id").references("users.id");
    table.foreign("parent_post_id").references("community_posts.id");
    table.index(["status", "created_at"]);
    table.index(["user_id", "created_at"]);
  });

  await knex.schema.createTable("community_reports", (table) => {
    table.string("id", 36).primary();
    table.string("post_id", 36).notNullable();
    table.string("reporter_user_id", 36).notNullable();
    table.text("reason").notNullable();
    table.string("status", 20).notNullable().defaultTo("open");
    table.text("resolution_note");
    table.string("resolved_by_user_id", 36);
    table.timestamp("resolved_at");
    table.timestamp("created_at").notNullable();
    table.timestamp("updated_at").notNullable();

    table.foreign("post_id").references("community_posts.id");
    table.foreign("reporter_user_id").references("users.id");
    table.foreign("resolved_by_user_id").references("users.id");
    table.unique(["post_id", "reporter_user_id"]);
    table.index(["status", "created_at"]);
  });

  await knex.schema.createTable("community_bans", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36).notNullable();
    table.string("source_report_id", 36);
    table.string("reason", 255);
    table.boolean("is_permanent").notNullable().defaultTo(false);
    table.timestamp("expires_at");
    table.string("created_by_user_id", 36);
    table.timestamp("created_at").notNullable();
    table.timestamp("updated_at").notNullable();

    table.foreign("user_id").references("users.id");
    table.foreign("source_report_id").references("community_reports.id");
    table.foreign("created_by_user_id").references("users.id");
    table.index(["user_id", "expires_at"]);
  });

  await knex.schema.createTable("community_rules", (table) => {
    table.string("id", 36).primary();
    table.string("rule_type", 20).notNullable();
    table.string("target_type", 20).notNullable();
    table.string("value", 255).notNullable();
    table.boolean("is_active").notNullable().defaultTo(true);
    table.timestamp("created_at").notNullable();
    table.timestamp("updated_at").notNullable();

    table.index(["rule_type", "target_type", "is_active"]);
  });

  await knex.schema.createTable("community_settings", (table) => {
    table.string("id", 36).primary();
    table.integer("max_posts_per_hour").unsigned().notNullable().defaultTo(10);
    table.integer("max_device_posts_per_hour").unsigned();
    table.integer("max_ip_posts_per_hour").unsigned();
    table.boolean("captcha_required").notNullable().defaultTo(true);
    table
      .integer("auto_hold_report_threshold")
      .unsigned()
      .notNullable()
      .defaultTo(3);
    table.timestamp("created_at").notNullable();
    table.timestamp("updated_at").notNullable();
  });

  await knex.schema.createTable("captcha_challenges", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36);
    table.string("challenge_text", 255).notNullable();
    table.string("expected_answer", 120).notNullable();
    table.string("author_ip", 120);
    table.string("device_fingerprint", 160);
    table.timestamp("expires_at").notNullable();
    table.timestamp("solved_at");
    table.timestamp("created_at").notNullable();

    table.foreign("user_id").references("users.id");
    table.index(["user_id", "expires_at"]);
  });

  await knex("community_settings").insert({
    id: "community-default-settings",
    max_posts_per_hour: 10,
    max_device_posts_per_hour: null,
    max_ip_posts_per_hour: null,
    captcha_required: true,
    auto_hold_report_threshold: 3,
    created_at: new Date(),
    updated_at: new Date(),
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("captcha_challenges");
  await knex.schema.dropTableIfExists("community_settings");
  await knex.schema.dropTableIfExists("community_rules");
  await knex.schema.dropTableIfExists("community_bans");
  await knex.schema.dropTableIfExists("community_reports");
  await knex.schema.dropTableIfExists("community_posts");
};
