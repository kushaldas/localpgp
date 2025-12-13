# Justfile for localpgp development

# Default recipe
default:
    @just --list

# Install dependencies
install:
    pnpm install

# Build all packages
build: install
    pnpm build

# Build tinyopgp library
build-lib:
    cd packages/tinyopgp && pnpm build

# Build Chrome extension
build-chrome:
    cd packages/chrome-extension && pnpm build

# Build Firefox extension  
build-firefox:
    cd packages/firefox-extension && pnpm build

# Development mode for Chrome extension
dev-chrome:
    cd packages/chrome-extension && pnpm dev

# Development mode for Firefox extension
dev-firefox:
    cd packages/firefox-extension && pnpm dev

# Run tests
test:
    cd packages/tinyopgp && pnpm test

# Lint all packages
lint:
    pnpm -r lint

# Clean all build artifacts
clean:
    rm -rf packages/*/dist packages/*/node_modules node_modules

# Install native messaging host for Chrome (Linux)
install-native-chrome:
    ./native-messaging-host/install-chrome.sh

# Install native messaging host for Firefox (Linux)
install-native-firefox:
    ./native-messaging-host/install-firefox.sh

# Restart pcscd in debug mode
restart-pcscd:
    #!/usr/bin/env bash
    sudo pkill -9 pcscd 2>/dev/null || true
    sleep 1
    # Start pcscd and redirect all output to log file (no STDOUT)
    sudo /usr/sbin/pcscd --foreground --debug --apdu > /tmp/pcscd_debug.log 2>&1 &
    sleep 2
    echo "pcscd started in debug mode, logging to /tmp/pcscd_debug.log"

# Watch pcscd logs
watch-pcscd:
    tail -f /tmp/pcscd_debug.log

# ==================== Publishing ====================

# Package Chrome extension for publishing (creates .zip)
package-chrome: build-chrome
    #!/usr/bin/env bash
    cd packages/chrome-extension/dist
    VERSION=$(grep -o '"version": "[^"]*"' manifest.json | cut -d'"' -f4)
    ZIP_NAME="localpgp-chrome-v${VERSION}.zip"
    rm -f "../${ZIP_NAME}"
    zip -r "../${ZIP_NAME}" . -x "*.map"
    echo "Created: packages/chrome-extension/${ZIP_NAME}"

# Package Firefox extension for publishing (creates .zip for AMO)
package-firefox: build-firefox
    #!/usr/bin/env bash
    cd packages/firefox-extension/dist
    VERSION=$(grep -o '"version": "[^"]*"' manifest.json | cut -d'"' -f4)
    ZIP_NAME="localpgp-firefox-v${VERSION}.zip"
    rm -f "../${ZIP_NAME}"
    zip -r "../${ZIP_NAME}" . -x "*.map"
    echo "Created: packages/firefox-extension/${ZIP_NAME}"

# Package both extensions
package-extensions: package-chrome package-firefox
    @echo "All extensions packaged!"

# Build and pack tinyopgp for npm publishing
package-tinyopgp:
    #!/usr/bin/env bash
    cd packages/tinyopgp
    pnpm build
    pnpm pack
    echo "Created: packages/tinyopgp/$(ls -t *.tgz | head -1)"

# Build and pack slayops for npm publishing
package-slayops:
    #!/usr/bin/env bash
    cd packages/slayops
    pnpm build
    pnpm pack
    echo "Created: packages/slayops/$(ls -t *.tgz | head -1)"

# Package all libraries for npm
package-libs: package-tinyopgp package-slayops
    @echo "All libraries packaged!"

# Package everything (extensions + libraries)
package-all: package-extensions package-libs
    @echo "All packages ready for publishing!"

# Publish tinyopgp to npm (dry-run by default, use PUBLISH=1 for real)
publish-tinyopgp: package-tinyopgp
    #!/usr/bin/env bash
    cd packages/tinyopgp
    if [ "${PUBLISH:-0}" = "1" ]; then
        pnpm publish --access public
    else
        pnpm publish --dry-run --access public
        echo ""
        echo "Dry run complete. Run 'PUBLISH=1 just publish-tinyopgp' to publish for real."
    fi

# Publish slayops to npm (dry-run by default, use PUBLISH=1 for real)
publish-slayops: package-slayops
    #!/usr/bin/env bash
    cd packages/slayops
    if [ "${PUBLISH:-0}" = "1" ]; then
        pnpm publish --access public
    else
        pnpm publish --dry-run --access public
        echo ""
        echo "Dry run complete. Run 'PUBLISH=1 just publish-slayops' to publish for real."
    fi
