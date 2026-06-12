@echo off
echo [1/3] Type check...
npx tsc --noEmit
if %errorlevel% neq 0 ( echo TYPE CHECK FAILED & exit /b 1 )

echo [2/3] Tests...
npm test
if %errorlevel% neq 0 ( echo TESTS FAILED & exit /b 1 )

echo [3/3] Lint...
npm run lint
if %errorlevel% neq 0 ( echo LINT FAILED & exit /b 1 )

echo.
echo All checks passed.
