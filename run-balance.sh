#!/usr/bin/env bash
# Compile the pure Java sim and run the bot-vs-bot balance proof.
# No Gradle/Spring needed for this step — just a JDK (Java 17+).
set -euo pipefail
cd "$(dirname "$0")/server"
rm -rf out && mkdir -p out
# Only the pure sim package (no Spring deps); the server is built with Maven.
javac -d out $(find src/main/java/io/territorial/sim -name '*.java')
java -cp out io.territorial.sim.BalanceMain
