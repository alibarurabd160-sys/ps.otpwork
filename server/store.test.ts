import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkspaceStore, hashPasscode, verifyPasscodeHash } from './store';

test('hashPasscode and verifyPasscodeHash validate passcodes securely', () => {
  const hash = hashPasscode('secret123');
  assert.equal(verifyPasscodeHash('secret123', hash), true);
  assert.equal(verifyPasscodeHash('wrongpass', hash), false);
});

test('WorkspaceStore handles first-run admin claim and locks afterward', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-store-'));
  const statePath = path.join(tmpDir, 'state.json');

  const store = new WorkspaceStore(statePath);
  assert.equal(store.getAuthStatus().hasPasscode, false);

  store.claimInitialPasscode('admin2026');
  assert.equal(store.getAuthStatus().hasPasscode, true);
  assert.equal(store.verifyAdminPasscode('admin2026'), true);
  assert.equal(store.verifyAdminPasscode('invalid'), false);
  assert.throws(() => store.claimInitialPasscode('another'), /already configured/);

  // Re-load from disk to confirm persistence
  const reloaded = new WorkspaceStore(statePath);
  assert.equal(reloaded.verifyAdminPasscode('admin2026'), true);

  const updated = reloaded.updateConfig({ browserUrl: 'https://example.org', defaultRid: '88017' });
  assert.equal(updated.browserUrl, 'https://example.org');
  assert.equal(updated.defaultRid, '88017');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
