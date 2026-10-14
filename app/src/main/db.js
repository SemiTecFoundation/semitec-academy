/* db.js — local database (SQLite via sql.js / WebAssembly — no native modules).
   One file: <dataDir>/learning.db. Written atomically after every change (debounced). */
'use strict';
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const SCHEMA_VERSION = 4;
const MIGRATIONS = {
  1: `
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL,
      pass_hash TEXT NOT NULL,
      pass_salt TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_login TEXT
    );
    CREATE TABLE packs (
      id TEXT PRIMARY KEY,
      version TEXT NOT NULL,
      title TEXT NOT NULL,
      publisher TEXT,
      signature TEXT NOT NULL,          -- trusted | untrusted-key | unsigned
      signed_by TEXT,
      manifest TEXT NOT NULL,           -- manifest.json as text
      installed_at TEXT NOT NULL,
      installed_by INTEGER
    );
    CREATE TABLE progress (
      user_id INTEGER NOT NULL,
      pack_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      item_type TEXT NOT NULL,
      state TEXT NOT NULL,              -- JSON, format depends on item type
      percent INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, pack_id, item_id)
    );
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
  `,
  /* 1.4.0: enrollment in a package (item_id = '') or in a project (item_id = project id), with a study plan */
  2: `
    CREATE TABLE enrollments (
      user_id INTEGER NOT NULL,
      pack_id TEXT NOT NULL,
      item_id TEXT NOT NULL DEFAULT '',
      start_date TEXT NOT NULL,           -- YYYY-MM-DD, week 1 of the plan starts here
      plan TEXT NOT NULL DEFAULT '{}',    -- JSON { mode: 'package' | 'finishBy' | 'self', finishBy }
      enrolled_at TEXT NOT NULL,
      PRIMARY KEY (user_id, pack_id, item_id)
    );
  `,
  /* 1.5.0: each user's own list of packages ("My packages") and the user's groups of packages */
  3: `
    CREATE TABLE user_packs (
      user_id INTEGER NOT NULL,
      pack_id TEXT NOT NULL,
      added_at TEXT NOT NULL,
      PRIMARY KEY (user_id, pack_id)
    );
    CREATE TABLE pack_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE pack_group_items (
      group_id INTEGER NOT NULL,
      pack_id TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (group_id, pack_id)
    );
    INSERT OR IGNORE INTO user_packs(user_id, pack_id, added_at)
      SELECT DISTINCT user_id, pack_id, MIN(updated_at) FROM progress GROUP BY user_id, pack_id;
    INSERT OR IGNORE INTO user_packs(user_id, pack_id, added_at)
      SELECT DISTINCT user_id, pack_id, MIN(enrolled_at) FROM enrollments GROUP BY user_id, pack_id;
    INSERT OR IGNORE INTO user_packs(user_id, pack_id, added_at)
      SELECT installed_by, id, installed_at FROM packs WHERE installed_by IS NOT NULL;
  `,
  4: `
    /* whether the signing key declares itself a development key ("development": true in its
       .json), so the badge no longer has to guess from the key name. Rows installed before
       this column existed keep the old guess, once. */
    ALTER TABLE packs ADD COLUMN signed_dev INTEGER NOT NULL DEFAULT 0;
    UPDATE packs SET signed_dev = 1 WHERE signature = 'trusted' AND signed_by LIKE '%dev%';
  `
};

class DB {
  static async open(dataDir) {
    const SQL = await initSqlJs({ locateFile: (f) => path.join(path.dirname(require.resolve('sql.js')), f) });
    const file = path.join(dataDir, 'learning.db');
    const db = new DB();
    db.file = file;
    db.sql = fs.existsSync(file) ? new SQL.Database(fs.readFileSync(file)) : new SQL.Database();
    db.sql.run('PRAGMA foreign_keys = ON');
    db.migrate();
    return db;
  }
  migrate() {
    const v = this.sql.exec('PRAGMA user_version')[0].values[0][0];
    for (let n = v + 1; n <= SCHEMA_VERSION; n++) {
      this.sql.run('BEGIN'); this.sql.run(MIGRATIONS[n]); this.sql.run(`PRAGMA user_version = ${n}`); this.sql.run('COMMIT');
    }
    if (v < SCHEMA_VERSION) this.flush();
  }
  all(q, p = []) {
    const st = this.sql.prepare(q); st.bind(p);
    const rows = []; while (st.step()) rows.push(st.getAsObject()); st.free();
    return rows;
  }
  get(q, p = []) { return this.all(q, p)[0] || null; }
  run(q, p = []) { this.sql.run(q, p); this.changed(); }
  changed() { clearTimeout(this.t); this.t = setTimeout(() => this.flush(), 400); }
  flush() {
    clearTimeout(this.t);
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, Buffer.from(this.sql.export()));
    fs.renameSync(tmp, this.file);
  }
  setting(k, v) {
    if (v === undefined) { const r = this.get('SELECT value FROM settings WHERE key=?', [k]); return r ? JSON.parse(r.value) : null; }
    this.run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [k, JSON.stringify(v)]);
  }
  close() { this.flush(); this.sql.close(); }
}
module.exports = { DB, SCHEMA_VERSION };
