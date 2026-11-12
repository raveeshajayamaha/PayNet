@echo off
rem Compiles PayNet into bin\ and runs com.paynet.client.PayNetGui from the project root.
cd /d "%~dp0.."
if not exist bin mkdir bin
dir /s /b src\*.java > sources.txt
javac -d bin @sources.txt
if errorlevel 1 (
  echo Compilation failed.
  pause
  exit /b 1
)
java -cp bin com.paynet.client.PayNetGui %*
pause
