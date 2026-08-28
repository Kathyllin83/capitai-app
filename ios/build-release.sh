#!/bin/bash
# Gera o .ipa de producao do Captai+ para o App Store Connect.
#
# Pre-requisitos (uma vez):
#   - Conta paga no Apple Developer Program (US$ 99/ano)
#   - Certificado "Apple Distribution" instalado no Keychain
#   - App criado no App Store Connect com o bundle id io.capitai.app
#
# Uso:  ./ios/build-release.sh [versao]
#       ./ios/build-release.sh 1.0.1
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE="$ROOT/ios/App/App.xcworkspace"
ARCHIVE="$ROOT/ios/output/Captai.xcarchive"
EXPORT_DIR="$ROOT/ios/output"

VERSION="${1:-}"

echo "==> 1/4  Build web + sync do Capacitor"
cd "$ROOT"
npm run build
npx cap sync ios

if [ -n "$VERSION" ]; then
  echo "==> Marcando MARKETING_VERSION = $VERSION"
  cd "$ROOT/ios/App"
  xcrun agvtool new-marketing-version "$VERSION"
  cd "$ROOT"
fi

echo "==> 2/4  Limpando artefatos anteriores"
rm -rf "$ARCHIVE" "$EXPORT_DIR"/*.ipa

echo "==> 3/4  Archive (Release, assinatura de distribuicao)"
xcodebuild archive \
  -workspace "$WORKSPACE" \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates

echo "==> 4/4  Export do .ipa e upload para o App Store Connect"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$ROOT/ios/ExportOptions.plist" \
  -exportPath "$EXPORT_DIR" \
  -allowProvisioningUpdates

echo
echo "Pronto. Artefatos em: $EXPORT_DIR"
ls -lh "$EXPORT_DIR"/*.ipa 2>/dev/null || echo "(enviado direto ao App Store Connect via destination=upload)"
