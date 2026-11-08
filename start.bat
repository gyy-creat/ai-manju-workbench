@echo off
cd /d "%~dp0"
echo ============================================
echo   AI 漫剧工作台 - 本地启动
echo ============================================
if not exist node_modules (
  echo 首次运行，正在安装依赖...
  call npm install --registry=https://registry.npmmirror.com --no-audit --no-fund
)
start "" http://127.0.0.1:5273
call npm run dev
pause
