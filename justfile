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

# ==================== Version Management ====================

# Bump tinyopgp version (usage: just bump-tinyopgp 0.2.0)
bump-tinyopgp version:
    #!/usr/bin/env bash
    cd packages/tinyopgp
    # Update package.json version
    sed -i 's/"version": "[^"]*"/"version": "{{version}}"/' package.json
    echo "Updated tinyopgp to version {{version}}"
    grep '"version"' package.json

# Bump slayops version (usage: just bump-slayops 0.2.0)
bump-slayops version:
    #!/usr/bin/env bash
    cd packages/slayops
    # Update package.json version
    sed -i 's/"version": "[^"]*"/"version": "{{version}}"/' package.json
    echo "Updated slayops to version {{version}}"
    grep '"version"' package.json

# Bump Chrome extension version (usage: just bump-chrome 0.2.0)
bump-chrome version:
    #!/usr/bin/env bash
    cd packages/chrome-extension
    # Update package.json version
    sed -i 's/"version": "[^"]*"/"version": "{{version}}"/' package.json
    # Update manifest.json version
    sed -i 's/"version": "[^"]*"/"version": "{{version}}"/' manifest.json
    echo "Updated chrome-extension to version {{version}}"
    echo "package.json:"
    grep '"version"' package.json
    echo "manifest.json:"
    grep '"version"' manifest.json

# Bump Firefox extension version (usage: just bump-firefox 0.2.0)
bump-firefox version:
    #!/usr/bin/env bash
    cd packages/firefox-extension
    # Update package.json version
    sed -i 's/"version": "[^"]*"/"version": "{{version}}"/' package.json
    # Update manifest.json version
    sed -i 's/"version": "[^"]*"/"version": "{{version}}"/' manifest.json
    echo "Updated firefox-extension to version {{version}}"
    echo "package.json:"
    grep '"version"' package.json
    echo "manifest.json:"
    grep '"version"' manifest.json

# Bump both extensions to same version (usage: just bump-extensions 0.2.0)
bump-extensions version: (bump-chrome version) (bump-firefox version)
    @echo "Both extensions updated to version {{version}}"

# Bump all libraries to same version (usage: just bump-libs 0.2.0)
bump-libs version: (bump-tinyopgp version) (bump-slayops version)
    @echo "All libraries updated to version {{version}}"

# Bump everything to same version (usage: just bump-all 0.2.0)
bump-all version: (bump-extensions version) (bump-libs version)
    @echo "All packages updated to version {{version}}"

# Show current versions of all packages
versions:
    #!/usr/bin/env bash
    echo "Current versions:"
    echo "  tinyopgp:         $(grep '"version"' packages/tinyopgp/package.json | head -1 | cut -d'"' -f4)"
    echo "  slayops:          $(grep '"version"' packages/slayops/package.json | head -1 | cut -d'"' -f4)"
    echo "  chrome-extension: $(grep '"version"' packages/chrome-extension/package.json | head -1 | cut -d'"' -f4)"
    echo "  firefox-extension:$(grep '"version"' packages/firefox-extension/package.json | head -1 | cut -d'"' -f4)"

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

# ==================== Self-Distribution ====================

# Sign Firefox extension for self-distribution (requires AMO API credentials)
# Set WEB_EXT_API_KEY and WEB_EXT_API_SECRET environment variables
# Get credentials from: https://addons.mozilla.org/developers/addon/api/key/
sign-firefox: package-firefox
    #!/usr/bin/env bash
    if [ -z "$WEB_EXT_API_KEY" ] || [ -z "$WEB_EXT_API_SECRET" ]; then
        echo "Error: WEB_EXT_API_KEY and WEB_EXT_API_SECRET must be set"
        echo "Get your credentials from: https://addons.mozilla.org/developers/addon/api/key/"
        exit 1
    fi
    cd packages/firefox-extension
    pnpm web-ext sign --source-dir ./dist --channel unlisted
    echo ""
    echo "Signed .xpi file created in web-ext-artifacts/"
    echo "This can be distributed directly - users can install without warnings."

# Run Firefox with extension loaded for testing
run-firefox: build-firefox
    cd packages/firefox-extension && pnpm web-ext run --source-dir ./dist

# Load Chrome extension in browser (prints instructions)
load-chrome: build-chrome
    @echo "To load the Chrome extension:"
    @echo "1. Open chrome://extensions"
    @echo "2. Enable 'Developer mode' (top right)"
    @echo "3. Click 'Load unpacked'"
    @echo "4. Select: $(pwd)/packages/chrome-extension/dist"
    @echo ""
    @echo "Or drag-and-drop the .zip file onto chrome://extensions"

# Pack Chrome extension as .crx file for self-distribution
# First run generates a .pem key file, subsequent runs reuse it for consistent extension ID
pack-chrome: build-chrome
    #!/usr/bin/env bash
    DIST_DIR="$(pwd)/packages/chrome-extension/dist"
    KEY_FILE="$(pwd)/packages/chrome-extension/localpgp.pem"
    
    # Find Chrome/Chromium binary
    CHROME=""
    for cmd in google-chrome chromium chromium-browser google-chrome-stable; do
        if command -v "$cmd" &> /dev/null; then
            CHROME="$cmd"
            break
        fi
    done
    
    if [ -z "$CHROME" ]; then
        echo "Error: Chrome/Chromium not found in PATH"
        echo ""
        echo "Manual method:"
        echo "1. Open chrome://extensions"
        echo "2. Enable Developer mode"
        echo "3. Click 'Pack extension'"
        echo "4. Select folder: $DIST_DIR"
        exit 1
    fi
    
    if [ -f "$KEY_FILE" ]; then
        echo "Using existing key: $KEY_FILE"
        "$CHROME" --pack-extension="$DIST_DIR" --pack-extension-key="$KEY_FILE"
    else
        echo "Generating new key (save the .pem file for future builds!)"
        "$CHROME" --pack-extension="$DIST_DIR"
        # Chrome creates the .pem next to dist folder
        if [ -f "$(pwd)/packages/chrome-extension/dist.pem" ]; then
            mv "$(pwd)/packages/chrome-extension/dist.pem" "$KEY_FILE"
            echo "Key saved to: $KEY_FILE"
        fi
    fi
    
    # Move .crx to packages folder with proper name
    if [ -f "$(pwd)/packages/chrome-extension/dist.crx" ]; then
        VERSION=$(grep -o '"version": "[^"]*"' "$DIST_DIR/manifest.json" | cut -d'"' -f4)
        mv "$(pwd)/packages/chrome-extension/dist.crx" "$(pwd)/packages/chrome-extension/localpgp-chrome-v${VERSION}.crx"
        echo ""
        echo "Created: packages/chrome-extension/localpgp-chrome-v${VERSION}.crx"
        echo ""
        echo "Note: .crx files from outside Chrome Web Store require users to:"
        echo "1. Enable Developer mode in chrome://extensions"
        echo "2. Drag-and-drop the .crx file onto the extensions page"
    fi
