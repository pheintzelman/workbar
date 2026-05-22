#!/bin/bash

# Exit on error
set -e

echo "Building extension..."
npm run build

echo "Packaging extension into workbar.zip..."
# Remove old zip if it exists
rm -f workbar.zip

# Create zip from dist folder
# -j junk paths (store just the name of the file) - but we want to keep the structure in dist
# so we cd into dist and zip everything from there.
(cd dist && zip -r ../workbar.zip .)

echo "Package created: workbar.zip"
