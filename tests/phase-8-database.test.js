/**
 * Phase 8 – Database & Persistence Tests
 * Menggunakan node:sqlite (DatabaseSync) in-memory via openDatabase(':memory:')
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/main/db/database.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

function freshDb() {
  return openDatabase(':memory:');
}

// ─── Migration & Schema ────────────────────────────────────────────────────────

test('openDatabase creates all required tables on a fresh :memory: db', () => {
  const db = freshDb();
  assert.deepEqual(db.getAllPreferences(), {});
  db.close();
});

test('schema migration is idempotent: opening the same db twice does not throw', () => {
  assert.doesNotThrow(() => {
    const db = openDatabase(':memory:');
    db.close();
  });
});

// ─── Preferences ──────────────────────────────────────────────────────────────

test('setPreference stores a string value and getPreference retrieves it', () => {
  const db = freshDb();
  db.setPreference('theme', 'dark');
  assert.equal(db.getPreference('theme'), 'dark');
  db.close();
});

test('setPreference stores a number value', () => {
  const db = freshDb();
  db.setPreference('zoom', 1.5);
  assert.equal(db.getPreference('zoom'), 1.5);
  db.close();
});

test('setPreference stores an object value and round-trips via JSON', () => {
  const db = freshDb();
  const obj = { paperWidthMm: 58, unit: 'mm' };
  db.setPreference('paperConfig', obj);
  assert.deepEqual(db.getPreference('paperConfig'), obj);
  db.close();
});

test('getPreference returns defaultValue when key does not exist', () => {
  const db = freshDb();
  assert.equal(db.getPreference('nonExistentKey', 'fallback'), 'fallback');
  assert.equal(db.getPreference('missing'), null);
  db.close();
});

test('setPreference upserts: overwriting existing key updates value', () => {
  const db = freshDb();
  db.setPreference('color', 'red');
  db.setPreference('color', 'blue');
  assert.equal(db.getPreference('color'), 'blue');
  db.close();
});

test('getAllPreferences returns all stored key-value pairs', () => {
  const db = freshDb();
  db.setPreference('a', 1);
  db.setPreference('b', 'two');
  db.setPreference('c', true);
  const all = db.getAllPreferences();
  assert.equal(all.a, 1);
  assert.equal(all.b, 'two');
  assert.equal(all.c, true);
  db.close();
});

test('setPreference throws TypeError if key is not a string', () => {
  const db = freshDb();
  assert.throws(() => db.setPreference(42, 'val'), /Key preferensi/);
  db.close();
});

// ─── Printer Profile ──────────────────────────────────────────────────────────

test('savePrinterProfile stores driver profile and getPrinterProfile retrieves it', () => {
  const db = freshDb();
  db.savePrinterProfile({ id: 'default', mode: 'driver', driverName: 'EPSON TM-T82X' });
  const profile = db.getPrinterProfile('default');
  assert.ok(profile, 'harus mengembalikan profil');
  assert.equal(profile.mode, 'driver');
  assert.equal(profile.driverName, 'EPSON TM-T82X');
  db.close();
});

test('savePrinterProfile stores raw/TCP profile with host and port', () => {
  const db = freshDb();
  db.savePrinterProfile({ id: 'default', mode: 'raw', rawHost: '192.168.1.100', rawPort: 9100 });
  const profile = db.getPrinterProfile('default');
  assert.equal(profile.mode, 'raw');
  assert.equal(profile.rawHost, '192.168.1.100');
  assert.equal(profile.rawPort, 9100);
  db.close();
});

test('getPrinterProfile returns null when no profile exists', () => {
  const db = freshDb();
  assert.equal(db.getPrinterProfile('default'), null);
  db.close();
});

test('savePrinterProfile upserts: second save overwrites the first', () => {
  const db = freshDb();
  db.savePrinterProfile({ id: 'default', mode: 'driver', driverName: 'OldPrinter' });
  db.savePrinterProfile({ id: 'default', mode: 'driver', driverName: 'NewPrinter' });
  const profile = db.getPrinterProfile('default');
  assert.equal(profile.driverName, 'NewPrinter');
  db.close();
});

test('savePrinterProfile throws TypeError if argument is not an object', () => {
  const db = freshDb();
  assert.throws(() => db.savePrinterProfile('bukan-objek'), /Profile harus objek/);
  db.close();
});

// ─── Recent Files ─────────────────────────────────────────────────────────────

test('addRecentFile and getRecentFiles round-trip correctly', () => {
  const db = freshDb();
  db.addRecentFile('/home/user/struk1.trstudio', 'Struk Toko A', 58);
  const list = db.getRecentFiles(10);
  assert.equal(list.length, 1);
  assert.equal(list[0].path, '/home/user/struk1.trstudio');
  assert.equal(list[0].title, 'Struk Toko A');
  assert.equal(list[0].paperWidth, 58);
  db.close();
});

test('addRecentFile upserts: re-adding same path updates title and paperWidth', () => {
  const db = freshDb();
  db.addRecentFile('/docs/struk.trstudio', 'Old Title', 58);
  db.addRecentFile('/docs/struk.trstudio', 'New Title', 80);
  const list = db.getRecentFiles(10);
  assert.equal(list.length, 1);
  assert.equal(list[0].title, 'New Title');
  assert.equal(list[0].paperWidth, 80);
  db.close();
});

test('getRecentFiles respects the limit parameter', () => {
  const db = freshDb();
  for (let i = 0; i < 5; i++) {
    db.addRecentFile('/docs/struk' + i + '.trstudio', 'Struk ' + i, 58);
  }
  const list = db.getRecentFiles(3);
  assert.equal(list.length, 3);
  db.close();
});

test('addRecentFile throws TypeError if filePath is empty or not a string', () => {
  const db = freshDb();
  assert.throws(() => db.addRecentFile(''), /Path file/);
  assert.throws(() => db.addRecentFile(123), /Path file/);
  db.close();
});

// ─── Recovery Snapshot ────────────────────────────────────────────────────────

test('saveRecoverySnapshot stores document and getRecoverySnapshot retrieves it', () => {
  const db = freshDb();
  const doc = { title: 'Test', paperWidthMm: 58, blocks: [] };
  db.saveRecoverySnapshot(doc, '/docs/test.trstudio');
  const snap = db.getRecoverySnapshot();
  assert.ok(snap, 'harus mengembalikan snapshot');
  assert.deepEqual(snap.document, doc);
  assert.equal(snap.filePath, '/docs/test.trstudio');
  db.close();
});

test('getRecoverySnapshot returns null when no snapshot exists', () => {
  const db = freshDb();
  assert.equal(db.getRecoverySnapshot(), null);
  db.close();
});

test('clearRecoverySnapshot removes the active snapshot', () => {
  const db = freshDb();
  db.saveRecoverySnapshot({ title: 'Before Clear', blocks: [] }, null);
  db.clearRecoverySnapshot();
  assert.equal(db.getRecoverySnapshot(), null);
  db.close();
});

test('saveRecoverySnapshot upserts: second save overwrites first', () => {
  const db = freshDb();
  db.saveRecoverySnapshot({ title: 'First', blocks: [] }, null);
  db.saveRecoverySnapshot({ title: 'Second', blocks: [{ id: 'b1' }] }, '/new/path.trstudio');
  const snap = db.getRecoverySnapshot();
  assert.equal(snap.document.title, 'Second');
  assert.equal(snap.filePath, '/new/path.trstudio');
  db.close();
});

test('saveRecoverySnapshot accepts filePath as null', () => {
  const db = freshDb();
  db.saveRecoverySnapshot({ title: 'No File', blocks: [] }, null);
  const snap = db.getRecoverySnapshot();
  assert.equal(snap.filePath, null);
  db.close();
});

test('saveRecoverySnapshot throws TypeError if document is not an object', () => {
  const db = freshDb();
  assert.throws(() => db.saveRecoverySnapshot('bukan-objek'), /harus berupa objek/);
  assert.throws(() => db.saveRecoverySnapshot(null), /harus berupa objek/);
  db.close();
});

// ─── Concurrent operations ────────────────────────────────────────────────────

test('multiple preferences, profiles, and recovery can coexist independently', () => {
  const db = freshDb();
  db.setPreference('zoom', 1.25);
  db.savePrinterProfile({ id: 'default', mode: 'raw', rawHost: '10.0.0.1', rawPort: 9100 });
  db.addRecentFile('/a.trstudio', 'A', 58);
  db.saveRecoverySnapshot({ title: 'Coexist', blocks: [] }, '/a.trstudio');

  assert.equal(db.getPreference('zoom'), 1.25);
  assert.equal(db.getPrinterProfile('default').rawHost, '10.0.0.1');
  assert.equal(db.getRecentFiles(5)[0].path, '/a.trstudio');
  assert.equal(db.getRecoverySnapshot().document.title, 'Coexist');
  db.close();
});
