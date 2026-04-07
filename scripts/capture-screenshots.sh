#!/bin/bash
# Screenshot Capture Script for Holocron
#
# This script helps capture screenshots from iOS Simulator and Android Emulator
# and organizes them in the docs/screenshots directory.

set -e

SCREENSHOTS_DIR="docs/screenshots"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Holocron Screenshot Capture Tool${NC}"
echo "================================"
echo ""

# Check if docs/screenshots directory exists
if [ ! -d "$SCREENSHOTS_DIR" ]; then
    echo -e "${RED}Error: $SCREENSHOTS_DIR directory not found${NC}"
    exit 1
fi

# Detect available platforms
IOS_RUNNING=false
ANDROID_RUNNING=false

# Check for iOS Simulator
if pgrep -x "Simulator" > /dev/null; then
    IOS_RUNNING=true
    echo -e "${GREEN}✓${NC} iOS Simulator detected"
fi

# Check for Android Emulator
if pgrep -x "qemu-system" > /dev/null || adb devices | grep -q "emulator"; then
    ANDROID_RUNNING=true
    echo -e "${GREEN}✓${NC} Android Emulator detected"
fi

echo ""
echo "Select platform:"
if [ "$IOS_RUNNING" = true ]; then
    echo "  1) iOS Simulator"
fi
if [ "$ANDROID_RUNNING" = true ]; then
    echo "  2) Android Emulator"
fi
echo "  q) Quit"
echo ""
read -p "Enter choice: " choice

case $choice in
    1)
        if [ "$IOS_RUNNING" = false ]; then
            echo -e "${RED}Error: iOS Simulator not running${NC}"
            exit 1
        fi

        echo ""
        echo "Available screens:"
        echo "  1) chat-interface       - Main chat screen"
        echo "  2) search-results       - Document search"
        echo "  3) research-workflow    - Deep research progress"
        echo "  4) document-management  - Document list"
        echo "  5) articles-list        - Article feed"
        echo "  6) settings-screen      - Settings"
        echo "  7) web-view             - Web content"
        echo ""
        read -p "Select screen (1-7): " screen

        case $screen in
            1) name="chat-interface" ;;
            2) name="search-results" ;;
            3) name="research-workflow" ;;
            4) name="document-management" ;;
            5) name="articles-list" ;;
            6) name="settings-screen" ;;
            7) name="web-view" ;;
            *)
                echo -e "${RED}Invalid selection${NC}"
                exit 1
                ;;
        esac

        read -p "Include variant? (light/dark/none): " variant
        if [ "$variant" = "light" ] || [ "$variant" = "dark" ]; then
            filename="${name}-${variant}.png"
        else
            filename="${name}.png"
        fi

        echo ""
        echo -e "${YELLOW}Capturing iOS Simulator screen...${NC}"
        echo "Press Cmd+S in the simulator window to capture"
        echo ""

        # Open Simulator
        open -a Simulator

        # Wait a moment for Simulator to be active
        sleep 1

        # Use xcrun to capture screenshot
        xcrun simctl io booted screenshot "$SCREENSHOTS_DIR/$filename"

        echo -e "${GREEN}✓${NC} Screenshot saved: $SCREENSHOTS_DIR/$filename"
        ;;

    2)
        if [ "$ANDROID_RUNNING" = false ]; then
            echo -e "${RED}Error: Android Emulator not running${NC}"
            exit 1
        fi

        echo ""
        echo "Available screens:"
        echo "  1) chat-interface       - Main chat screen"
        echo "  2) search-results       - Document search"
        echo "  3) research-workflow    - Deep research progress"
        echo "  4) document-management  - Document list"
        echo "  5) articles-list        - Article feed"
        echo "  6) settings-screen      - Settings"
        echo "  7) web-view             - Web content"
        echo ""
        read -p "Select screen (1-7): " screen

        case $screen in
            1) name="chat-interface" ;;
            2) name="search-results" ;;
            3) name="research-workflow" ;;
            4) name="document-management" ;;
            5) name="articles-list" ;;
            6) name="settings-screen" ;;
            7) name="web-view" ;;
            *)
                echo -e "${RED}Invalid selection${NC}"
                exit 1
                ;;
        esac

        read -p "Include variant? (light/dark/none): " variant
        if [ "$variant" = "light" ] || [ "$variant" = "dark" ]; then
            filename="${name}-${variant}.png"
        else
            filename="${name}.png"
        fi

        echo ""
        echo -e "${YELLOW}Capturing Android Emulator screen...${NC}"

        # Use adb to capture screenshot
        adb exec-out screencap -p > "$SCREENSHOTS_DIR/$filename"

        echo -e "${GREEN}✓${NC} Screenshot saved: $SCREENSHOTS_DIR/$filename"
        ;;

    q)
        echo "Quit"
        exit 0
        ;;

    *)
        echo -e "${RED}Invalid selection${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}Done!${NC}"
echo "Don't forget to update README.md to mark the screenshot as ✅ Added"
