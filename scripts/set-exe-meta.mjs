/**
 * 用 resedit 写 exe 的图标与版本信息。
 *
 * 为什么不用 rcedit：electron-builder 25 默认调 rcedit-x64.exe 改资源，
 * 在这台机器上对 188MB 的 electron.exe 一律报 `Fatal error: Unable to commit changes`
 * （32/64 位都试过、复制到 C:/E: 都试过、也用 rcedit 直接手跑过），
 * 而 resedit 是纯 JS 解析 PE 并重写资源段，不经过 mmap，稳定。
 */
import fs from 'node:fs';
import path from 'node:path';
import * as ResEdit from 'resedit';

const [exePath, iconPath] = process.argv.slice(2);
if (!exePath || !iconPath) {
  console.error('用法: node scripts/set-exe-meta.mjs <exe> <ico>');
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const productName = pkg.build?.productName || pkg.name;
const version = pkg.version;
const [maj, min, pat] = version.split('.').map((n) => parseInt(n, 10) || 0);
const desc = pkg.description || '';

const buf = fs.readFileSync(exePath);
const exe = ResEdit.NtExecutable.from(buf, { ignoreCert: true });
const res = ResEdit.NtExecutableResource.from(exe);

// 图标：替换 1 号图标组（electron.exe 只有这一组）
if (fs.existsSync(iconPath)) {
  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(iconPath));
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    res.entries,
    1,
    1033,
    iconFile.icons.map((i) => i.data)
  );
  console.log(`图标已写入（${iconFile.icons.length} 个尺寸）`);
}

// 版本信息
const vis = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
if (!vis || !vis.length) {
  console.error('这个 exe 里没有版本资源，跳过版本信息');
} else {
  const vi = vis[0];
  vi.setFileVersion(maj, min, pat, 0);
  vi.setProductVersion(maj, min, pat, 0);
  vi.setStringValues(
    { lang: 1033, codepage: 1200 },
    {
      ProductName: productName,
      FileDescription: desc,
      CompanyName: pkg.author || '',
      LegalCopyright: pkg.build?.copyright || '',
      InternalName: pkg.build?.win?.executableName || pkg.name,
      OriginalFilename: path.basename(exePath),
    }
  );
  vi.outputToResourceEntries(res.entries);
  console.log(`版本信息已写入（${productName} ${version}）`);
}

res.outputResource(exe);
const out = Buffer.from(exe.generate());
fs.writeFileSync(exePath, out);
console.log(`已写回 ${exePath}（${(out.length / 1024 / 1024).toFixed(1)} MB）`);
