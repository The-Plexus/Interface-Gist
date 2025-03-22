#!/bin/bash
# Hunyuan Interface Deploy
# Author: Neuroplexus

set -e

DEPLOY_DIR="./hunyuan-interface"
MAIN_TS_URL="https://raw.githubusercontent.com/The-Plexus/Interface-Gist/refs/heads/main/source/hunyuan/main.ts"

# Display title
echo "================================="
echo "  Hunyuan Interface Deploy Tool  "
echo "  Author: Neuroplexus            "
echo "================================="

# Check if directory already exists
if [ -d "$DEPLOY_DIR" ]; then
    echo "Error: Directory $DEPLOY_DIR already exists. Please remove it or use a different directory name."
    exit 1
fi

# Create directory
echo "Creating directory $DEPLOY_DIR..."
mkdir -p "$DEPLOY_DIR"

# Download main.ts file
echo "Downloading main.ts file..."
curl -s "$MAIN_TS_URL" -o "$DEPLOY_DIR/main.ts"
if [ $? -ne 0 ]; then
    echo "Error: Failed to download main.ts file."
    rm -rf "$DEPLOY_DIR"
    exit 1
fi

# Create Dockerfile
echo "Creating Dockerfile..."
cat > "$DEPLOY_DIR/Dockerfile" << 'EOF'
# Use the official Deno image as the base image
FROM denoland/deno:alpine

# Set the working directory
WORKDIR /app

# Copy the main.ts file to the working directory
COPY main.ts .

# Install dependencies (if any)
# RUN deno cache --unstable https://deno.land/x/oak@v12.6.1/mod.ts

# Expose the port the app runs on
EXPOSE 8000

# Command to run the application
CMD ["deno", "run", "--allow-net", "--allow-env", "main.ts"]
EOF

# Ask for port configuration
read -p "Enter the port to expose (default: 8000): " PORT
PORT=${PORT:-8000}

# Create docker-compose.yml (使用新版格式，移除了version字段)
echo "Creating docker-compose.yml..."
cat > "$DEPLOY_DIR/docker-compose.yml" << EOF
services:
  hunyuan2api:
    build: .
    ports:
      - ${PORT}:8000
    restart: always
EOF

# Build and start Docker container
echo "Building Docker image..."
cd "$DEPLOY_DIR"
docker-compose build

echo "Starting Docker container..."
docker-compose up -d

echo "=============================================="
echo "Hunyuan Interface successfully deployed!"
echo "API service is now running at: http://localhost:${PORT}"
echo "=============================================="
