import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { openDatabase } from "./storage/database.js";
import { mountFrontend } from "./web.js";

const root = dirname(fileURLToPath(import.meta.url));
if (existsSync(resolve(root, ".env")))
  process.loadEnvFile(resolve(root, ".env"));
const database = openDatabase(
  process.env.DATABASE_PATH || resolve(root, "data/routemeet.sqlite"),
);
const requestLimit = Number(process.env.MAP_MAX_REQUESTS_PER_DAY || 200);
const elementLimit = Number(process.env.MAP_MAX_MATRIX_ELEMENTS_PER_DAY || 2000);
if (!Number.isInteger(requestLimit) || requestLimit < 1 || !Number.isInteger(elementLimit) || elementLimit < 1)
  throw new Error("Daily request budgets must be positive integers.");
const app = createApp({
  database,
  maptilerKey: process.env.MAPTILER_API_KEY,
  routingUrl: process.env.OSRM_URL,
  overpassUrl: process.env.OVERPASS_URL,
  allowedOrigins: (
    process.env.ALLOWED_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173"
  ).split(",").map((origin) => origin.trim()).filter(Boolean),
  requestLimit,
  elementLimit,
  secureCookies: process.env.NODE_ENV === "production",
});
if (process.env.NODE_ENV === "production")
  mountFrontend(app, resolve(root, "../frontend/dist"));
const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const server = app.listen(port, host, () =>
  console.log(
    `RouteMeet: http://${host}:${port} (SQLite; MapTiler ${process.env.MAPTILER_API_KEY ? "configured" : "not configured"})`,
  ),
);
for (const event of ["SIGINT", "SIGTERM"])
  process.on(event, () =>
    server.close(() => {
      database.close();
      process.exit(0);
    }),
  );
