# syntax=docker/dockerfile:1
# Multi-stage build: web client (Expo export) + server (Spring Boot jar) -> small JRE runtime image.

# 1) Build the web client into /client/dist
FROM node:20-bookworm-slim AS client
WORKDIR /client
COPY client/package.json client/package-lock.json* ./
RUN npm ci
COPY client/ ./
RUN npx expo export --platform web --output-dir dist

# 2) Build the server jar
FROM maven:3.9-eclipse-temurin-21 AS server
WORKDIR /build
COPY server/pom.xml ./
RUN mvn -q -B -DskipTests dependency:go-offline
COPY server/src ./src
RUN mvn -q -B -DskipTests package

# 3) Runtime: JRE + the jar + the exported web client
FROM eclipse-temurin:21-jre
WORKDIR /app
RUN useradd -r -u 1001 app
COPY --from=server /build/target/*.jar /app/app.jar
COPY --from=client /client/dist /app/web
ENV TERRITORIAL_WEBDIR=file:/app/web/ \
    JAVA_OPTS="-XX:MaxRAMPercentage=75"
EXPOSE 8080
USER app
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar /app/app.jar --territorial.webDir=$TERRITORIAL_WEBDIR"]
