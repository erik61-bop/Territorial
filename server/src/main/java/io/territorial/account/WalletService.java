package io.territorial.account;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** All coin movements go through here so the balance and the audit ledger stay consistent and atomic.
 *  Row-locks the account during a change to prevent lost updates under concurrent prize settlements. */
@Service
public class WalletService {
    public static final long STARTING_COINS = 1000;

    private final AccountRepository accounts;
    private final LedgerRepository ledger;

    public WalletService(AccountRepository accounts, LedgerRepository ledger) {
        this.accounts = accounts;
        this.ledger = ledger;
    }

    @Transactional(readOnly = true)
    public long balance(long accountId) {
        return accounts.findById(accountId).map(Account::getCoinBalance).orElse(0L);
    }

    /** Atomically take {@code amount} if affordable; false (no change) if too poor or unknown account. */
    @Transactional
    public boolean tryDebit(long accountId, long amount, LedgerEntry.Reason reason, String ref) {
        if (amount <= 0) return false;
        Account a = accounts.findByIdForUpdate(accountId).orElse(null);
        if (a == null || a.getCoinBalance() < amount) return false;
        a.setCoinBalance(a.getCoinBalance() - amount);
        ledger.save(new LedgerEntry(accountId, -amount, a.getCoinBalance(), reason, ref));
        return true;
    }

    /** Atomically add {@code amount} (winnings/refund) and record it. */
    @Transactional
    public void credit(long accountId, long amount, LedgerEntry.Reason reason, String ref) {
        if (amount <= 0) return;
        Account a = accounts.findByIdForUpdate(accountId).orElse(null);
        if (a == null) return;
        a.setCoinBalance(a.getCoinBalance() + amount);
        ledger.save(new LedgerEntry(accountId, amount, a.getCoinBalance(), reason, ref));
    }

    /** Admin manual adjustment (+grant / -deduct), clamped at zero. Returns the new balance, or -1 if
     *  the account is unknown. Recorded as an ADJUSTMENT ledger entry. */
    @Transactional
    public long adjust(long accountId, long delta, String ref) {
        Account a = accounts.findByIdForUpdate(accountId).orElse(null);
        if (a == null) return -1;
        long next = Math.max(0, a.getCoinBalance() + delta);
        long applied = next - a.getCoinBalance();
        a.setCoinBalance(next);
        ledger.save(new LedgerEntry(accountId, applied, next, LedgerEntry.Reason.ADJUSTMENT, ref));
        return next;
    }
}
