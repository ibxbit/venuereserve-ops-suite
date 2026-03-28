/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.createTable("catalog_items", (table) => {
    table.string("id", 36).primary();
    table.string("sku", 80).notNullable().unique();
    table.string("name", 180).notNullable();
    table.string("category", 40).notNullable();
    table.decimal("base_price", 10, 2).notNullable();
    table.string("currency", 8).notNullable().defaultTo("USD");
    table.string("fulfillment_path", 40).notNullable();
    table.boolean("is_active").notNullable().defaultTo(true);
    table.text("metadata_json");
    table.timestamp("created_at").notNullable();
    table.timestamp("updated_at").notNullable();

    table.index(["category", "is_active"]);
  });

  await knex.schema.createTable("coupons", (table) => {
    table.string("id", 36).primary();
    table.string("code", 60).notNullable().unique();
    table.string("name", 140).notNullable();
    table.string("discount_type", 20).notNullable();
    table.decimal("discount_value", 10, 2).notNullable();
    table.decimal("min_subtotal", 10, 2).notNullable().defaultTo(0);
    table.decimal("max_discount", 10, 2);
    table.string("applies_to_category", 40);
    table.boolean("is_active").notNullable().defaultTo(true);
    table.timestamp("starts_at");
    table.timestamp("ends_at");
    table.timestamp("created_at").notNullable();
    table.timestamp("updated_at").notNullable();

    table.index(["code", "is_active"]);
  });

  await knex.schema.createTable("order_groups", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36).notNullable();
    table.string("status", 40).notNullable().defaultTo("submitted");
    table.decimal("subtotal_amount", 10, 2).notNullable();
    table.decimal("discount_amount", 10, 2).notNullable();
    table.decimal("total_amount", 10, 2).notNullable();
    table.string("coupon_code", 60);
    table.text("metadata_json");
    table.timestamp("created_at").notNullable();
    table.timestamp("updated_at").notNullable();

    table.foreign("user_id").references("users.id");
    table.index(["user_id", "created_at"]);
  });

  await knex.schema.alterTable("orders", (table) => {
    table.string("order_group_id", 36);
    table
      .string("fulfillment_path", 40)
      .notNullable()
      .defaultTo("instant_activation");
    table.string("coupon_code", 60);
    table.text("metadata_json");

    table.foreign("order_group_id").references("order_groups.id");
    table.index(["order_group_id"]);
  });

  await knex.schema.createTable("order_items", (table) => {
    table.string("id", 36).primary();
    table.string("order_id", 36).notNullable();
    table.string("catalog_item_id", 36).notNullable();
    table.string("item_name", 180).notNullable();
    table.string("category", 40).notNullable();
    table.integer("quantity").unsigned().notNullable();
    table.decimal("unit_price", 10, 2).notNullable();
    table.decimal("subtotal_amount", 10, 2).notNullable();
    table.decimal("discount_amount", 10, 2).notNullable();
    table.decimal("total_amount", 10, 2).notNullable();
    table.string("fulfillment_path", 40).notNullable();
    table.text("metadata_json");
    table.timestamp("created_at").notNullable();
    table.timestamp("updated_at").notNullable();

    table.foreign("order_id").references("orders.id");
    table.foreign("catalog_item_id").references("catalog_items.id");
    table.index(["order_id", "created_at"]);
  });

  await knex("catalog_items").insert([
    {
      id: "cat-membership-new-monthly",
      sku: "MEM-NEW-MONTHLY",
      name: "Monthly Membership (New)",
      category: "membership_new",
      base_price: 89.0,
      currency: "USD",
      fulfillment_path: "instant_activation",
      is_active: true,
      metadata_json: JSON.stringify({ duration_days: 30 }),
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: "cat-membership-renew-monthly",
      sku: "MEM-RENEW-MONTHLY",
      name: "Monthly Membership (Renewal)",
      category: "membership_renewal",
      base_price: 79.0,
      currency: "USD",
      fulfillment_path: "instant_activation",
      is_active: true,
      metadata_json: JSON.stringify({ duration_days: 30 }),
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: "cat-class-pack-10",
      sku: "CLSPACK-10",
      name: "10-Class Pack",
      category: "class_pack",
      base_price: 120.0,
      currency: "USD",
      fulfillment_path: "instant_activation",
      is_active: true,
      metadata_json: JSON.stringify({ classes: 10 }),
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: "cat-merch-shirt",
      sku: "MERCH-SHIRT",
      name: "Studio Branded Shirt",
      category: "merchandise",
      base_price: 28.0,
      currency: "USD",
      fulfillment_path: "front_desk_pickup",
      is_active: true,
      metadata_json: JSON.stringify({ size_options: ["S", "M", "L", "XL"] }),
      created_at: new Date(),
      updated_at: new Date(),
    },
  ]);

  await knex("coupons").insert([
    {
      id: "coupon-10-off-75",
      code: "SAVE10OVER75",
      name: "$10 off purchases over $75",
      discount_type: "fixed",
      discount_value: 10.0,
      min_subtotal: 75.0,
      max_discount: null,
      applies_to_category: null,
      is_active: true,
      starts_at: null,
      ends_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: "coupon-15pct-class-pack",
      code: "CLASSPACK15",
      name: "15% off class packs (max $25)",
      discount_type: "percentage",
      discount_value: 15.0,
      min_subtotal: 0,
      max_discount: 25.0,
      applies_to_category: "class_pack",
      is_active: true,
      starts_at: null,
      ends_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    },
  ]);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("order_items");

  await knex.schema.alterTable("orders", (table) => {
    table.dropColumn("metadata_json");
    table.dropColumn("coupon_code");
    table.dropColumn("fulfillment_path");
    table.dropColumn("order_group_id");
  });

  await knex.schema.dropTableIfExists("order_groups");
  await knex.schema.dropTableIfExists("coupons");
  await knex.schema.dropTableIfExists("catalog_items");
};
