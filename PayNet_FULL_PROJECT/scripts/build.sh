#!/bin/sh
# Compiles all PayNet sources into bin/.
cd "$(dirname "$0")/.." || exit 1
mkdir -p bin
javac -d bin $(find src -name '*.java') || exit 1
echo "Build OK -> bin/"
