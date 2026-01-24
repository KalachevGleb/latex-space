#!/bin/bash
# Check system requirements for Overleaf installation
# Works on both macOS and Linux

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=========================================="
echo "Overleaf System Requirements Check"
echo "=========================================="
echo ""

ERRORS=0
WARNINGS=0

# Detect OS
OS="$(uname -s)"

# Check Docker
echo -n "Checking Docker... "
if command -v docker &> /dev/null; then
    # Extract version number (works on both macOS and Linux)
    DOCKER_VERSION=$(docker --version | sed -E 's/.*version ([0-9]+\.[0-9]+).*/\1/')
    REQUIRED_VERSION="20.10"

    # Compare versions using sort -V
    if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$DOCKER_VERSION" | sort -V | head -n1)" = "$REQUIRED_VERSION" ]; then
        echo -e "${GREEN}OK${NC} (version $DOCKER_VERSION)"
    else
        echo -e "${RED}FAIL${NC} (version $DOCKER_VERSION < $REQUIRED_VERSION)"
        ((ERRORS++))
    fi
else
    echo -e "${RED}NOT FOUND${NC}"
    ((ERRORS++))
fi

# Check Docker Compose
echo -n "Checking Docker Compose... "
if docker compose version &> /dev/null; then
    COMPOSE_VERSION=$(docker compose version --short 2>/dev/null || echo "unknown")
    echo -e "${GREEN}OK${NC} (version $COMPOSE_VERSION)"
else
    echo -e "${RED}NOT FOUND${NC}"
    ((ERRORS++))
fi

# Check Python3 (required for JSON parsing)
echo -n "Checking Python3... "
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
    echo -e "${GREEN}OK${NC} (version $PYTHON_VERSION)"
else
    echo -e "${RED}NOT FOUND${NC} (required for config parsing)"
    ((ERRORS++))
fi

# Check disk space
echo -n "Checking disk space... "
if [ "$OS" = "Darwin" ]; then
    # macOS: df returns 512-byte blocks by default
    AVAILABLE_KB=$(df -k / | tail -1 | awk '{print $4}')
else
    # Linux
    AVAILABLE_KB=$(df / | tail -1 | awk '{print $4}')
fi
REQUIRED_KB=$((50 * 1024 * 1024)) # 50GB in KB

if [ "$AVAILABLE_KB" -gt "$REQUIRED_KB" ]; then
    AVAILABLE_GB=$((AVAILABLE_KB / 1024 / 1024))
    echo -e "${GREEN}OK${NC} (${AVAILABLE_GB}GB available)"
else
    AVAILABLE_GB=$((AVAILABLE_KB / 1024 / 1024))
    echo -e "${RED}INSUFFICIENT${NC} (${AVAILABLE_GB}GB available, 50GB required)"
    ((ERRORS++))
fi

# Check RAM
echo -n "Checking RAM... "
if [ "$OS" = "Darwin" ]; then
    # macOS: use sysctl
    TOTAL_RAM_BYTES=$(sysctl -n hw.memsize)
    TOTAL_RAM_MB=$((TOTAL_RAM_BYTES / 1024 / 1024))
else
    # Linux: use free
    TOTAL_RAM_MB=$(free -m | awk '/^Mem:/{print $2}')
fi

REQUIRED_RAM_MB=8000 # 8GB in MB
if [ "$TOTAL_RAM_MB" -gt "$REQUIRED_RAM_MB" ]; then
    TOTAL_RAM_GB=$((TOTAL_RAM_MB / 1024))
    echo -e "${GREEN}OK${NC} (${TOTAL_RAM_GB}GB total)"
else
    TOTAL_RAM_GB=$((TOTAL_RAM_MB / 1024))
    echo -e "${YELLOW}LOW${NC} (${TOTAL_RAM_GB}GB total, 8GB recommended)"
    ((WARNINGS++))
fi

# Check if port 80 is available
echo -n "Checking port 80... "
if [ "$OS" = "Darwin" ]; then
    # macOS: use lsof
    if lsof -i :80 -sTCP:LISTEN &>/dev/null; then
        echo -e "${YELLOW}IN USE${NC} (configure different port in config)"
        ((WARNINGS++))
    else
        echo -e "${GREEN}AVAILABLE${NC}"
    fi
else
    # Linux: try ss or netstat
    if command -v ss &> /dev/null; then
        if ss -tlnp 2>/dev/null | grep -q ':80 '; then
            echo -e "${YELLOW}IN USE${NC} (configure different port in config)"
            ((WARNINGS++))
        else
            echo -e "${GREEN}AVAILABLE${NC}"
        fi
    elif command -v netstat &> /dev/null; then
        if netstat -tlnp 2>/dev/null | grep -q ':80 '; then
            echo -e "${YELLOW}IN USE${NC} (configure different port in config)"
            ((WARNINGS++))
        else
            echo -e "${GREEN}AVAILABLE${NC}"
        fi
    else
        echo -e "${YELLOW}SKIP${NC} (no tool to check)"
        ((WARNINGS++))
    fi
fi

# Check Docker socket
echo -n "Checking Docker socket... "
DOCKER_SOCK="/var/run/docker.sock"
if [ "$OS" = "Darwin" ]; then
    # macOS: check user socket too
    USER_SOCK="$HOME/.docker/run/docker.sock"
    if [ -S "$DOCKER_SOCK" ] || [ -S "$USER_SOCK" ]; then
        echo -e "${GREEN}OK${NC}"
    else
        echo -e "${RED}NOT FOUND${NC} (is Docker running?)"
        ((ERRORS++))
    fi
else
    if [ -S "$DOCKER_SOCK" ]; then
        if [ -r "$DOCKER_SOCK" ] && [ -w "$DOCKER_SOCK" ]; then
            echo -e "${GREEN}OK${NC}"
        else
            echo -e "${YELLOW}PERMISSION ISSUE${NC} (add user to docker group)"
            ((WARNINGS++))
        fi
    else
        echo -e "${RED}NOT FOUND${NC}"
        ((ERRORS++))
    fi
fi

# Summary
echo ""
echo "=========================================="
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}All checks passed!${NC}"
    echo "System is ready for Overleaf installation."
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}Checks completed with $WARNINGS warning(s)${NC}"
    echo "Installation can proceed, but review warnings above."
    exit 0
else
    echo -e "${RED}Checks failed with $ERRORS error(s) and $WARNINGS warning(s)${NC}"
    echo "Please fix errors before proceeding with installation."
    exit 1
fi
