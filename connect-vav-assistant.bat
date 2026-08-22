@echo off
setlocal
chcp 65001 >nul
title VAV Group - AI Assistant and Telegram setup

set "VAV_ASSISTANT_SCRIPT=%~dp0scripts\connect-vav-assistant.ps1"
if not exist "%VAV_ASSISTANT_SCRIPT%" (
  echo ERROR: The VAV Assistant setup file was not found.
  echo Keep this launcher inside the vavgroup-site folder.
  echo.
  pause
  exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%VAV_ASSISTANT_SCRIPT%"
set "VAV_EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%VAV_EXIT_CODE%"=="0" (
  echo Setup stopped. Read the message above; no secret was stored in GitHub.
) else (
  echo VAV Assistant setup finished successfully.
)
echo.
pause
exit /b %VAV_EXIT_CODE%
