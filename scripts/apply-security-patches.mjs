// 公式修正版が未公開の間だけ、版と内容を固定して検証済みの修正を適用する。
// バージョンと監査結果は変更しない。未知のファイル内容は拒否する。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root = path.resolve(import.meta.dirname, '..');
const patchRoot = path.join(root, 'security-patches');
const manifest = JSON.parse(fs.readFileSync(path.join(patchRoot, 'manifest.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const checkOnly = process.argv.includes('--check');
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const pending = [];
let packagesChecked = 0;
const omittedPackages = [];
for (const entry of manifest.packages) {
  const locations = Object.keys(lock.packages).filter(key => key === 'node_modules/' + entry.name || key.endsWith('/node_modules/' + entry.name));
  if (locations.length === 0) throw new Error('修正対象がlockにありません: ' + entry.name);
  for (const location of locations) {
    const locked = lock.packages[location];
    if (locked.version !== entry.version) throw new Error('未検証のlockバージョン: ' + location);
    const directory = path.resolve(root, location);
    if (!directory.startsWith(root + path.sep)) throw new Error('不正な依存先パス');
    if (!fs.existsSync(directory)) {
      // npm --omit=dev/optionalで省略可能な依存だけを許可する。
      if (locked.dev === true || locked.optional === true) {
        omittedPackages.push(location);
        continue;
      }
      throw new Error('必須依存が未導入: ' + location);
    }
    const installed = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
    if (installed.name !== entry.name || installed.version !== entry.version) throw new Error('未検証の依存バージョン: ' + location);
    packagesChecked++;
    for (const file of entry.files) {
      const target = path.join(directory, file.path);
      const payload = fs.readFileSync(path.join(patchRoot, entry.name, file.path + '.txt'));
      if (sha(payload) !== file.after) throw new Error('修正内容のハッシュ不一致: ' + file.path);
      const hash = sha(fs.readFileSync(target));
      if (hash === file.after) continue;
      if (hash !== file.before) throw new Error('既存依存の内容が想定と異なる: ' + target);
      if (checkOnly) throw new Error('修正未適用。npm run security:patch を実行: ' + location);
      pending.push({target, payload});
    }
  }
}
// 全ファイルの検査後に適用し、部分的な更新を避ける。
for (const {target, payload} of pending) fs.writeFileSync(target, payload);
console.log(JSON.stringify({mode: checkOnly ? 'verify' : 'apply', packagesChecked, omittedPackages, filesPatched: pending.length, advisoryWarningsPreserved: true}));
