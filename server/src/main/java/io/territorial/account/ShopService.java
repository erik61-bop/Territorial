package io.territorial.account;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Cosmetics shop: buy an emblem (coin sink, atomic + ledgered) and equip one you own. */
@Service
public class ShopService {
    public enum Result { OK, ALREADY_OWNED, TOO_POOR, NO_SUCH_ITEM, NO_ACCOUNT, NOT_OWNED }

    private final AccountRepository accounts;
    private final LedgerRepository ledger;

    public ShopService(AccountRepository accounts, LedgerRepository ledger) {
        this.accounts = accounts;
        this.ledger = ledger;
    }

    @Transactional
    public Result buy(long accountId, String itemId) {
        Cosmetics.Item item = Cosmetics.byId(itemId);
        if (item == null) return Result.NO_SUCH_ITEM;
        Account a = accounts.findByIdForUpdate(accountId).orElse(null);
        if (a == null) return Result.NO_ACCOUNT;
        if (a.owns(itemId)) return Result.ALREADY_OWNED;
        if (a.getCoinBalance() < item.price()) return Result.TOO_POOR;
        a.setCoinBalance(a.getCoinBalance() - item.price());
        a.addOwned(itemId);
        ledger.save(new LedgerEntry(accountId, -item.price(), a.getCoinBalance(),
                LedgerEntry.Reason.COSMETIC, "buy:" + itemId));
        return Result.OK;
    }

    /** Equip an owned emblem, or pass null/blank to clear it. */
    @Transactional
    public Result equip(long accountId, String itemId) {
        Account a = accounts.findByIdForUpdate(accountId).orElse(null);
        if (a == null) return Result.NO_ACCOUNT;
        if (itemId == null || itemId.isBlank()) { a.setEmblem(null); return Result.OK; }
        if (Cosmetics.byId(itemId) == null) return Result.NO_SUCH_ITEM;
        if (!a.owns(itemId)) return Result.NOT_OWNED;
        a.setEmblem(Cosmetics.emoji(itemId));
        return Result.OK;
    }
}
