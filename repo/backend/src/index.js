import { createApp } from "./app.js";
import { config } from "./config.js";
import { runBootstrap } from "./services/bootstrap-service.js";
import { startOrderExpiryWorker } from "./services/order-expiry-worker.js";
import { logger } from "./utils/logger.js";

const app = createApp();
let orderExpiryWorker = null;

if (config.bootstrap.autoRun) {
  runBootstrap({
    adminEmail: config.bootstrap.adminEmail,
    adminFullName: config.bootstrap.adminFullName,
    adminPassword: config.bootstrap.adminPassword,
  })
    .then((result) => {
      logger.info({ bootstrap: result }, "Bootstrap completed");
    })
    .catch((error) => {
      logger.error({ err: error }, "Bootstrap failed");
    });
}

if (config.workers.orderExpiryEnabled) {
  orderExpiryWorker = startOrderExpiryWorker({
    intervalMs: config.workers.orderExpiryIntervalMs,
    batchSize: config.workers.orderExpiryBatchSize,
  });
}

app.listen(config.server.port, config.server.host, () => {
  logger.info(
    `Studio backend running at http://${config.server.host}:${config.server.port}`,
  );
});

function stopWorkers() {
  orderExpiryWorker?.stop();
}

process.on("SIGINT", stopWorkers);
process.on("SIGTERM", stopWorkers);
