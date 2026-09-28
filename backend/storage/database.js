import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { ServiceError } from "../errors.js";

export function openDatabase(path) {
  if (path !== ":memory:")
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS groups(id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, activity TEXT NOT NULL, mode TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS groups_owner ON groups(owner, created_at);
    CREATE TABLE IF NOT EXISTS participants(id TEXT NOT NULL, group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE, position INTEGER NOT NULL, name TEXT NOT NULL, address_input TEXT NOT NULL, place_id TEXT NOT NULL, PRIMARY KEY(group_id,id));
    CREATE TABLE IF NOT EXISTS meetups(id TEXT PRIMARY KEY, owner TEXT NOT NULL, label TEXT NOT NULL, venue_place_id TEXT NOT NULL, mode TEXT NOT NULL, activity TEXT NOT NULL, objective TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS meetups_owner ON meetups(owner, created_at);
    CREATE TABLE IF NOT EXISTS usage(day TEXT PRIMARY KEY, requests INTEGER NOT NULL DEFAULT 0, elements INTEGER NOT NULL DEFAULT 0);
    INSERT OR IGNORE INTO schema_migrations VALUES(1);`);
  if (
    !db.prepare("SELECT version FROM schema_migrations WHERE version=2").get()
  ) {
    db.exec(
      "BEGIN IMMEDIATE; ALTER TABLE groups ADD COLUMN objective TEXT NOT NULL DEFAULT 'balanced'; INSERT INTO schema_migrations VALUES(2); COMMIT;",
    );
  }
  if (
    !db.prepare("SELECT version FROM schema_migrations WHERE version=3").get()
  ) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const hasTravelLimits = db
        .prepare("PRAGMA table_info(participants)")
        .all()
        .some((column) => column.name === "max_minutes");
      if (hasTravelLimits) {
        // Rebuild the child table in one transaction so older SQLite files keep
        // participant order, ownership through the group, and cascading deletes.
        db.exec(`
          CREATE TABLE participants_v3(id TEXT NOT NULL, group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE, position INTEGER NOT NULL, name TEXT NOT NULL, address_input TEXT NOT NULL, place_id TEXT NOT NULL, PRIMARY KEY(group_id,id));
          INSERT INTO participants_v3(id,group_id,position,name,address_input,place_id)
            SELECT id,group_id,position,name,address_input,place_id FROM participants;
          DROP TABLE participants;
          ALTER TABLE participants_v3 RENAME TO participants;
        `);
      }
      db.exec(`
        UPDATE groups SET objective='balanced';
        UPDATE meetups SET objective='balanced';
        INSERT INTO schema_migrations VALUES(3);
        COMMIT;
      `);
    } catch (error) {
      db.exec("ROLLBACK");
      db.close();
      throw error;
    }
  }
  return {
    close: () => db.close(),
    saveGroup(owner, group) {
      const id = randomUUID();
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare(
          "INSERT INTO groups(id,owner,name,activity,mode,objective) VALUES(?,?,?,?,?,?)",
        ).run(
          id,
          owner,
          group.name,
          group.activity,
          group.mode,
          "balanced",
        );
        const insert = db.prepare(
          "INSERT INTO participants(id,group_id,position,name,address_input,place_id) VALUES(?,?,?,?,?,?)",
        );
        group.participants.forEach((p, i) =>
          insert.run(p.id, id, i, p.name, p.address, p.placeId),
        );
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      return id;
    },
    groups(owner) {
      return db
        .prepare(
          "SELECT id,name,activity,mode,objective,created_at FROM groups WHERE owner=? ORDER BY created_at DESC,id",
        )
        .all(owner)
        .map((g) => ({
          ...g,
          participants: db
            .prepare(
              "SELECT id,name,address_input AS address,place_id AS placeId FROM participants WHERE group_id=? ORDER BY position",
            )
            .all(g.id),
        }));
    },
    deleteGroup(owner, id) {
      return db
        .prepare("DELETE FROM groups WHERE owner=? AND id=?")
        .run(owner, id).changes;
    },
    saveMeetup(owner, plan) {
      const id = randomUUID();
      db.prepare(
        "INSERT INTO meetups(id,owner,label,venue_place_id,mode,activity,objective) VALUES(?,?,?,?,?,?,?)",
      ).run(
        id,
        owner,
        plan.label,
        plan.venueId,
        plan.mode,
        plan.activity,
        "balanced",
      );
      return id;
    },
    meetups(owner) {
      return db
        .prepare(
          "SELECT id,label,venue_place_id AS venueId,mode,activity,objective,created_at FROM meetups WHERE owner=? ORDER BY created_at DESC,id LIMIT 50",
        )
        .all(owner);
    },
    deleteMeetup(owner, id) {
      return db
        .prepare("DELETE FROM meetups WHERE owner=? AND id=?")
        .run(owner, id).changes;
    },
    consume(elements = 0, requestLimit = 200, elementLimit = 2000) {
      const day = new Date().toISOString().slice(0, 10);
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare("INSERT OR IGNORE INTO usage(day) VALUES(?)").run(day);
        const current = db
          .prepare("SELECT requests,elements FROM usage WHERE day=?")
          .get(day);
        if (
          current.requests + 1 > requestLimit ||
          current.elements + elements > elementLimit
        )
          throw new ServiceError(
            "The local daily map-service request budget has been reached. Try the example or return tomorrow.",
            429,
            "DAILY_BUDGET",
          );
        db.prepare(
          "UPDATE usage SET requests=requests+1,elements=elements+? WHERE day=?",
        ).run(elements, day);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
