.PHONY: help run run-build xcode ios doctor clean-modules clean-all eas-build eas-submit

help:
	@echo ""
	@echo "  Comandos disponibles en el Makefile (Bun + Nativo):"
	@echo "  --------------------------------------------------"
	@echo "  make run            - Inicia Metro sin caché usando Bun"
	@echo "  make run-build      - Compila y ejecuta la app nativa en dispositivo físico (--device)"
	@echo "  make xcode          - Abre el workspace de Xcode"
	@echo "  make ios            - Regenera la plataforma nativa de iOS desde cero (Prebuild + Pods)"
	@echo "  make doctor         - Ejecuta expo-doctor para verificar dependencias"
	@echo "  make clean-modules  - Limpia node_modules y reinstala con Bun"
	@echo "  make clean-all      - Limpieza profunda (node_modules, ios, android y lockfile)"
	@echo "  make eas-build      - Genera un build de producción para iOS en la nube (EAS)"
	@echo "  make eas-submit     - Envía el último build de iOS a TestFlight / App Store Connect"
	@echo "  make help           - Muestra este menú de ayuda"
	@echo ""

run:
	@echo "🧹 Limpiando caché de Metro y corriendo Expo (Bun)..."
	bunx expo start --clear

run-build:
	@echo "📱 Compilando y ejecutando la app nativa en dispositivo físico iOS (--device) con Bun..."
	bunx expo run:ios --device

xcode:
	@echo "🍎 Abriendo en Xcode..."
	open ./ios/Nimly.xcworkspace

ios:
	@echo "🍎 Limpiando y ejecutando prebuild para iOS..."
	rm -rf ios
	bunx expo prebuild --platform ios --clean
	@echo "✨ ¡iOS listo para compilar con 'make run-build' o 'make xcode'!"

doctor:
	@echo "🩺 Ejecutando Expo Doctor..."
	bunx expo-doctor

clean-modules:
	@echo "🗑️ Limpiando node_modules y reinstalando con Bun..."
	rm -rf node_modules bun.lockb
	bun install

clean-all:
	@echo "🔥 Ejecutando limpieza profunda del proyecto..."
	rm -rf node_modules ios android bun.lockb
	bun install
	bunx expo prebuild --platform ios --clean
	cd ios && pod install && cd ..
	@echo "🚀 ¡Proyecto limpio y regenerado con éxito!"

eas-build:
	@echo "☁️ Iniciando compilación de producción para iOS en los servidores de EAS..."
	bunx eas build --platform ios --profile production

eas-submit:
	@echo "🚀 Enviando el último build de iOS hacia TestFlight / App Store Connect..."
	bunx eas submit --platform ios