const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

test('workspace restore has explicit size limits', () => {
  assert.match(html, /WORKSPACE_LIMITS=\{parts:5000,wires:10000,groups:1000,bytes:4000000\}/);
  assert.match(html, /raw\.length>WORKSPACE_LIMITS\.bytes/);
  assert.match(html, /state\.parts\.length>WORKSPACE_LIMITS\.parts/);
  assert.match(html, /state\.wires\.length>WORKSPACE_LIMITS\.wires/);
});

test('workspace restore validates wire nodes and rejects zero-length wires', () => {
  assert.match(html, /const validNode=s=>/);
  assert.match(html, /!validNode\(s\.a\)\|\|!validNode\(s\.b\)\|\|s\.a===s\.b/);
});

test('autosave is deduplicated and no longer runs every 500ms', () => {
  assert.match(html, /if\(encoded===lastWorkspaceJson\)return/);
  assert.match(html, /setInterval\(saveWorkspace,3000\)/);
  assert.doesNotMatch(html, /setInterval\(saveWorkspace,500\)/);
});

test('restored timestep and viewport are bounded', () => {
  assert.match(html, /state\.dt<=1/);
  assert.match(html, /Math\.abs\(state\.view\.x\)<1e8/);
  assert.match(html, /Math\.abs\(state\.view\.y\)<1e8/);
});
