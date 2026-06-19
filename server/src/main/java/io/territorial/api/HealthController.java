package io.territorial.api;

import io.territorial.room.Bank;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class HealthController {

    private final Bank bank;

    public HealthController(Bank bank) {
        this.bank = bank;
    }

    @GetMapping("/api/health")
    public Map<String, Object> health() {
        return Map.of("status", "ok", "service", "territorial-server");
    }

    /** Coin balance for a client token (used by the menu to show the wallet before joining). */
    @GetMapping("/api/wallet")
    public Map<String, Object> wallet(@RequestParam(name = "t", required = false) String token) {
        return Map.of("coins", bank.balance(token));
    }
}
