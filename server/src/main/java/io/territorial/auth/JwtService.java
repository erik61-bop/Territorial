package io.territorial.auth;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;

/** Signs and verifies stateless JWTs (HS256). Subject = account id; used for both REST and WebSocket. */
@Service
public class JwtService {
    private final SecretKey key;
    private final long ttlMs;

    private static final String DEV_DEFAULT = "dev-only-secret-change-me-please-0123456789abcdef";

    public JwtService(@Value("${territorial.jwt.secret}") String secret,
                      @Value("${territorial.jwt.ttl-hours}") long ttlHours) {
        if (DEV_DEFAULT.equals(secret)) {
            System.err.println("[33m[SECURITY] JWT_SECRET is the built-in dev default — set a unique " +
                    "JWT_SECRET (>=32 chars) before exposing this server. Tokens are forgeable otherwise.[0m");
        }
        if (secret.getBytes(StandardCharsets.UTF_8).length < 32) {
            throw new IllegalStateException("JWT_SECRET must be at least 32 bytes for HS256");
        }
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.ttlMs = ttlHours * 3_600_000L;
    }

    public String issue(long accountId, String displayName) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(Long.toString(accountId))
                .claim("name", displayName)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusMillis(ttlMs)))
                .signWith(key)
                .compact();
    }

    /** Returns the account id, or null if the token is missing/invalid/expired. */
    public Long verify(String token) {
        if (token == null || token.isEmpty()) return null;
        try {
            var claims = Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
            return Long.valueOf(claims.getSubject());
        } catch (Exception e) {
            return null;
        }
    }
}
