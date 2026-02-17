@echo off
REM Quick setup script for Ollama + Llama 3.2

echo.
echo ============================================
echo   Ollama + Llama 3.2 Quick Setup
echo ============================================
echo.

REM Check if Ollama is installed
where ollama >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Ollama not found!
    echo.
    echo Please download and install from: https://ollama.ai
    echo.
    echo After installing, run this script again.
    pause
    exit /b 1
)

echo ✅ Ollama found!
echo.

REM Check if model is already pulled
echo Checking for llama3.2 model...
ollama list | findstr "llama3.2" >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo 📥 Downloading Llama 3.2 (first time takes 5-10 minutes)...
    echo.
    ollama pull llama3.2
    if %errorlevel% neq 0 (
        echo ❌ Failed to download model
        pause
        exit /b 1
    )
) else (
    echo ✅ Llama 3.2 already downloaded
)

echo.
echo ============================================
echo.
echo ✅ Setup complete!
echo.
echo Now starting Ollama server on http://localhost:11434
echo.
echo Keep this window open while using the app.
echo Press Ctrl+C to stop the server.
echo.
echo ============================================
echo.

start http://localhost:11434

REM Start Ollama
ollama serve
