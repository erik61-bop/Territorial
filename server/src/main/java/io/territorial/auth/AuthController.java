package io.territorial.auth;

import io.territorial.account.Account;
import io.territorial.account.AccountRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api")
public class AuthController {
    private final AccountService accountService;
    private final JwtService jwt;
    private final AccountRepository accounts;
    private final io.territorial.account.StatsService stats;
    private final io.territorial.admin.Admins admins;

    public AuthController(AccountService accountService, JwtService jwt, AccountRepository accounts,
                         io.territorial.account.StatsService stats, io.territorial.admin.Admins admins) {
        this.accountService = accountService;
        this.jwt = jwt;
        this.accounts = accounts;
        this.stats = stats;
        this.admins = admins;
    }

    public record RegisterReq(@Email @NotBlank String email, @Size(min = 6, max = 100) String password, String displayName) {}
    public record LoginReq(@NotBlank String email, @NotBlank String password) {}

    @PostMapping("/auth/register")
    public ResponseEntity<?> register(@Valid @RequestBody RegisterReq r) {
        try {
            return ResponseEntity.ok(tokenBody(accountService.register(r.email(), r.password(), r.displayName())));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(409).body(Map.of("error", "email_taken"));
        }
    }

    @PostMapping("/auth/login")
    public ResponseEntity<?> login(@Valid @RequestBody LoginReq r) {
        Account a = accountService.login(r.email(), r.password());
        if (a == null) return ResponseEntity.status(401).body(Map.of("error", "bad_credentials"));
        return ResponseEntity.ok(tokenBody(a));
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(@AuthenticationPrincipal Long accountId) {
        Account a = accountId == null ? null : accounts.findById(accountId).orElse(null);
        if (a == null) return ResponseEntity.status(404).build();
        return ResponseEntity.ok(profile(a));
    }

    /** Claim the once-a-day login bonus. Returns coins granted (0 if already claimed) + new balance. */
    @PostMapping("/daily")
    public ResponseEntity<?> daily(@AuthenticationPrincipal Long accountId) {
        if (accountId == null) return ResponseEntity.status(401).build();
        long granted = stats.claimDaily(accountId);
        Account a = accounts.findById(accountId).orElse(null);
        if (a == null) return ResponseEntity.status(404).build();
        return ResponseEntity.ok(Map.of("granted", granted, "coins", a.getCoinBalance()));
    }

    /** Public leaderboard: top players by wins, then XP. */
    @GetMapping("/leaderboard")
    public java.util.List<Map<String, Object>> leaderboard() {
        java.util.List<Map<String, Object>> out = new java.util.ArrayList<>();
        for (Account a : accounts.findTop20ByOrderByWinsDescXpDesc())
            out.add(Map.of("name", a.getDisplayName(), "wins", a.getWins(), "level", a.getLevel(), "xp", a.getXp(),
                    "emblem", a.getEmblem() == null ? "" : a.getEmblem()));
        return out;
    }

    private Map<String, Object> tokenBody(Account a) {
        return Map.of("token", jwt.issue(a.getId(), a.getDisplayName()), "account", profile(a));
    }

    private Map<String, Object> profile(Account a) {
        Map<String, Object> m = new java.util.HashMap<>();
        m.put("id", a.getId()); m.put("email", a.getEmail()); m.put("displayName", a.getDisplayName());
        m.put("coins", a.getCoinBalance()); m.put("xp", a.getXp()); m.put("level", a.getLevel());
        m.put("wins", a.getWins()); m.put("gamesPlayed", a.getGamesPlayed());
        m.put("nextLevelXp", Account.xpForLevel(a.getLevel() + 1));
        m.put("admin", admins.isAdmin(a.getEmail()));
        m.put("emblem", a.getEmblem() == null ? "" : a.getEmblem());
        return m;
    }
}
