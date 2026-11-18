// Process entry point: `npm start`.

import { loadConfig } from "./config.js";
import { buildApp } from "./app.js";

const config = loadConfig();
const app = await buildApp(config);

async function shutdown(signal) {
  app.log.info({ signal }, "shutting down");
  try {
    await app.close();
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, "error during shutdown");
    process.exit(1);
  }
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error({ err }, "failed to start");
  process.exit(1);
}
