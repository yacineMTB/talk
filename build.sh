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
read -p "Do you want to turn CUBLAS ON for whisper? [y/n] " CUBLAS_CHOICE
if [[ $CUBLAS_CHOICE == "y" || $CUBLAS_CHOICE == "Y" ]]; then
    CUBLAS_FLAG="ON"
else
    CUBLAS_FLAG="OFF"
fi

mkdir -p bindings

# Navigate to whisper.cpp examples directory and install dependencies
echo "Installing npm dependencies for whisper.cpp examples..."
cd whisper.cpp/examples/addon.node
npm install

# Navigate back to root directory
cd ../../

# Compile using cmake-js with specific flags
echo "Compiling whisper.cpp examples..."
npx cmake-js compile --CDWHISPER_CUBLAS="$CUBLAS_FLAG" -T whisper-addon -B Release

# Copy compiled code to the specified directory
echo "Moving compiled whisper.cpp code to bindings directory..."
cp -r build/Release/* ../bindings/whisper/

# Navigate back to the root directory
cd ../

# Navigate to llama.cpp directory
cd llama.cpp

# Compile the llama cpp server
# Prompt the user for whether they want CUBLAS turned on or not
read -p "Do you want to turn CUBLAS ON for llama? [y/n] " CUBLAS_CHOICE
if [[ $CUBLAS_CHOICE == "y" || $CUBLAS_CHOICE == "Y" ]]; then
    echo "Compiling llama.cpp server..."
    make LLAMA_CUBLAS=1 LLAMA_BUILD_SERVER=1
else
    echo "Compiling llama.cpp server..."
    make LLAMA_BUILD_SERVER=1
fi

# Navigate back to the root directory
cd ../

# End of script
echo "Script completed successfully!"