@echo off
rem Compiles all PayNet sources into bin\.
cd /d "%~dp0.."
if not exist bin mkdir bin
dir /s /b src\*.java > sources.txt
javac -d bin @sources.txt
if errorlevel 1 (
  echo Compilation failed.
  pause
  exit /b 1
)
echo Build OK - classes are in bin\
pause
