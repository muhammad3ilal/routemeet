import express from "express";
import { accessSync, constants, statSync } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";

// Mount after the API routes, and only for a production build. Keeping the
// browser and API on one origin preserves the planner's cookie ownership.
export function mountFrontend(app, directory) {
  const root = resolve(directory);
  const index = resolve(root, "index.html");
  try {
    if (!statSync(index).isFile()) throw new Error("Not a regular file");
    accessSync(index, constants.R_OK);
  } catch {
    throw new Error(`Frontend production build is missing or unreadable at ${index}. Build the frontend before starting the production server.`);
  }

  // An unknown API path must never return a successful HTML application shell.
  const apiNotFound = (_req, res) => res.status(404).set("Cache-Control", "no-store").json({
    error: "API endpoint not found.", code: "NOT_FOUND",
  });
  app.use("/api", apiNotFound);
  app.use((req, res, next) => {
    let path;
    try { path = decodeURIComponent(req.path); } catch { return next(); }
    if (/^\/api(?:\/|$)/i.test(path)) return apiNotFound(req, res);
    next();
  });

  app.use(express.static(root, {
    dotfiles: "deny",
    index: false,
    redirect: false,
    maxAge: 0,
    setHeaders(res, file) {
      const path = relative(root, file).split(sep).join("/");
      if (extname(file).toLowerCase() === ".html") res.setHeader("Cache-Control", "no-store");
      // Vite writes content-fingerprinted bundles into assets; a changed build
      // generates a new URL, while public files outside it may keep their names.
      else if (path.startsWith("assets/")) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      else res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
      res.setHeader("X-Content-Type-Options", "nosniff");
    },
  }));

  app.use((req, res, next) => {
    let path;
    try { path = decodeURIComponent(req.path); }
    catch { return res.status(400).set("Cache-Control", "no-store").type("text").send("Invalid URL."); }
    const segments = path.split("/");
    const isFileRequest = !!extname(path) || segments.some((segment) => segment.startsWith(".")) || path === "/assets" || path.startsWith("/assets/");
    if (req.method !== "GET" || !req.accepts("html") || isFileRequest) return next();
    res.sendFile(index, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }, (error) => {
      if (error) next(error);
    });
  });
  app.use((_req, res) => res.status(404).set("Cache-Control", "no-store").type("text").send("Not found."));
  // createApp's API error handler is earlier in the stack, so static-file
  // failures need their own handler without exposing local paths or internals.
  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    const status = [400, 403, 404].includes(error.status) ? error.status : 500;
    res.status(status).set("Cache-Control", "no-store").type("text").send(status === 500 ? "The page could not be loaded." : "Not found.");
  });
  return app;
}
