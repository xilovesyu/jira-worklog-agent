@echo off
setlocal enabledelayedexpansion

:: Go to project root (parent of installer directory)
cd /d "%~dp0.."

echo ========================================
echo  Jira Worklog Agent Installer Builder
echo ========================================
echo.

:: Check if Inno Setup is installed
set ISCC=""
if exist "%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe" (
    set ISCC="%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"
) else if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" (
    set ISCC="C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
) else if exist "C:\Program Files\Inno Setup 6\ISCC.exe" (
    set ISCC="C:\Program Files\Inno Setup 6\ISCC.exe"
)

if %ISCC%=="" (
    echo ERROR: Inno Setup 6 not found!
    echo.
    echo Please download and install from:
    echo https://jrsoftware.org/isdl.php
    echo.
    echo After installation, run this script again.
    pause
    exit /b 1
)

:: Build installer (project already built by npm run build:installer)
echo Building installer...
%ISCC% installer\setup.iss
if errorlevel 1 (
    echo ERROR: Installer build failed!
    pause
    exit /b 1
)

echo.
echo ========================================
echo  SUCCESS! Installer created.
echo ========================================
echo.
echo Output: dist\jira-worklog-agent-setup.exe
echo.
pause