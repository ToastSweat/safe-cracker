@echo off
setlocal
title Safe Cracker - Dev Publish

set "REPO=D:\Dropbox\[PROJECTS]\[DISCORD]\[ACTIVITIES]\safe-cracker"

echo.
echo ==========================================
echo   SAFE CRACKER - DEV CHECK / BUILD / PUSH
echo ==========================================
echo.
echo IMPORTANT: Pause Dropbox before continuing.
echo.
pause

cd /d "%REPO%"
if errorlevel 1 goto :error

echo.
echo [1/5] Running Svelte / TypeScript checks...
call npm run check
if errorlevel 1 goto :error

echo.
echo [2/5] Building production bundle...
call npm run build
if errorlevel 1 goto :error

echo.
echo [3/5] Staging changes...
git add .
if errorlevel 1 goto :error

git diff --cached --quiet
if not errorlevel 1 (
    echo No changes to commit.
    goto :push
)

echo.
git status --short
echo.
set /p "COMMIT_MSG=Commit message: "
if "%COMMIT_MSG%"=="" set "COMMIT_MSG=Update Safe Cracker"

echo.
echo [4/5] Committing...
git commit -m "%COMMIT_MSG%"
if errorlevel 1 goto :error

:push
echo.
echo [5/5] Pushing to GitHub...
git push
if errorlevel 1 goto :error

echo.
echo ==========================================
echo   SUCCESS - DEV CHANGES ARE ON GITHUB
echo ==========================================
echo.
pause
exit /b 0

:error
echo.
echo ==========================================
echo   FAILED - NOTHING ELSE WILL BE RUN
echo ==========================================
echo.
pause
exit /b 1
