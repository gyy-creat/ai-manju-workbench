# 在桌面创建「影格」快捷方式
# 用法：pwsh -File scripts\make-shortcut.ps1
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$bat  = Join-Path $root '启动工作台.bat'
$ico  = Join-Path $root 'assets\icon.ico'
$desktop = [Environment]::GetFolderPath('Desktop')
$lnk  = Join-Path $desktop '影格.lnk'

if (-not (Test-Path $bat)) { throw "找不到启动脚本：$bat" }

$shell = New-Object -ComObject WScript.Shell
$s = $shell.CreateShortcut($lnk)
$s.TargetPath       = $bat
$s.WorkingDirectory = $root
$s.Description      = '影格 INKFRAME · AI 漫剧生产台 · 本地台账 127.0.0.1:5273'
$s.WindowStyle      = 1
if (Test-Path $ico) { $s.IconLocation = "$ico,0" }
$s.Save()

# 验证
if (Test-Path $lnk) {
  $check = $shell.CreateShortcut($lnk)
  Write-Output "已创建：$lnk"
  Write-Output "  目标：$($check.TargetPath)"
  Write-Output "  工作目录：$($check.WorkingDirectory)"
  Write-Output "  图标：$($check.IconLocation)"
} else {
  throw "快捷方式创建失败"
}
