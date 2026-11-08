@echo off
cd /d "%~dp0"
title AI 漫剧工作台 · 127.0.0.1:5273

echo.
echo   ============================================
echo     AI 漫剧工作台
echo     台账 data/scripts  ·  导出 exports
echo   ============================================
echo.

rem ---- 1. 依赖 ----
if not exist node_modules (
  echo   [1/3] 首次运行，安装依赖（约 1 分钟）...
  call npm install --registry=https://registry.npmmirror.com --no-audit --no-fund
  if errorlevel 1 (
    echo   依赖安装失败，检查网络后重试。
    pause
    exit /b 1
  )
) else (
  echo   [1/3] 依赖已就绪
)

rem ---- 2. 构建 ----
echo   [2/3] 构建前端...
call npm run build >nul 2>&1
if not exist dist\index.html (
  echo   构建失败。请在命令行运行 npm run build 查看原因。
  pause
  exit /b 1
)
echo         构建完成

rem ---- 3. 已有服务就只开浏览器 ----
netstat -an | findstr "127.0.0.1:5273" | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo   [3/3] 服务已在运行，直接打开浏览器
  start "" http://127.0.0.1:5273/#/home
  timeout /t 2 >nul
  exit /b 0
)

echo   [3/3] 启动本地服务...
start "" http://127.0.0.1:5273/#/home
echo.
echo   关闭本窗口即停止服务。
echo.
node server.mjs

echo.
echo   服务已退出。
pause
