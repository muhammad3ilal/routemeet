// server.js -- RouteMeet API entry point

import express from "express";
import cors from "cors";
import optimizeRouter from "./routes/optimize.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "routemeet-backend" });
});

app.use("/api", optimizeRouter);

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Unexpected server error." });
});

app.listen(PORT, () => {
  console.log(`RouteMeet backend listening on http://localhost:${PORT}`);
});
