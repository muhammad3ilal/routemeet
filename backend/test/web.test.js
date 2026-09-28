import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import express from "express";
import { createApp } from "../app.js";
import { openDatabase } from "../storage/database.js";
import { mountFrontend } from "../web.js";

const indexHtml = '<!doctype html><html><body><main>RouteMeet fixture</main></body></html>';
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "routemeet-web-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, "assets"));
  await mkdir(join(directory, ".private"));
  await Promise.all([
    writeFile(join(directory, "index.html"), indexHtml),
    writeFile(join(directory, "assets", "app-abc12345.js"), 'console.log("RouteMeet bundle");'),
    writeFile(join(directory, "privacy.html"), "<!doctype html><title>Privacy policy</title>"),
    writeFile(join(directory, "logo.svg"), '<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    writeFile(join(directory, ".env"), "PRIVATE_FIXTURE_MUST_NEVER_BE_SERVED=yes"),
    writeFile(join(directory, ".private", "secret"), "PRIVATE_FIXTURE_MUST_NEVER_BE_SERVED"),
  ]);
  return directory;
}

test("production frontend serves real files and HTML routes while preserving existing API routes", async (t) => {
  const directory = await fixture(t);
  const database = openDatabase(":memory:");
  const app = createApp({ database });
  mountFrontend(app, directory);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    database.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (path, options = {}) => fetch(base + path, { headers: { Accept: "text/html", ...options.headers }, ...options });

  for (const path of ["/", "/index.html", "/planner/meeting?from=bookmark"]) {
    const result = await get(path);
    assert.equal(result.status, 200, path);
    assert.equal(await result.text(), indexHtml, path);
    assert.match(result.headers.get("content-type"), /text\/html/);
    assert.equal(result.headers.get("cache-control"), "no-store");
    assert.equal(result.headers.get("x-content-type-options"), "nosniff");
  }
  const bundle = await get("/assets/app-abc12345.js");
  assert.equal(bundle.status, 200);
  assert.equal(await bundle.text(), 'console.log("RouteMeet bundle");');
  assert.match(bundle.headers.get("content-type"), /javascript/);
  assert.equal(bundle.headers.get("cache-control"), "public, max-age=31536000, immutable");
  const logo = await get("/logo.svg");
  assert.equal(logo.status, 200);
  assert.equal(logo.headers.get("cache-control"), "public, max-age=0, must-revalidate");
  const privacy = await get("/privacy.html");
  assert.equal(privacy.status, 200);
  assert.match(await privacy.text(), /Privacy policy/);
  assert.equal(privacy.headers.get("cache-control"), "no-store");

  const config = await get("/api/config");
  assert.equal(config.status, 200);
  assert.equal((await config.json()).demoAvailable, true);
  const health = await get("/api/health");
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok", service: "routemeet", storage: "sqlite" });
  for (const path of ["/api", "/api/missing", "/api/missing.js", "/api%2Fmissing"]) {
    const missingApi = await get(path);
    assert.equal(missingApi.status, 404, path);
    assert.match(missingApi.headers.get("content-type"), /application\/json/);
    assert.deepEqual(await missingApi.json(), { error: "API endpoint not found.", code: "NOT_FOUND" });
  }

  for (const path of ["/missing.js", "/missing.css", "/assets/missing", "/assets", "/nested/missing.svg"]) {
    const missingAsset = await get(path);
    assert.equal(missingAsset.status, 404, path);
    assert.equal(await missingAsset.text(), "Not found.");
  }
  const jsonRequest = await get("/planner/meeting", { headers: { Accept: "application/json" } });
  assert.equal(jsonRequest.status, 404);
  const postRequest = await get("/planner/meeting", { method: "POST" });
  assert.equal(postRequest.status, 404);
  const headRequest = await get("/planner/meeting", { method: "HEAD" });
  assert.equal(headRequest.status, 404);

  for (const path of ["/.env", "/%2eenv", "/.private/secret", "/%2eprivate/secret", "/assets/%2eprivate/secret"]) {
    const hidden = await get(path);
    assert.ok([403, 404].includes(hidden.status), path);
    const text = await hidden.text();
    assert.ok(!text.includes("PRIVATE_FIXTURE_MUST_NEVER_BE_SERVED"), path);
    assert.notEqual(text, indexHtml, path);
  }
});

test("production mounting fails fast with a useful message when index is missing or is a directory", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "routemeet-web-missing-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  assert.throws(() => mountFrontend(express(), directory), /Frontend production build is missing or unreadable.*Build the frontend/);
  await mkdir(join(directory, "index.html"));
  assert.throws(() => mountFrontend(express(), directory), /Frontend production build is missing or unreadable/);
});
