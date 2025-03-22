#!/bin/bash

# Plexus Interface Deploy Script
# A CLI application for deploying Plexus interfaces

# Print header
echo "========================================"
echo "    Plexus Interface Deploy Script     "
echo "========================================"
echo ""

# Display available options
echo "Please select an interface to deploy:"
echo "1) Hunyuan"
echo ""

# Get user input
read -p "Enter your choice (1): " choice

# Set default if empty
if [ -z "$choice" ]; then
    choice="1"
fi

# Process user choice
case $choice in
    1)
        echo "Deploying Hunyuan interface..."
        echo "Downloading deployment script from GitHub..."
        curl -s https://raw.githubusercontent.com/The-Plexus/Interface-Gist/refs/heads/main/deploy-cli/hunyuan.sh | bash
        ;;
    *)
        echo "Invalid option. Please run the script again and select a valid option."
        exit 1
        ;;
esac

echo ""
echo "Deployment process completed."
