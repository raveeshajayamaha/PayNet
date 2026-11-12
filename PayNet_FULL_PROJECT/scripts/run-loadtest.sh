#!/bin/sh
# Compiles PayNet into bin/ and runs com.paynet.test.LoadTest from the project root.
cd "$(dirname "$0")/.." || exit 1
mkdir -p bin
javac -d bin $(find src -name '*.java') || exit 1
java -cp bin com.paynet.test.LoadTest "$@"
