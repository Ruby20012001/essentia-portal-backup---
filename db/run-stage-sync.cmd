@echo off
rem What Task Scheduler runs every few minutes: bring the MASTER TRACKER's
rem changes onto the Stage Tracker. Quits at once when the file has not
rem changed. DATABASE_URL comes from frontend\.env.local, so this task holds
rem no connection string. Its log is beside the sync's snapshot:
rem   %LOCALAPPDATA%\essentia\stage-sync\sync.log
cd /d "%~dp0.."
if not exist "%LOCALAPPDATA%\essentia\stage-sync" mkdir "%LOCALAPPDATA%\essentia\stage-sync"
set NODE_NO_WARNINGS=1
node db\sync-stage-tracker.mjs --apply --if-changed --env-local >> "%LOCALAPPDATA%\essentia\stage-sync\sync.log" 2>&1
