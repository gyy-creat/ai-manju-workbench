/**
 * 把 win-unpacked 组装成可交付形态：
 *   1. 搬到 exports/app/AI漫剧工作台/（中文目录名，用户看得懂）
 *   2. exe 改成中文名「AI漫剧工作台.exe」
 *   3. 打一个 zip 分发包（用 bsdtar，7za 在本机被系统拦了写不了）
 *   4. 在桌面建快捷方式，指向这个 exe
 *
 * 为什么不用 electron-builder 的 portable/nsis target：
 *   两条 target 都硬依赖 node_modules/7zip-bin 里的 7za.exe 打 nsis.7z，
 *   而本机 7za.exe 无法创建任何输出文件（System ERROR: 拒绝访问）——
 *   powershell 直接调也一样失败，是系统层面拦的，不是参数或权限问题。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SRC = 'C:/mjw-build/win-unpacked';
const OUT_DIR = path.resolve('exports/app');
const APP_DIR = path.join(OUT_DIR, 'AI漫剧工作台');
const OLD_EXE = path.join(APP_DIR, 'AI-Manju-Workbench.exe');
const NEW_EXE = path.join(APP_DIR, 'AI漫剧工作台.exe');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = pkg.version;
const ZIP = path.join(OUT_DIR, `AI漫剧工作台-${version}-便携版.zip`);

const log = (...a) => console.log('·', ...a);

if (!fs.existsSync(SRC)) {
  console.error('缺少 C:/mjw-build/win-unpacked，先跑 npm run app:dir');
  process.exit(1);
}

// 1) 搬目录
fs.rmSync(APP_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.cpSync(SRC, APP_DIR, { recursive: true });
log('已复制到', APP_DIR);

// 2) exe 改名
if (fs.existsSync(OLD_EXE)) {
  fs.renameSync(OLD_EXE, NEW_EXE);
  log('exe 改名 →', path.basename(NEW_EXE));
}

// 3) 打 zip（bsdtar，Windows 自带）
if (fs.existsSync(ZIP)) fs.rmSync(ZIP);
execFileSync('tar', ['-a', '-c', '-f', ZIP, '-C', OUT_DIR, 'AI漫剧工作台'], {
  stdio: ['ignore', 'ignore', 'pipe'],
});
const zipMB = (fs.statSync(ZIP).size / 1024 / 1024).toFixed(1);
log(`zip 已生成 ${path.basename(ZIP)}（${zipMB} MB）`);

// 4) 桌面快捷方式
const lnk = 'C:/Users/Administrator/Desktop/AI漫剧工作台.lnk';
const ps = `
$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut('${lnk.replace(/'/g, "''")}')
$s.TargetPath = '${NEW_EXE}'
$s.WorkingDirectory = '${APP_DIR}'
$s.IconLocation = '${NEW_EXE},0'
$s.Description = 'AI 漫剧全流程工作台'
$s.Save()
Test-Path '${lnk}'
`;
try {
  const ok = execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim();
  log(ok === 'True' ? `桌面快捷方式已建（${lnk}）` : '快捷方式创建失败');
} catch (e) {
  console.warn('· 快捷方式创建失败：', e.message);
}

// 汇总
const exeMB = (fs.statSync(NEW_EXE).size / 1024 / 1024).toFixed(0);
log(`exe ${exeMB} MB，目录总计 ${(fs.statSync(APP_DIR).size / 1024 / 1024).toFixed(0)} MB`);
console.log('\n完成：双击桌面「AI漫剧工作台」或', NEW_EXE);
