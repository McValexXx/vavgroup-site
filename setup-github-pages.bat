@echo off
setlocal
chcp 65001 >nul
title VAV Group - GitHub Pages setup

set "VAV_SETUP_SCRIPT=%~dp0scripts\setup-github-pages.ps1"
if not exist "%VAV_SETUP_SCRIPT%" set "VAV_SETUP_SCRIPT=%USERPROFILE%\.codex\.chatgpt-projects\g-p-6a897d2760b88191892bcd9d31673ea7\release\vavgroup-site\scripts\setup-github-pages.ps1"

if not exist "%VAV_SETUP_SCRIPT%" (
  echo ERROR: VAV Group setup files were not found.
  echo Keep this launcher with the vavgroup-site folder or restore the clean release project.
  echo.
  pause
  exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%VAV_SETUP_SCRIPT%"
set "VAV_EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%VAV_EXIT_CODE%"=="0" (
  echo Setup stopped. No DNS records were changed.
) else (
  echo GitHub setup finished. DNS remains unchanged until the REG.RU step.
)
echo.
pause
exit /b %VAV_EXIT_CODE%
