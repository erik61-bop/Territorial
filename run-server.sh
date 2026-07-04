#!/usr/bin/env bash
# Run the game server for local/offline dev: file-based H2 (accounts survive restarts) on :8080,
# serving the exported web client from client/dist. Build the web bundle first:
#   cd client && npx expo export -p web
# Requires JAVA_HOME (or `java` on PATH) to be a JDK 21. Add `-o` support via: MVN_FLAGS=-o ./run-server.sh
set -euo pipefail
cd "$(dirname "$0")/server"

DB="${DB:-jdbc:h2:file:./data/territorial;MODE=PostgreSQL;DB_CLOSE_DELAY=-1}"   # use jdbc:h2:mem:... for a throwaway DB
echo "Territorial server → http://localhost:${PORT:-8080}"
echo "DB: $DB   (accounts persist in server/data/)"

exec mvn -q ${MVN_FLAGS:-} spring-boot:run -Dspring-boot.run.arguments="\
--spring.datasource.url=$DB \
--spring.datasource.driver-class-name=org.h2.Driver \
--spring.datasource.username=sa --spring.datasource.password= \
--spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect"
