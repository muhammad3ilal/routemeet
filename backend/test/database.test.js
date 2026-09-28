import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openDatabase } from "../storage/database.js";
const group = {
  name: "Weekend",
  activity: "coffee",
  mode: "demo",
  objective: "balanced",
  participants: [
    {
      id: "p1",
      name: "Alex",
      address: "My typed place",
      placeId: "I123",
    },
  ],
};
test("SQLite survives reopen, isolates owners, rolls back partial groups, and cascades deletion", () => {
  const directory = mkdtempSync(join(tmpdir(), "routemeet-test-")),
    path = join(directory, "db.sqlite");
  let db = openDatabase(path);
  try {
    const id = db.saveGroup("owner-a", group);
    const meetup = db.saveMeetup("owner-a", {
      label: "Saturday",
      venueId: "I456",
      mode: "maptiler",
      activity: "coffee",
      objective: "balanced",
    });
    assert.deepEqual(db.groups("owner-b"), []);
    assert.deepEqual(db.meetups("owner-b"), []);
    assert.equal(db.deleteGroup("owner-b", id), 0);
    assert.equal(db.deleteMeetup("owner-b", meetup), 0);
    assert.throws(() =>
      db.saveGroup("owner-a", {
        ...group,
        participants: [...group.participants, ...group.participants],
      }),
    );
    assert.equal(db.groups("owner-a").length, 1);
    db.close();
    db = openDatabase(path);
    assert.equal(db.groups("owner-a")[0].objective, "balanced");
    assert.equal("maxMinutes" in db.groups("owner-a")[0].participants[0], false);
    assert.equal(
      db.groups("owner-a")[0].participants[0].address,
      "My typed place",
    );
    assert.equal(db.meetups("owner-a")[0].venueId, "I456");
    assert.equal(db.deleteGroup("owner-a", id), 1);
    assert.deepEqual(db.groups("owner-a"), []);
    assert.equal(db.deleteMeetup("owner-a", meetup), 1);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

function createVersionTwoDatabase(path) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY);
    INSERT INTO schema_migrations VALUES(1),(2);
    CREATE TABLE groups(id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, activity TEXT NOT NULL, mode TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, objective TEXT NOT NULL DEFAULT 'balanced');
    CREATE TABLE participants(id TEXT NOT NULL, group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE, position INTEGER NOT NULL, name TEXT NOT NULL, address_input TEXT NOT NULL, place_id TEXT NOT NULL, max_minutes REAL NOT NULL CHECK(max_minutes BETWEEN 1 AND 180), PRIMARY KEY(group_id,id));
    CREATE TABLE meetups(id TEXT PRIMARY KEY, owner TEXT NOT NULL, label TEXT NOT NULL, venue_place_id TEXT NOT NULL, mode TEXT NOT NULL, activity TEXT NOT NULL, objective TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO groups VALUES('g-a','owner-a','Friends','coffee','maptiler','2026-09-01 12:00:00','efficient'),('g-b','owner-b','Family','parks','demo','2026-09-02 12:00:00','balanced');
    INSERT INTO participants VALUES('p-2','g-a',1,'Sam','Second typed address','place.second',180),('p-1','g-a',0,'Alex','First typed address','place.first',1),('p-1','g-b',0,'Jamie','Private typed address','place.private',30);
    INSERT INTO meetups VALUES('m-a','owner-a','Saturday','place.cafe','maptiler','coffee','efficient','2026-09-01 13:00:00');
  `);
  return db;
}

test("version 3 removes stored travel limits while preserving v2 plans, order, ownership, and foreign keys", () => {
  const directory = mkdtempSync(join(tmpdir(), "routemeet-migration-"));
  const path = join(directory, "db.sqlite");
  createVersionTwoDatabase(path).close();
  let db = openDatabase(path);
  try {
    const saved = db.groups("owner-a");
    assert.equal(saved.length, 1);
    assert.equal(saved[0].id, "g-a");
    assert.equal(saved[0].name, "Friends");
    assert.equal(saved[0].mode, "maptiler");
    assert.equal(saved[0].created_at, "2026-09-01 12:00:00");
    assert.equal(saved[0].objective, "balanced");
    assert.deepEqual(saved[0].participants.map((p) => ({ ...p })), [
      { id: "p-1", name: "Alex", address: "First typed address", placeId: "place.first" },
      { id: "p-2", name: "Sam", address: "Second typed address", placeId: "place.second" },
    ]);
    assert.equal(db.groups("owner-b")[0].participants[0].placeId, "place.private");
    assert.equal(db.meetups("owner-a")[0].id, "m-a");
    assert.equal(db.meetups("owner-a")[0].venueId, "place.cafe");
    assert.equal(db.meetups("owner-a")[0].objective, "balanced");
    assert.deepEqual(db.meetups("owner-b"), []);
    assert.equal(db.deleteGroup("owner-b", "g-a"), 0);
    const newId = db.saveGroup("owner-a", { ...group, objective: "efficient" });
    assert.equal(db.groups("owner-a").find((g) => g.id === newId).objective, "balanced");
    db.close();
    db = openDatabase(path);
    assert.equal(db.groups("owner-a").length, 2);
    assert.equal(db.deleteGroup("owner-a", "g-a"), 1);
    const raw = new DatabaseSync(path);
    try {
      assert.equal(raw.prepare("SELECT count(*) AS count FROM participants WHERE group_id='g-a'").get().count, 0);
      assert.equal(raw.prepare("SELECT count(*) AS count FROM participants WHERE group_id='g-b'").get().count, 1);
      assert.equal(raw.prepare("PRAGMA table_info(participants)").all().some((column) => column.name === "max_minutes"), false);
      assert.deepEqual(raw.prepare("PRAGMA foreign_key_check").all(), []);
      assert.deepEqual(raw.prepare("SELECT version FROM schema_migrations ORDER BY version").all().map((row) => row.version), [1, 2, 3]);
    } finally {
      raw.close();
    }
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a failed v3 migration restores the entire old participant table and can be retried", () => {
  const directory = mkdtempSync(join(tmpdir(), "routemeet-migration-rollback-"));
  const path = join(directory, "db.sqlite");
  const old = createVersionTwoDatabase(path);
  old.exec("CREATE TRIGGER block_migration BEFORE UPDATE ON groups BEGIN SELECT RAISE(ABORT, 'test migration failure'); END;");
  old.close();
  try {
    assert.throws(() => openDatabase(path), /test migration failure/);
    const raw = new DatabaseSync(path);
    try {
      assert.equal(raw.prepare("PRAGMA table_info(participants)").all().some((column) => column.name === "max_minutes"), true);
      assert.equal(raw.prepare("SELECT count(*) AS count FROM participants").get().count, 3);
      assert.equal(raw.prepare("SELECT objective FROM groups WHERE id='g-a'").get().objective, "efficient");
      assert.equal(raw.prepare("SELECT version FROM schema_migrations WHERE version=3").get(), undefined);
      raw.exec("DROP TRIGGER block_migration");
    } finally {
      raw.close();
    }
    const migrated = openDatabase(path);
    try {
      assert.equal(migrated.groups("owner-a")[0].participants.length, 2);
      assert.equal("maxMinutes" in migrated.groups("owner-a")[0].participants[0], false);
    } finally {
      migrated.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test("daily usage counters enforce requests and matrix elements atomically", () => {
  const db = openDatabase(":memory:");
  try {
    db.consume(8, 3, 10);
    assert.throws(
      () => db.consume(3, 3, 10),
      (e) => e.code === "DAILY_BUDGET",
    );
    db.consume(2, 3, 10);
    db.consume(0, 3, 10);
    assert.throws(
      () => db.consume(0, 3, 10),
      (e) => e.status === 429,
    );
  } finally {
    db.close();
  }
});
