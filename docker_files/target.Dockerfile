# ============================================================
# SECURATION LAB — Vulnerable Target Machine Image
# This container simulates a real vulnerable web server.
# It is intentionally vulnerable for educational purposes.
# ============================================================
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl wget netcat-openbsd nmap iputils-ping \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN pip install flask==3.0.0 --no-cache-dir

# Create a non-root user for the app process
RUN useradd -m -u 1001 target

WORKDIR /app

# Each challenge has its own vulnerable app file.
# They are copied into the image and selected at container start.
COPY target_apps/ /app/target_apps/

USER target
EXPOSE 5000

# Shell form so $CHALLENGE_ID is expanded at runtime
CMD python /app/target_apps/${CHALLENGE_ID}.py
