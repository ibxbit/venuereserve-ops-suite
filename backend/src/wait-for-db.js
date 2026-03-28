import { db } from "./db.js";
import { logger } from "./utils/logger.js";

const MAX_RETRIES = Number(process.env.DB_WAIT_RETRIES || 60);
const RETRY_DELAY_MS = Number(process.env.DB_WAIT_DELAY_MS || 2000);

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForDatabase() {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      await db.raw("SELECT 1");
      logger.info("Database is ready.");
      await db.destroy();
      return;
    } catch (error) {
      logger.info(
        `Waiting for database... attempt ${attempt}/${MAX_RETRIES} (${error.message})`,
      );
      await sleep(RETRY_DELAY_MS);
    }
  }

  logger.error("Database did not become ready in time.");
  await db.destroy();
  process.exit(1);
}

waitForDatabase();
