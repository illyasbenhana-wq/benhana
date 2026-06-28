@echo off
REM Load test credentials from .env.test (never commit secrets here)
REM Copy .env.test.example to .env.test and fill in real values.
cd /d c:\Users\illya\Downloads\ethosfiai-mvp
if not exist .env.test (
  echo ERROR: .env.test not found. Copy .env.test.example and fill in credentials.
  exit /b 1
)
for /f "usebackq tokens=1,* delims==" %%A in (".env.test") do set "%%A=%%B"
npx next dev --port 3847
