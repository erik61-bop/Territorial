package io.territorial.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Per-IP rate limit on the auth endpoints to blunt brute-force and account-spam. Fixed window/minute. */
@Component
@Order(1)
public class AuthRateLimitFilter extends OncePerRequestFilter {
    private static final int MAX_PER_MINUTE = 20;
    private final Map<String, long[]> hits = new ConcurrentHashMap<>();   // ip -> {minuteEpoch, count}

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        if (!req.getRequestURI().startsWith("/api/auth/")) { chain.doFilter(req, res); return; }
        long minute = System.currentTimeMillis() / 60_000;
        long[] w = hits.computeIfAbsent(clientIp(req), k -> new long[]{minute, 0});
        synchronized (w) {
            if (w[0] != minute) { w[0] = minute; w[1] = 0; }
            if (++w[1] > MAX_PER_MINUTE) {
                res.setStatus(429);
                res.setContentType("application/json");
                res.getWriter().write("{\"error\":\"rate_limited\"}");
                return;
            }
        }
        if (hits.size() > 50_000) hits.clear();   // crude cap so the map can't grow unbounded
        chain.doFilter(req, res);
    }

    private static String clientIp(HttpServletRequest req) {
        String xff = req.getHeader("X-Forwarded-For");   // honour a reverse proxy in production
        if (xff != null && !xff.isBlank()) return xff.split(",")[0].trim();
        return req.getRemoteAddr();
    }
}
