import { createApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./utils/logger.js";

const app = createApp();

app.listen(config.server.port, config.server.host, () => {
  logger.info(
    `Studio backend running at http://${config.server.host}:${config.server.port}`,
  );
});
