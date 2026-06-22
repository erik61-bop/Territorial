package io.territorial.admin;

import io.territorial.account.Account;
import io.territorial.account.AccountRepository;
import io.territorial.account.LedgerEntry;
import io.territorial.account.LedgerRepository;
import io.territorial.account.WalletService;
import io.territorial.room.RoomManager;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** Manager/admin dashboard API. All endpoints require an authenticated account whose email is in the
 *  configured admin list (TERRITORIAL_ADMIN_EMAILS); otherwise 403. */
@RestController
@RequestMapping("/api/admin")
public class AdminController {
    private final Admins admins;
    private final AccountRepository accounts;
    private final LedgerRepository ledger;
    private final WalletService wallet;
    private final RoomManager rooms;

    public AdminController(Admins admins, AccountRepository accounts, LedgerRepository ledger,
                          WalletService wallet, RoomManager rooms) {
        this.admins = admins; this.accounts = accounts; this.ledger = ledger; this.wallet = wallet; this.rooms = rooms;
    }

    @GetMapping("/overview")
    public ResponseEntity<?> overview(@AuthenticationPrincipal Long me) {
        if (!admins.isAdmin(me)) return forbidden();
        return ResponseEntity.ok(Map.of(
                "accounts", accounts.count(),
                "totalCoins", accounts.totalCoins(),
                "gamesPlayed", accounts.totalGames(),
                "wins", accounts.totalWins(),
                "rooms", rooms.roomCount(),
                "online", rooms.playersOnline()));
    }

    @GetMapping("/players")
    public ResponseEntity<?> players(@AuthenticationPrincipal Long me) {
        if (!admins.isAdmin(me)) return forbidden();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Account a : accounts.findTop100ByOrderByIdDesc()) {
            out.add(Map.of("id", a.getId(), "email", a.getEmail(), "name", a.getDisplayName(),
                    "coins", a.getCoinBalance(), "level", a.getLevel(), "wins", a.getWins(),
                    "games", a.getGamesPlayed(), "admin", admins.isAdmin(a.getEmail()),
                    "created", a.getCreatedAt().toString()));
        }
        return ResponseEntity.ok(out);
    }

    public record GrantReq(@NotNull Long accountId, @NotNull Long amount, String note) {}

    @PostMapping("/grant")
    public ResponseEntity<?> grant(@AuthenticationPrincipal Long me, @Valid @RequestBody GrantReq r) {
        if (!admins.isAdmin(me)) return forbidden();
        long balance = wallet.adjust(r.accountId(), r.amount(), "admin:" + (r.note() == null ? "" : r.note()));
        if (balance < 0) return ResponseEntity.status(404).body(Map.of("error", "no_such_account"));
        return ResponseEntity.ok(Map.of("accountId", r.accountId(), "coins", balance));
    }

    @GetMapping("/ledger")
    public ResponseEntity<?> ledger(@AuthenticationPrincipal Long me, @RequestParam Long accountId) {
        if (!admins.isAdmin(me)) return forbidden();
        List<Map<String, Object>> out = new ArrayList<>();
        for (LedgerEntry e : ledger.findByAccountIdOrderByIdDesc(accountId, PageRequest.of(0, 30))) {
            out.add(Map.of("delta", e.getDelta(), "balanceAfter", e.getBalanceAfter(),
                    "reason", e.getReason().name(), "ref", e.getRef() == null ? "" : e.getRef(),
                    "at", e.getCreatedAt().toString()));
        }
        return ResponseEntity.ok(out);
    }

    private ResponseEntity<?> forbidden() {
        return ResponseEntity.status(403).body(Map.of("error", "not_admin"));
    }
}
