#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Determine system architecture
ARCH=$(uname -m)

# Set download link based on architecture
if [ "$ARCH" == "x86_64" ]; then
    DOWNLOAD_LINK="https://github.com/rhasspy/piper/releases/download/v1.0.0/piper_amd64.tar.gz"
elif [ "$ARCH" == "aarch64" ]; then
    DOWNLOAD_LINK="https://github.com/rhasspy/piper/releases/download/v1.0.0/piper_arm64.tar.gz"
elif [ "$ARCH" == "armv7l" ]; then
    DOWNLOAD_LINK="https://github.com/rhasspy/piper/releases/download/v1.0.0/piper_armv7.tar.gz"
else
    echo "Unsupported architecture: $ARCH. You will have to manually compile and install piper from their repo https://github.com/rhasspy/piper/"
    exit 1
fi

# Ask user for permission to install
read -p "This will download and install Piper from $DOWNLOAD_LINK. Not needed if piper is already installed. Do you want to proceed? (y/n)" REPLY
if [[ $REPLY == "y" || $REPLY == "Y" ]]; then

    # Download and extract Piper

    echo "Downloading and extracting Piper in plugins/piper..."

    mkdir -p plugins/voice
    cd plugins/voice
    wget $DOWNLOAD_LINK -O piper.tar.gz
    tar -xvf piper.tar.gz
    rm piper.tar.gz

    cd ../../

    export PATH=$PATH:$PWD/plugins/voice/piper

fi


BASE_VOICE_MODEL_URL="https://api.github.com/repos/rhasspy/piper/releases/tags/v0.0.2"
read -p "This script will download onnx piper models from from $BASE_VOICE_MODEL_URL. Not needed if you already have models downloaded. Do you want to proceed? (y/n) " REPLY

if [[ $REPLY == "y" || $REPLY == "Y" ]]; then

    # Use the GitHub API to get a list of voice assets
    VOICE_DATA=$(curl -s https://api.github.com/repos/rhasspy/piper/releases/tags/v0.0.2)

    # Filter the voice assets using jq, selecting only the ones that start with "voice" and contain "_en"
    VOICE_NAMES=($(echo $VOICE_DATA | jq -r '.assets[] | select(.name | startswith("voice") and contains("-en")) | .name' | head -10))
    VOICE_URLS=($(echo $VOICE_DATA | jq -r '.assets[] | select(.name | startswith("voice") and contains("-en")) | .browser_download_url' | head -10))

    # Give the user a choice to select a voice
    echo "Please select one of the following voices:"
    for i in "${!VOICE_NAMES[@]}"; do 
    echo "$((i+1))) ${VOICE_NAMES[$i]}"
    done

    read -p "Enter the number corresponding to your voice preference: " VOICE_NUM

    # Set voice download link based on user preference
    VOICE_LINK="${VOICE_URLS[$((VOICE_NUM-1))]}"

    # Download and extract voice
    mkdir -p models/piper
    cd models/piper
    wget $VOICE_LINK -O voice.tar.gz
    tar -xvf voice.tar.gz
    rm voice.tar.gz

    if [ $? -eq 0 ]; then
        echo "Voice model downloaded completed successfully."
    else
        echo "Voice model downloaded failed. Please errors and try again."
    fi

fi