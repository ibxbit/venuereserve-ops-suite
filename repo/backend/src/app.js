import Koa from "koa";
import cors from "@koa/cors";
import bodyParser from "koa-bodyparser";
import { errorHandler } from "./middleware/error-handler.js";
import { requestContext } from "./middleware/request-context.js";
import { apiRouter } from "./routes/index.js";

export function createApp() {
  const app = new Koa();

  app.use(errorHandler);
  app.use(cors({ origin: "*" }));
  app.use(bodyParser());
  app.use(requestContext);
  app.use(apiRouter.routes());
  app.use(apiRouter.allowedMethods());

  return app;
}
