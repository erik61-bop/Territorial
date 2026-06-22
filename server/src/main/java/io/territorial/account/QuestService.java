package io.territorial.account;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

/** Reads the player's daily quests and pays out claims (atomic, ledgered). */
@Service
public class QuestService {
    private final AccountRepository accounts;
    private final LedgerRepository ledger;

    public QuestService(AccountRepository accounts, LedgerRepository ledger) {
        this.accounts = accounts;
        this.ledger = ledger;
    }

    /** Today's quests for an account (rolls the day over if needed, persisting the reset). */
    @Transactional
    public List<Map<String, Object>> list(long accountId) {
        Account a = accounts.findByIdForUpdate(accountId).orElse(null);
        if (a == null) return List.of();
        return Quests.view(a);
    }

    /** Claim a completed quest's reward; returns coins granted (0 if not claimable). */
    @Transactional
    public long claim(long accountId, String id) {
        Account a = accounts.findByIdForUpdate(accountId).orElse(null);
        if (a == null) return 0;
        Quests.rollDay(a);
        Quests.Quest q = Quests.byId(id);
        if (q == null || Quests.claimed(a, id) || Quests.progress(a, id) < q.target()) return 0;
        Quests.markClaimed(a, id);
        a.setCoinBalance(a.getCoinBalance() + q.reward());
        ledger.save(new LedgerEntry(accountId, q.reward(), a.getCoinBalance(), LedgerEntry.Reason.QUEST, "quest:" + id));
        return q.reward();
    }
}
