.PHONY: help run run-build
help:
	@echo ""
	@echo "  Comandos disponibles en el Makefile (Bun + Nativo):"
	@echo "  --------------------------------------------------"
	@echo "  make run        - Inicia Metro sin caché usando bunx --clear"
	@echo "  make run-build  - Compila y ejecuta la app nativa en dispositivo físico (--device) con bun"
	@echo "  make help       - Muestra este menú de ayuda"
	@echo ""

run:
	@echo "🧹 Limpiando caché de Metro y corriendo en iOS (Bun)..."
	bunx expo start --clear

run-build:
	@echo "📱 Compilando y ejecutando la app nativa en dispositivo físico iOS (--device) con Bun..."
	bunx expo run:ios --device

xcode:
	@echo "🍎 Abriendo en xcode"
	open ./ios/Nimly.xcworkspace