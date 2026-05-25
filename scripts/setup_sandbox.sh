#!/bin/bash
# ============================================================
# SECURATION LAB — Docker Sandbox Setup Script
# Builds both the AttackBox and Target images.
# Usage: bash scripts/setup_sandbox.sh
# ============================================================

set -e

# Change directory to the project root (one level up from this script)
cd "$(dirname "$0")/.." || exit

CYAN='\033[1;36m'
GREEN='\033[1;32m'
RED='\033[1;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[..] $1${NC}"; }
err()  { echo -e "${RED}[ERR]${NC} $1"; }

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════╗"
echo "║  SECURATION LAB — Sandbox Setup v2.0    ║"
echo "╚══════════════════════════════════════════╝"
echo -e "${NC}"

# ── Step 1: Check Docker ─────────────────────────────────────
warn "Checking Docker..."
if ! command -v docker &>/dev/null; then
    err "Docker not found. Installing..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker "$USER"
    log "Docker installed. You may need to log out and back in."
else
    log "Docker found: $(docker --version)"
fi

# ── Step 2: Ensure Docker daemon is running ──────────────────
warn "Starting Docker daemon..."
if ! docker info &>/dev/null 2>&1; then
    # Try Docker Desktop first (Linux)
    if systemctl --user status docker-desktop &>/dev/null 2>&1; then
        systemctl --user start docker-desktop
        sleep 3
    else
        sudo systemctl start docker
        sleep 2
    fi
fi
log "Docker daemon is running."

# ── Step 3: Build AttackBox image ────────────────────────────
warn "Building AttackBox image (seclab-terminal:latest)..."
docker build \
    -t seclab-terminal:latest \
    -f docker_files/lab.Dockerfile \
    docker_files/
log "AttackBox image built."

# ── Step 4: Build Target image ───────────────────────────────
warn "Building Target image (seclab-target:latest)..."
docker build \
    -t seclab-target:latest \
    -f docker_files/target.Dockerfile \
    docker_files/
log "Target image built."

# ── Step 5: Install Python docker SDK ───────────────────────
warn "Installing Python docker SDK..."
if [ -d "venv" ]; then
    source venv/bin/activate
fi
pip install docker==7.1.0 -q
log "docker SDK installed."

# ── Summary ──────────────────────────────────────────────────
echo ""
echo -e "${CYAN}══════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Setup complete!${NC}"
echo ""
echo "Images available:"
docker images | grep "seclab-"
echo ""
echo -e "Run the server:  ${CYAN}python run.py${NC}"
echo -e "API docs:        ${CYAN}http://127.0.0.1:8000/docs${NC}"
echo -e "${CYAN}══════════════════════════════════════════════${NC}"
