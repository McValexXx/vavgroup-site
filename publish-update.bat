@echo off
setlocal
chcp 65001 >nul
title VAV Group - Publish update

set "VAV_PUBLISH_SCRIPT=%~dp0scripts\publish-update.ps1"
if not exist "%VAV_PUBLISH_SCRIPT%" set "VAV_PUBLISH_SCRIPT=%USERPROFILE%\.codex\.chatgpt-projects\g-p-6a897d2760b88191892bcd9d31673ea7\release\vavgroup-site\scripts\publish-update.ps1"

if not exist "%VAV_PUBLISH_SCRIPT%" (
  echo ERROR: VAV Group publication files were not found.
  echo Keep this launcher with the vavgroup-site folder or restore the clean release project.
  echo.
  pause
  exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%VAV_PUBLISH_SCRIPT%"
set "VAV_EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%VAV_EXIT_CODE%"=="0" (
  echo Publication stopped. Review the message above.
) else (
  echo Publication command completed.
)
echo.
pause
exit /b %VAV_EXIT_CODE%
