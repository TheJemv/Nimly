# ============================================================================
#  Nimly · Makefile (iOS-only · Expo SDK 57 + Bun)
#  `make` o `make help` muestra todos los comandos.
# ============================================================================

# --- Configuración ----------------------------------------------------------
SHELL       := /bin/bash
SCHEME      := Nimly
IOS_DIR     := ios
WORKSPACE   := $(IOS_DIR)/$(SCHEME).xcworkspace

# Fix de locale para el bug CocoaPods 1.16.2 + Ruby 4.0
#   (Encoding::CompatibilityError al correr `pod install`)
POD_ENV     := LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

.DEFAULT_GOAL := help

# ============================================================================
##@ Ayuda
# ============================================================================

help: ## Muestra este menú
	@awk 'BEGIN {FS = ":.*##"; printf "\n  \033[1mNimly · Makefile (iOS)\033[0m\n"} \
		/^[a-zA-Z0-9_.-]+:.*?##/ { printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2 } \
		/^##@/ { printf "\n  \033[1m%s\033[0m\n", substr($$0, 5) }' $(MAKEFILE_LIST)
	@echo ""

# ============================================================================
##@ Setup
# ============================================================================

install: ## Instala dependencias con Bun
	@echo "📦 bun install..."
	bun install

deps-fix: ## Alinea las versiones de dependencias al SDK de Expo actual
	@echo "🔧 expo install --fix..."
	bunx expo install --fix

# ============================================================================
##@ Desarrollo (Metro)
# ============================================================================

start: ## Inicia Metro limpiando caché (dev client)
	@echo "🧹 expo start --clear..."
	bunx expo start --clear

dev: ## Inicia Metro sin limpiar caché
	bunx expo start

tunnel: ## Inicia Metro vía túnel (dispositivo fuera de la red local)
	bunx expo start --tunnel --clear

# ============================================================================
##@ Nativo iOS
# ============================================================================

prebuild: ## Sincroniza el proyecto nativo iOS (no borra ios/) + Pods
	@echo "🍎 expo prebuild (sync)..."
	bunx expo prebuild --platform ios --no-install
	@$(MAKE) --no-print-directory pods

prebuild-clean: ## Regenera iOS desde cero (borra ios/) + Pods
	@echo "🍎 Regenerando iOS desde cero..."
	rm -rf $(IOS_DIR)
	bunx expo prebuild --platform ios --clean --no-install
	@$(MAKE) --no-print-directory pods
	@echo "✨ iOS listo. Usa 'make run' o 'make xcode'."

ios: prebuild-clean ## Alias de prebuild-clean

pods: ## Instala CocoaPods (con fix de locale)
	@echo "🫛  pod install..."
	cd $(IOS_DIR) && $(POD_ENV) pod install

pods-update: ## pod install con --repo-update (refresca specs)
	@echo "🫛  pod install --repo-update..."
	cd $(IOS_DIR) && $(POD_ENV) pod install --repo-update

run: ## Compila y corre en el simulador iOS
	bunx expo run:ios

run-device: ## Compila y corre en un iPhone físico conectado
	bunx expo run:ios --device

run-release: ## Compila y corre en Release (simulador)
	bunx expo run:ios --configuration Release

xcode: ## Abre el workspace en Xcode
	@test -d $(WORKSPACE) || { echo "❌ No existe $(WORKSPACE). Corre 'make prebuild'."; exit 1; }
	open $(WORKSPACE)

# ============================================================================
##@ Calidad
# ============================================================================

doctor: ## expo-doctor (verifica dependencias y config)
	bunx expo-doctor

lint: ## ESLint
	bunx expo lint

typecheck: ## Chequeo de tipos TypeScript
	bunx tsc --noEmit

check: lint typecheck doctor ## Corre lint + typecheck + doctor

# ============================================================================
##@ EAS (nube)
# ============================================================================

eas-build-dev: ## EAS build iOS · perfil development
	bunx eas build --platform ios --profile development

eas-build-preview: ## EAS build iOS · perfil preview
	bunx eas build --platform ios --profile preview

eas-build: ## EAS build iOS · perfil production
	bunx eas build --platform ios --profile production

eas-submit: ## Envía el último build iOS a TestFlight / App Store Connect
	bunx eas submit --platform ios --latest

eas-update: ## Publica un OTA update (expo-updates)
	bunx eas update --auto

# ============================================================================
##@ Limpieza
# ============================================================================

clean: ## Limpia cachés (Metro, .expo, ios/build)
	@echo "🧽 Limpiando cachés..."
	rm -rf .expo $(IOS_DIR)/build $(TMPDIR)metro-* $(TMPDIR)haste-map-* 2>/dev/null || true
	-watchman watch-del-all 2>/dev/null

clean-pods: ## Borra Pods/ y Podfile.lock y reinstala
	rm -rf $(IOS_DIR)/Pods $(IOS_DIR)/Podfile.lock
	@$(MAKE) --no-print-directory pods

clean-modules: ## Borra node_modules y reinstala con Bun
	rm -rf node_modules
	bun install

clean-all: ## Limpieza profunda (node_modules + ios/ + cachés) y regenera
	@echo "🔥 Limpieza profunda..."
	rm -rf node_modules $(IOS_DIR) .expo
	bun install
	@$(MAKE) --no-print-directory prebuild-clean
	@echo "🚀 Proyecto regenerado."

# ============================================================================
##@ Utilidades
# ============================================================================

versions: ## Muestra versiones de las herramientas
	@echo "bun      : $$(bun --version 2>/dev/null || echo n/a)"
	@echo "expo     : $$(bunx expo --version 2>/dev/null || echo n/a)"
	@echo "node     : $$(node --version 2>/dev/null || echo n/a)"
	@echo "pod      : $$(pod --version 2>/dev/null || echo n/a)"
	@echo "xcode    : $$(xcodebuild -version 2>/dev/null | head -1 || echo n/a)"

.PHONY: help install deps-fix start dev tunnel prebuild prebuild-clean ios pods \
        pods-update run run-device run-release xcode doctor lint typecheck check \
        eas-build-dev eas-build-preview eas-build eas-submit eas-update \
        clean clean-pods clean-modules clean-all versions
