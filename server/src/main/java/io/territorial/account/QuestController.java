package io.territorial.account;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/** Daily quests API (authenticated). */
@RestController
@RequestMapping("/api/quests")
public class QuestController {
    private final QuestService quests;
    private final AccountRepository accounts;

    public QuestController(QuestService quests, AccountRepository accounts) {
        this.quests = quests;
        this.accounts = accounts;
    }

    @GetMapping
    public ResponseEntity<?> list(@AuthenticationPrincipal Long accountId) {
        if (accountId == null) return ResponseEntity.status(401).build();
        return ResponseEntity.ok(Map.of("quests", quests.list(accountId)));
    }

    @PostMapping("/claim")
    public ResponseEntity<?> claim(@AuthenticationPrincipal Long accountId, @RequestBody Map<String, String> body) {
        if (accountId == null) return ResponseEntity.status(401).build();
        long granted = quests.claim(accountId, body.get("id"));
        Account a = accounts.findById(accountId).orElse(null);
        return ResponseEntity.ok(Map.of("granted", granted, "coins", a == null ? 0 : a.getCoinBalance(),
                "quests", quests.list(accountId)));
    }
}
