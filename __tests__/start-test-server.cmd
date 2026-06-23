@echo off
REM Loads env vars from .env.test and starts the Next.js dev server on port 3847
REM Usage: __tests__\start-test-server.cmd

cd /d %~dp0..
for /f "usebackq tokens=1,* delims==" %%a in (".env.test") do (
  if not "%%a"=="" if not "%%a:~0,1%"=="#" set "%%a=%%b"
)
npx next dev --port 3847
