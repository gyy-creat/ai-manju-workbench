/**
 * 把组装好的桌面版装进本机用户目录，并建桌面 / 开始菜单快捷方式。
 *
 * 为什么装到 %LOCALAPPDATA%\Programs 而不是项目里的 exports/：
 *   本机项目目录树（E:\ai项目\ai-manju-workbench 及其所有子目录）带有
 *   `Everyone:(I)(CI)(DENY)(DC)` 的 ACL —— DC = 拒绝删除子项。
 *   Electron 启动时要在自己所在目录创建/删除临时资源，被这条拒绝规则挡住后会
 *   静默退出（无窗口、无 stdout/stderr、退出码取不到）。装到用户目录的 ACL 干净，
 *   就正常。分发出去的 zip 解压到任何正常目录都没这个问题。
 *
 * 用法：node scripts/install-app.mjs [源目录]
 *   源目录默认 exports/app/AI漫剧工作台（由 scripts/assemble-app.mjs 生成）
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SRC = path.resolve(process.argv[2] || 'exports/app/AI漫剧工作台');
const LOCAL = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const DST = path.join(LOCAL, 'Programs', 'AI漫剧工作台');
const EXE_NAME = 'AI漫剧工作台.exe';
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const log = (...a) => console.log('·', ...a);

if (!fs.existsSync(path.join(SRC, EXE_NAME))) {
  console.error(`源目录里没有 ${EXE_NAME}：${SRC}\n先跑 npm run app:pack`);
  process.exit(1);
}

// 1) 复制（robocopy 比 Copy-Item 快一个数量级；/MIR 让重装是干净的）
log(`安装到 ${DST}`);
fs.mkdirSync(DST, { recursive: true });
// robocopy 的退出码不是「0 才算成功」：0=无变化 1=已复制 2=有多余文件 3=1+2，>=8 才是真错误
let rc = 0;
try {
  execFileSync('robocopy', [SRC, DST, '/MIR', '/NFL', '/NDL', '/NJH', '/NJS', '/MT:16'], { stdio: 'ignore' });
} catch (e) {
  rc = Number(e.status) || 0;
  if (rc >= 8) {
    console.error(`robocopy 失败（退出码 ${rc}）：目标目录里的文件可能正被占用，先关掉「AI漫剧工作台」再重试`);
    process.exit(1);
  }
}
const fileCount = fs.readdirSync(DST).length;
log(`已复制 ${fileCount} 个顶层条目`);

// 2) 快捷方式：桌面 + 开始菜单
const targets = [
  path.join(os.homedir(), 'Desktop', 'AI漫剧工作台.lnk'),
  path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'AI漫剧工作台.lnk'),
].filter(Boolean);
for (const lnk of targets) {
  const ps = `
$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut('${lnk.replace(/'/g, "''")}')
$s.TargetPath = '${path.join(DST, EXE_NAME).replace(/'/g, "''")}'
$s.WorkingDirectory = '${DST.replace(/'/g, "''")}'
$s.IconLocation = '${path.join(DST, EXE_NAME).replace(/'/g, "''")},0'
$s.Description = 'AI 漫剧全流程工作台 v${pkg.version}'
$s.Save()
`;
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { stdio: 'ignore' });
    log('快捷方式 →', lnk);
  } catch {
    console.warn('· 快捷方式失败：', lnk);
  }
}

// 3) 卸载脚本（放在安装目录里，用户想删就双击）
const uninstall = `@echo off
chcp 936 >nul
echo 正在关闭 AI 漫剧工作台...
taskkill /IM "${EXE_NAME}" /F >nul 2>&1
timeout /t 2 >nul
echo 正在删除程序文件（剧本数据不会动，在 %APPDATA%\\ai-manju-workbench）...
cd /d "%~dp0"
start "" /wait cmd /c "timeout /t 1 >nul & rmdir /s /q "${DST}""
del "%USERPROFILE%\\Desktop\\AI漫剧工作台.lnk" >nul 2>&1
del "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\AI漫剧工作台.lnk" >nul 2>&1
echo 已卸载。剧本与配置保留在 %APPDATA%\\ai-manju-workbench，可手动删除。
pause
`;
fs.writeFileSync(path.join(DST, '卸载.bat'), uninstall, 'utf8');
log('卸载脚本 → 安装目录\\卸载.bat');

console.log(`
装好了。

  启动：双击桌面「AI漫剧工作台」
  程序：${path.join(DST, EXE_NAME)}
  数据：%APPDATA%\\ai-manju-workbench\\data-root（剧本、上传图、渲染结果都在这里，卸载不删）
  卸载：安装目录里的「卸载.bat」

第一次启动会在 %LOCALAPPDATA%\\Programs 下解压界面资源，约 3-6 秒；之后是正常的窗口启动速度。
`);
