import { config } from "./config.js";
import { db } from "./db.js";
import { runBootstrap } from "./services/bootstrap-service.js";
import { logger } from "./utils/logger.js";

async function main() {
  try {
    const result = await runBootstrap({
      adminEmail: config.bootstrap.adminEmail,
      adminFullName: config.bootstrap.adminFullName,
      adminPassword: config.bootstrap.adminPassword,
    });
    logger.info({ bootstrap: result }, "Bootstrap completed");
  } catch (error) {
    logger.error({ err: error }, "Bootstrap failed");
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
}

main();
