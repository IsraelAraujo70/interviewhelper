@echo off
echo Executando electron-builder como administrador...
powershell -Command "Start-Process cmd -Verb RunAs -ArgumentList '/c cd %cd% && npm run build'"
echo Processo completo! 