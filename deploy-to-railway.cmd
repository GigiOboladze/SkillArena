@echo off
REM ============================================================
REM  SkillArena - publish the current version to Railway.
REM  Double-click this file. It saves every change in this folder
REM  as one git commit and pushes it to GitHub (main branch);
REM  Railway then rebuilds and redeploys the site by itself, and
REM  the new database tables are created automatically on start.
REM ============================================================
setlocal
cd /d "%~dp0"
set LOG=deploy-to-railway.log
echo SkillArena deploy %date% %time% > "%LOG%"

where git >nul 2>&1
if errorlevel 1 (
  echo.
  echo  Git is not installed on this computer, so I can't publish from here.
  echo  Install it from https://git-scm.com/download/win and run this again.
  echo.
  pause
  exit /b 1
)

echo.
echo  [1/3] Saving all changes...
git add -A >> "%LOG%" 2>&1
git -c user.name="Gigi Oboladze" -c user.email="gigi.oboladze99@gmail.com" commit -m "SkillArena update: student profiles and activity log, class schedule, news, new My Profile, dashboard redesign" >> "%LOG%" 2>&1
git log --oneline -1 >> "%LOG%" 2>&1

echo  [2/3] Sending to GitHub (a GitHub sign-in window may pop up - sign in if it does)...
git push origin main >> "%LOG%" 2>&1
if not errorlevel 1 goto pushed

echo        GitHub has newer changes - merging them in first...
git pull --no-rebase --no-edit origin main >> "%LOG%" 2>&1
if errorlevel 1 goto conflict
git push origin main >> "%LOG%" 2>&1
if errorlevel 1 goto failed

:pushed
echo  [3/3] Done! Railway is now building the new version.
echo.
echo  It usually takes 3-6 minutes. Then open:
echo    https://skillarena-production-5faf.up.railway.app
echo.
echo SUCCESS >> "%LOG%"
pause
exit /b 0

:conflict
echo.
echo  !!! Someone else changed the same files on GitHub. Nothing was published.
echo  Tell Claude "deploy conflict" - details are in %LOG%
git merge --abort >> "%LOG%" 2>&1
echo CONFLICT >> "%LOG%"
pause
exit /b 1

:failed
echo.
echo  !!! Publishing failed. Tell Claude "deploy failed" - details are in %LOG%
echo FAILED >> "%LOG%"
pause
exit /b 1
