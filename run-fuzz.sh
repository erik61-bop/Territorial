#!/usr/bin/env bash
# Robustness harness: many randomized games with malformed/chaotic input; asserts invariants,
# determinism, and termination. Pure sim (no Spring); needs a JDK (17+).
set -euo pipefail
cd "$(dirname "$0")/server"
rm -rf out && mkdir -p out
javac -d out $(find src/main/java/io/territorial/sim -name '*.java')
java -cp out io.territorial.sim.FuzzMain
