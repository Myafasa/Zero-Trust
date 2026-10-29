PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS service_clients;
DROP TABLE IF EXISTS transkrip;
DROP TABLE IF EXISTS nilai;
DROP TABLE IF EXISTS kelas;
DROP TABLE IF EXISTS devices;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nama          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('mahasiswa','dosen','admin')),
  nim           TEXT UNIQUE                      -- hanya untuk mahasiswa
);

CREATE TABLE devices (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id  TEXT NOT NULL,
  UNIQUE (user_id, device_id)
);

CREATE TABLE kelas (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  kode      TEXT NOT NULL UNIQUE,
  nama      TEXT NOT NULL,
  sks       INTEGER NOT NULL DEFAULT 3,
  dosen_id  INTEGER NOT NULL REFERENCES users(id)
);

CREATE TABLE nilai (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kelas_id      INTEGER NOT NULL REFERENCES kelas(id),
  mahasiswa_id  INTEGER NOT NULL REFERENCES users(id),
  nilai         REAL CHECK (nilai IS NULL OR (nilai >= 0 AND nilai <= 100)),
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','final')),
  updated_at    TEXT,
  UNIQUE (kelas_id, mahasiswa_id)
);

CREATE TABLE transkrip (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nim        TEXT NOT NULL REFERENCES users(nim),
  kelas_id   INTEGER NOT NULL REFERENCES kelas(id),
  kode_mk    TEXT NOT NULL,
  nama_mk    TEXT NOT NULL,
  sks        INTEGER NOT NULL,
  nilai      REAL NOT NULL,
  huruf      TEXT NOT NULL,
  synced_at  TEXT NOT NULL,
  UNIQUE (nim, kelas_id)
);

CREATE TABLE refresh_tokens (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,              -- SHA-256 dari token (token asli tidak disimpan)
  device_id   TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  revoked     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE TABLE service_clients (
  client_id    TEXT PRIMARY KEY,
  secret_hash  TEXT NOT NULL,
  nama         TEXT
);

CREATE TABLE audit_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  waktu     TEXT NOT NULL,
  subjek    TEXT NOT NULL,                       -- user:<id>(role) | service:<client_id> | anonymous
  endpoint  TEXT NOT NULL,                       -- "METHOD /path"
  device    TEXT,
  hasil     TEXT NOT NULL CHECK (hasil IN ('allow','deny')),
  alasan    TEXT NOT NULL
);

CREATE INDEX idx_audit_waktu ON audit_log(waktu);
