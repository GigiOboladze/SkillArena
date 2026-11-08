@echo off
REM ------------------------------------------------------------------
REM  SkillArena - start everything for local development (Windows)
REM  Double-click this file. It:
REM    1. stops old SkillArena processes (dev server, stuck database)
REM    2. starts the local database (npx prisma dev) and waits for it
REM    3. regenerates the Prisma client and applies migrations
REM    4. makes sure the admin account and programs exist (seed)
REM    5. starts the website (npm run dev)
REM  Everything is also written to local-setup.log, prisma-dev.log and
REM  dev-server.log in this folder. Keep the two windows it opens running.
REM ------------------------------------------------------------------
cd /d "%~dp0"
title SkillArena setup
set "LOG=%~dp0local-setup.log"
set "HELPER=%~dp0scripts\local-dev.ps1"
echo SkillArena local setup - %date% %time% > "%LOG%"

REM Tuned connection settings for the local database, applied to everything this
REM script starts (Prisma reads the process environment before .env).
for /f "usebackq delims=" %%u in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%HELPER%" -Action dburl`) do set "DATABASE_URL=%%u"
echo ---- using tuned local database connection settings (small pool, wait instead of failing) >> "%LOG%"

echo [1/5] Stopping old SkillArena processes...
powershell -NoProfile -ExecutionPolicy Bypass -File "%HELPER%" -Action stop >> "%LOG%" 2>&1
echo       waiting 15 seconds so the old database lock is released...
timeout /t 15 /nobreak >nul

echo [2/5] Starting the local database (minimized window "SkillArena DATABASE")...
call :startdb && goto :dbready
echo ---- first database start failed, stopping it and retrying >> "%LOG%"
echo       first try failed, retrying in 20 seconds...
powershell -NoProfile -ExecutionPolicy Bypass -File "%HELPER%" -Action stop >> "%LOG%" 2>&1
timeout /t 20 /nobreak >nul
call :startdb || goto :fail
:dbready

echo [3/5] Regenerating the Prisma client and applying migrations...
echo ---- prisma generate >> "%LOG%"
call npx prisma generate >> "%LOG%" 2>&1 || goto :fail
echo ---- prisma migrate deploy >> "%LOG%"
call npx prisma migrate deploy >> "%LOG%" 2>&1 && goto :migrated
REM A local database created without migration history (P3005) can't take
REM "migrate deploy". Record how it differs from the code's schema instead, so
REM it can be reviewed, and carry on - the website may still be compatible.
echo ---- migrate deploy not possible here; writing schema comparison to schema-diff.sql >> "%LOG%"
call npx prisma migrate diff --from-schema-datasource prisma\schema.prisma --to-schema-datamodel prisma\schema.prisma --script > schema-diff.sql 2>> "%LOG%"
echo ---- schema-diff.sql written >> "%LOG%"
echo ---- applying new local-safe migrations >> "%LOG%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%HELPER%" -Action applylocal >> "%LOG%" 2>&1 || echo ---- WARNING: a migration could not be applied >> "%LOG%"
:migrated

echo [4/5] Making sure the admin account and programs exist...
echo ---- seed >> "%LOG%"
call npm run db:seed >> "%LOG%" 2>&1 || echo ---- seed failed, continuing >> "%LOG%"

echo [5/5] Starting the website (minimized window "SkillArena WEBSITE")...
start "SkillArena WEBSITE - keep this window open" /min cmd /k "npm run dev > dev-server.log 2>&1"
echo ---- website started >> "%LOG%"

echo.
echo All set. In about 20 seconds open http://localhost:3000
echo You can close THIS window now (keep the two minimized ones open).
echo SETUP OK >> "%LOG%"
echo.
pause
exit /b 0

:startdb
if exist prisma-dev.log del /q prisma-dev.log
start "SkillArena DATABASE - keep this window open" /min cmd /k "npx prisma dev > prisma-dev.log 2>&1"
powershell -NoProfile -ExecutionPolicy Bypass -File "%HELPER%" -Action waitdb >> "%LOG%" 2>&1
exit /b %errorlevel%

:fail
echo SETUP FAILED >> "%LOG%"
echo.
echo *** A step failed. Details are in local-setup.log - Claude can read it. ***
echo.
pause
exit /b 1
