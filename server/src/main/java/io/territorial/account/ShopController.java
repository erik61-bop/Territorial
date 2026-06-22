package io.territorial.account;

import jakarta.validation.constraints.NotBlank;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** Cosmetics shop API (authenticated). Catalog is public-ish but ownership/equip need the account. */
@RestController
@RequestMapping("/api/shop")
public class ShopController {
    private final ShopService shop;
    private final AccountRepository accounts;

    public ShopController(ShopService shop, AccountRepository accounts) {
        this.shop = shop;
        this.accounts = accounts;
    }

    @GetMapping
    public ResponseEntity<?> catalog(@AuthenticationPrincipal Long accountId) {
        Account a = accountId == null ? null : accounts.findById(accountId).orElse(null);
        var owned = a == null ? java.util.Set.<String>of() : a.ownedSet();
        List<Map<String, Object>> items = new ArrayList<>();
        for (Cosmetics.Item i : Cosmetics.ITEMS)
            items.add(Map.of("id", i.id(), "emoji", i.emoji(), "name", i.name(), "price", i.price(),
                    "owned", owned.contains(i.id())));
        return ResponseEntity.ok(Map.of(
                "items", items,
                "equipped", a != null && a.getEmblem() != null ? a.getEmblem() : "",
                "coins", a == null ? 0 : a.getCoinBalance()));
    }

    public record IdReq(@NotBlank String id) {}

    @PostMapping("/buy")
    public ResponseEntity<?> buy(@AuthenticationPrincipal Long accountId, @RequestBody IdReq r) {
        if (accountId == null) return ResponseEntity.status(401).build();
        ShopService.Result res = shop.buy(accountId, r.id());
        Account a = accounts.findById(accountId).orElse(null);
        return ResponseEntity.ok(Map.of("result", res.name(), "coins", a == null ? 0 : a.getCoinBalance()));
    }

    @PostMapping("/equip")
    public ResponseEntity<?> equip(@AuthenticationPrincipal Long accountId, @RequestBody Map<String, String> body) {
        if (accountId == null) return ResponseEntity.status(401).build();
        ShopService.Result res = shop.equip(accountId, body.get("id"));
        Account a = accounts.findById(accountId).orElse(null);
        return ResponseEntity.ok(Map.of("result", res.name(),
                "equipped", a != null && a.getEmblem() != null ? a.getEmblem() : ""));
    }
}
