package io.territorial.room;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Component;

import java.io.File;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Player coin wallet for prize (wager) rooms. Balances are keyed by the client's reconnect token and
 * persisted to a small JSON file so they survive restarts. A token seen for the first time is granted
 * a free starting balance. No accounts/passwords — the token (localStorage) is the identity.
 */
@Component
public class Bank {
    public static final long STARTING_COINS = 1000;
    private static final File FILE = new File("territorial-wallet.json");

    private final ObjectMapper json;
    private final Map<String, Long> balances = new ConcurrentHashMap<>();

    public Bank(ObjectMapper json) {
        this.json = json;
        load();
    }

    /** Current balance, granting the free starting balance the first time a token is seen. */
    public long balance(String token) {
        if (token == null) return 0;
        return balances.computeIfAbsent(token, t -> STARTING_COINS);
    }

    /** Atomically take {@code amount} if affordable; returns false (no change) if too poor. */
    public synchronized boolean tryDebit(String token, long amount) {
        if (token == null || amount <= 0) return false;
        long b = balance(token);
        if (b < amount) return false;
        balances.put(token, b - amount);
        save();
        return true;
    }

    /** Add winnings to a token's balance. */
    public synchronized void credit(String token, long amount) {
        if (token == null || amount <= 0) return;
        balances.put(token, balance(token) + amount);
        save();
    }

    @SuppressWarnings("unchecked")
    private void load() {
        try {
            if (FILE.exists()) {
                Map<String, Number> m = json.readValue(FILE, Map.class);
                m.forEach((k, v) -> balances.put(k, v.longValue()));
            }
        } catch (Exception e) {
            System.err.println("wallet load failed: " + e);
        }
    }

    @PreDestroy
    public synchronized void save() {
        try {
            json.writeValue(FILE, balances);
        } catch (Exception e) {
            System.err.println("wallet save failed: " + e);
        }
    }
}
