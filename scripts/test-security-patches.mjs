// 暫定パッチの正常入力・深さ制限・未知の内容の拒否を検査する。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const braces = require('braces');
assert.deepEqual(braces.expand('a/{b,c}/d'), ['a/b/d', 'a/c/d']);
assert.deepEqual(braces.expand('file-{1..3}.txt'), ['file-1.txt', 'file-2.txt', 'file-3.txt']);
assert.deepEqual(braces.expand('plain'), ['plain']);
assert.throws(() => braces.parse('{'.repeat(101) + 'x' + '}'.repeat(101)), /max depth/);
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'security-patches/manifest.json')));
const file = manifest.packages[0].files[0];
const target = path.join(root, 'node_modules/braces', file.path);
const before = fs.readFileSync(target);
try {
  fs.appendFileSync(target, '\n// 未知の変更を模した検査\n');
  const rejected = spawnSync(process.execPath, ['scripts/apply-security-patches.mjs', '--check'], { cwd: root, encoding: 'utf8' });
  assert.notEqual(rejected.status, 0); assert.match(rejected.stderr, /既存依存の内容が想定と異なる/);
} finally { fs.writeFileSync(target, before); }
const verified = spawnSync(process.execPath, ['scripts/apply-security-patches.mjs', '--check'], { cwd: root, encoding: 'utf8' });
assert.equal(verified.status, 0);
console.log(JSON.stringify({ pass: true, checks: 6, original_dependency_restored: true }));
