@echo off
setlocal
title Safe Cracker - Production Deploy

set "REPO=C:\PGN\SafeCracker"
set "TASK=PGN Safe Cracker"
set "HEALTH=https://safecracker.helvete.pizza/api/health"

echo.
echo ==========================================
echo   SAFE CRACKER - PRODUCTION DEPLOY
echo ==========================================
echo.

cd /d "%REPO%"
if errorlevel 1 goto :error

for /f %%A in ('git status --porcelain') do (
    echo ERROR: Production repo has uncommitted changes.
    echo Refusing to deploy until the working tree is clean.
    goto :error
)

echo [1/6] Stopping Safe Cracker...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Stop-ScheduledTask -TaskName '%TASK%'"
if errorlevel 1 goto :error

echo.
echo [2/6] Pulling latest code...
git pull
if errorlevel 1 goto :restart_after_failure

echo.
echo [3/6] Installing locked dependencies...
call npm ci
if errorlevel 1 goto :restart_after_failure

echo.
echo [4/6] Building production bundle...
call npm run build
if errorlevel 1 goto :restart_after_failure

echo.
echo [5/6] Starting Safe Cracker...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-ScheduledTask -TaskName '%TASK%'"
if errorlevel 1 goto :error

echo.
echo [6/6] Checking production health...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "Start-Sleep -Seconds 2; try { $r = Invoke-RestMethod -Uri '%HEALTH%' -TimeoutSec 15; $r | ConvertTo-Json -Compress; if ($r.status -ne 'ok') { exit 1 } } catch { Write-Host $_.Exception.Message; exit 1 }"
if errorlevel 1 goto :health_warning

echo.
echo ==========================================
echo   SUCCESS - SAFE CRACKER IS LIVE
echo ==========================================
echo.
pause
exit /b 0

:restart_after_failure
echo.
echo Deployment failed after the service was stopped.
echo Attempting to restart the Scheduled Task...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-ScheduledTask -TaskName '%TASK%'" >nul 2>&1
goto :error

:health_warning
echo.
echo ==========================================
echo   DEPLOY FINISHED, BUT HEALTH CHECK FAILED
echo ==========================================
echo.
echo The Scheduled Task was started, but the health endpoint did not return OK.
echo Check the app before assuming production is healthy.
echo.
pause
exit /b 2

:error
echo.
echo ==========================================
echo   DEPLOY FAILED
echo ==========================================
echo.
pause
exit /b 1
