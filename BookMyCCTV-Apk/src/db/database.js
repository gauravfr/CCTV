'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'cameras.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS cameras (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    brand TEXT NOT NULL,
    host TEXT NOT NULL,
    channel INTEGER NOT NULL,
    encrypted_config TEXT NOT NULL,
    metadata_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_cameras_updated_at ON cameras(updated_at);
`);
db.pragma('optimize');

function encryptionKey() {
  const configured = process.env.CAMERA_ENCRYPTION_KEY;
  if (!configured) throw new Error('CAMERA_ENCRYPTION_KEY is required to remember cameras');
  return crypto.createHash('sha256').update(configured, 'utf8').digest();
}

function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
}

function decrypt(payload) {
  const [iv, tag, body] = String(payload).split('.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8'));
}

function saveCamera(camera, metadata) {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO cameras(id,name,brand,host,channel,encrypted_config,metadata_json,created_at,updated_at)
    VALUES(@id,@name,@brand,@host,@channel,@encrypted,@metadata,@created,@updated)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,brand=excluded.brand,host=excluded.host,
    channel=excluded.channel,encrypted_config=excluded.encrypted_config,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at`)
    .run({ id: camera.id, name: camera.name, brand: camera.brand, host: camera.host, channel: camera.channel,
      encrypted: encrypt(camera), metadata: JSON.stringify(metadata || {}), created: camera.createdAt || now, updated: now });
}

function listSavedCameras() {
  return db.prepare('SELECT * FROM cameras ORDER BY created_at ASC').all().map((row) => ({
    ...decrypt(row.encrypted_config),
    metadata: JSON.parse(row.metadata_json || '{}'),
    remembered: true,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

function deleteCamera(id) { db.prepare('DELETE FROM cameras WHERE id = ?').run(id); }

module.exports = { db, saveCamera, listSavedCameras, deleteCamera };
