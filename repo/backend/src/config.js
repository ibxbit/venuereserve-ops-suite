import dotenv from "dotenv";

dotenv.config();

export const config = {
  server: {
    host: process.env.HOST || "0.0.0.0",
    port: Number(process.env.PORT || 4000),
  },
  bootstrap: {
    autoRun: process.env.BOOTSTRAP_AUTO_RUN === "true",
    adminEmail: process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@local.test",
    adminFullName:
      process.env.BOOTSTRAP_ADMIN_FULL_NAME || "Initial Studio Manager",
    adminPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD || "",
  },
  workers: {
    orderExpiryEnabled: process.env.ORDER_EXPIRY_WORKER_ENABLED !== "false",
    orderExpiryIntervalMs: Number(
      process.env.ORDER_EXPIRY_INTERVAL_MS || 60000,
    ),
    orderExpiryBatchSize: Number(
      process.env.ORDER_EXPIRY_BATCH_SIZE || 50,
    ),
  },
  db: {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "studio_local",
  },
};
