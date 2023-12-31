#!/bin/bash

# Bash Script to Install Dependencies and Compile Addons

# Exit immediately if a command exits with a non-zero status
set -e

# Starting point of the script
echo "Starting Script..."

# Function to check if directory is empty
is_dir_empty() {
    if [ -n "$(ls -A "$1")" ]; then
        return 1
    else
        return 0
    fi
}

# Check if the whisper.cpp and llama.cpp directories are empty
if is_dir_empty "whisper.cpp" || is_dir_empty "llama.cpp"; then
    echo "Warning: The whisper.cpp or llama.cpp submodules seem to be empty."

    # Ask the user if they want to download the submodules
    read -p "Do you want to download the submodules? [y/n] " DOWNLOAD_SUBMODULES_CHOICE

    if [[ $DOWNLOAD_SUBMODULES_CHOICE == "y" || $DOWNLOAD_SUBMODULES_CHOICE == "Y" ]]; then
        # Initialize the submodules if they haven't been initialized yet
        git submodule init

        # Update the submodules
        git submodule update
    else
        echo "Skipping submodule download..."
    fi
fi

# Install npm dependencies in the current directory
echo "Installing npm dependencies in the current directory..."
npm install

# Prompt the user for whether they want CUBLAS turned on or not
read -p "Do you want to turn CUBLAS ON? [y/n] " CUBLAS_CHOICE

if [[ $CUBLAS_CHOICE == "y" || $CUBLAS_CHOICE == "Y" ]]; then
    CUBLAS_FLAG_CMAKE="ON"
else
    CUBLAS_FLAG_CMAKE="OFF"
fi

mkdir -p bindings/whisper

# Navigate to whisper.cpp examples directory and install dependencies
echo "Installing npm dependencies for whisper.cpp examples..."
cd whisper.cpp/examples/addon.node
npm install

# Navigate back to root directory
cd ../../

# Compile using cmake-js with specific flags
echo "Compiling whisper.cpp examples..."
npx cmake-js compile --CDWHISPER_CUBLAS="$CUBLAS_FLAG_CMAKE" -T whisper-addon -B Release

# Copy compiled code to the specified directory
echo "Moving compiled whisper.cpp code to bindings directory..."
cp -r build/Release/* ../bindings/whisper/

# Navigate back to the root directory
cd ../

# Navigate to llama.cpp 
cd llama.cpp

echo "Compiling llama.cpp server"
if [[ $(uname -m) == "arm64" ]]; then
    echo "Building llama.ccp for Apple silicon..."
    # TODO server setup will be deprecated by new llama.cpp change
    mkdir -p build_server
    cd build_server
    cmake -DLLAMA_BUILD_SERVER=ON -DLLAMA_METAL=ON ..
    cmake --build . --config Release
else
    echo "Building llama.ccp for non Apple silicon..."
    mkdir -p build_server
    cd build_server
    cmake -DLLAMA_BUILD_SERVER=ON -DLLAMA_CUBLAS=$CUBLAS_FLAG_CMAKE ..
    cmake --build . --config Release
fi

# Navigate back to the root directory
cd ../../

# Prompt the user for whether they want to download models or not
read -p "Do you want to download models? [y/n] " DOWNLOAD_CHOICE


if [[ $DOWNLOAD_CHOICE == "y" || $DOWNLOAD_CHOICE == "Y" ]]; then
    # Create directories to store models if they don't already exist
    echo "Creating directories for models..."
    mkdir -p models/llama
    mkdir -p models/whisper

    # Ask the user for the URLs of the models they want to download, with default values
    read -p "Enter the URL for the llama model (default: https://huggingface.co/TheBloke/Nous-Hermes-13B-GGML/resolve/main/nous-hermes-13b.ggmlv3.q4_K_S.bin): " LLAMA_MODEL_URL
    LLAMA_MODEL_URL=${LLAMA_MODEL_URL:-https://huggingface.co/TheBloke/Nous-Hermes-13B-GGML/resolve/main/nous-hermes-13b.ggmlv3.q4_K_S.bin}

    read -p "Enter the URL for the whisper model (default: https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin): " WHISPER_MODEL_URL
    WHISPER_MODEL_URL=${WHISPER_MODEL_URL:-https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin}

    # Extract the model names from the URLs
    LLAMA_MODEL_NAME=$(basename $LLAMA_MODEL_URL)
    WHISPER_MODEL_NAME=$(basename $WHISPER_MODEL_URL)

    # Downloading model files from user-specified URLs (or default URLs) and save them to the specified directories
    curl -L $LLAMA_MODEL_URL -o models/llama/$LLAMA_MODEL_NAME
    curl -L $WHISPER_MODEL_URL -o models/whisper/$WHISPER_MODEL_NAME

else
    echo "Skipping model download..."
    echo "Please put the models in ./models/{llama/whisper}/"
    echo "And edit whisperModelPath in config.json later."
    WHISPER_MODEL_NAME="ggml-tiny.en.bin"
fi

# Backup existing config.json
echo "Backing up existing config.json..."
pwd
cp config.json config.json.bkp

read -p "Set the audio listner: [s]ample_audio/[r]ecord_audio " AUDIO_LISTENER 
case $AUDIO_LISTENER in
    s|sample_audio) 
        AUDIO_LISTENER_SCRIPT="sample_audio.sh"
        ;;
    *)
        AUDIO_LISTENER_SCRIPT="record_audio.sh"
        ;;
esac

# Update model paths in new config.json
echo "Creating new config.json..."
echo '{
    "whisperModelPath": "'./models/whisper/$WHISPER_MODEL_NAME'",
    "audioListenerScript": "'$AUDIO_LISTENER_SCRIPT'",
    "lora": "",
    "piperModelPath": "./models/piper/en-gb-southern_english_female-low.onnx",
    "voiceActivityDetectionEnabled": true
}' > config.json

# End of script
echo "Script completed successfully!"
