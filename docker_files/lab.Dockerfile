# ============================================================
# SECURATION LAB — Isolated Terminal Sandbox Image
# Base: Debian slim for reliability + small footprint
# ============================================================
FROM debian:bookworm-slim

# --- System setup ---
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    curl \
    wget \
    git \
    nmap \
    netcat-openbsd \
    dnsutils \
    iputils-ping \
    net-tools \
    python3 \
    python3-pip \
    openssl \
    file \
    less \
    vim-tiny \
    jq \
    ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# --- Create low-privilege seclab user (NO root!) ---
RUN useradd -m -s /bin/bash -u 1001 seclab && \
    mkdir -p /home/seclab/workspace && \
    chown -R seclab:seclab /home/seclab

# --- Custom secure shell profile ---
RUN echo 'export PS1="\[\e[1;32m\]seclab@seclab\[\e[0m\]:\[\e[1;34m\]\w\[\e[0m\]\$ "' >> /home/seclab/.bashrc && \
    echo 'export TERM=xterm-256color' >> /home/seclab/.bashrc && \
    echo 'alias ll="ls -la --color=auto"' >> /home/seclab/.bashrc && \
    echo 'alias cls="clear"' >> /home/seclab/.bashrc && \
    echo "" >> /home/seclab/.bashrc && \
    echo 'echo ""' >> /home/seclab/.bashrc && \
    echo 'echo -e "\e[1;32m╔══════════════════════════════════════╗\e[0m"' >> /home/seclab/.bashrc && \
    echo 'echo -e "\e[1;32m║   SECURATION LAB — ISOLATED SHELL    ║\e[0m"' >> /home/seclab/.bashrc && \
    echo 'echo -e "\e[1;32m╚══════════════════════════════════════╝\e[0m"' >> /home/seclab/.bashrc && \
    echo 'echo ""' >> /home/seclab/.bashrc

# --- Set working directory ---
WORKDIR /home/seclab/workspace

# --- Switch to non-root user ---
USER seclab

# --- Default command ---
CMD ["/bin/bash"]
