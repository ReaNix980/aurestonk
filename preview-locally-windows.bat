@echo off
cd /d "%~dp0site"
echo Aurestonk preview: http://localhost:8800   (close this window to stop)
start http://localhost:8800
python -m http.server 8800
