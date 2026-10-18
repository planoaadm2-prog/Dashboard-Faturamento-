import {test, beforeEach, after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const directory = mkdtempSync(join(tmpdir(), 'dashboard-clear-test-'));
process.env.DASHBOARD_DATA_DIR = directory;
const {db, readState} = await import('./banco.mjs');
const {importedDataOverview, clearImportedData} = await import('./limpeza.mjs');
const admin = {id: 'admin-test', username: 'admin-test', role: 'admin'};
const operator = {id: 'operator-test', username: 'operator-test', role: 'operator'};

beforeEach(() => {
  db.exec('DROP TRIGGER IF EXISTS fail_clear; DELETE FROM files; DELETE FROM audit; DELETE FROM sessions; DELETE FROM users;');
  for (const user of [admin, operator]) {
    db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?,?)').run(
      user.id, user.username, user.username, user.role, 'synthetic-salt', 'synthetic-hash', 1, '2026-10-16'
    );
  }
  db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run('synthetic-token', admin.id, 'synthetic-csrf', 9999999999999);
  const state = {schemaVersion: 1, revision: 7, buckets: {
    main: {month: '2026-10', source: 'Base principal', rows: [{}, {}]},
    hermanos: {month: '2026-09', source: 'Hermanos', rows: [{}]}
  }, history: [{id: 'old-history', fileId: 'file-test'}]};
  db.prepare('UPDATE app_state SET revision=?,payload=? WHERE id=1').run(7, JSON.stringify(state));
  db.prepare('INSERT INTO files VALUES(?,?,?,?,?)').run('file-test', 'test-sha', 'teste.xlsx', Buffer.from('synthetic'), '2026-10-16');
  db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?)').run('old-audit', '2026-10-16', admin.id, admin.username, 'import', '{}');
});

test('only administrators can preview or delete imports', () => {
  for (const actor of [operator, null]) {
    assert.throws(() => importedDataOverview(actor), {status: 403});
    assert.throws(() => clearImportedData(actor, {revision: 7, confirmation: 'APAGAR TODOS'}), {status: 403});
  }
  assert.equal(readState().revision, 7);
});

test('preview counts files, both sources, all months and history', () => {
  assert.deepEqual(importedDataOverview(admin), {revision: 7, files: 1, rows: 3, months: 2, history: 1});
});

test('typed confirmation and valid revision are mandatory', () => {
  assert.throws(() => clearImportedData(admin, {revision: 7, confirmation: 'sim'}), {status: 400});
  assert.throws(() => clearImportedData(admin, {confirmation: 'APAGAR TODOS'}), {status: 400});
  assert.equal(importedDataOverview(admin).files, 1);
});

test('stale confirmations cannot erase newer data', () => {
  assert.throws(() => clearImportedData(admin, {revision: 6, confirmation: 'APAGAR TODOS'}), {status: 409});
  assert.equal(readState().revision, 7);
  assert.equal(importedDataOverview(admin).rows, 3);
});

test('deletion clears files and state, preserves accounts, sessions and audit', () => {
  const users = db.prepare('SELECT * FROM users ORDER BY id').all();
  const sessions = db.prepare('SELECT * FROM sessions').all();
  const result = clearImportedData(admin, {revision: 7, confirmation: 'APAGAR TODOS'});
  assert.deepEqual(result.state, {schemaVersion: 1, revision: 8, buckets: {}, history: []});
  assert.deepEqual(readState(), result.state);
  assert.equal(importedDataOverview(admin).files, 0);
  assert.deepEqual(db.prepare('SELECT * FROM users ORDER BY id').all(), users);
  assert.deepEqual(db.prepare('SELECT * FROM sessions').all(), sessions);
  assert.equal(db.prepare('SELECT count(*) AS n FROM audit').get().n, 2);
  assert.equal(db.prepare("SELECT action FROM audit WHERE action='clearImports'").get().action, 'clearImports');
  assert.throws(() => clearImportedData(admin, {revision: 7, confirmation: 'APAGAR TODOS'}), {status: 409});
});

test('a database failure rolls back file and state deletion together', () => {
  db.exec("CREATE TRIGGER fail_clear BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;");
  assert.throws(() => clearImportedData(admin, {revision: 7, confirmation: 'APAGAR TODOS'}));
  assert.equal(readState().revision, 7);
  assert.equal(importedDataOverview(admin).files, 1);
  assert.equal(importedDataOverview(admin).rows, 3);
});

after(() => { db.close(); rmSync(directory, {recursive: true, force: true}); });
