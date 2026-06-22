package io.territorial.account;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;

/** Progression + retention: end-of-match rewards (XP, coins, wins) and the daily login bonus. All
 *  coin movements are recorded in the ledger; account-row locked so updates are atomic. */
@Service
public class StatsService {
    public static final long DAILY_BONUS = 250;
    private static final Duration DAILY_WINDOW = Duration.ofHours(20);  // forgiving "once a day"

    private final AccountRepository accounts;
    private final LedgerRepository ledger;

    public StatsService(AccountRepository accounts, LedgerRepository ledger) {
        this.accounts = accounts;
        this.ledger = ledger;
    }

    /** Record a finished match for one human: +XP (scaled by placement), a coin reward, and a win. */
    @Transactional
    public void recordResult(long accountId, boolean won, int place, int totalPlayers) {
        Account a = accounts.findByIdForUpdate(accountId).orElse(null);
        if (a == null) return;
        a.setGamesPlayed(a.getGamesPlayed() + 1);
        long xpGain = 25 + (won ? 150 : (place > 0 ? Math.max(0, (long) (totalPlayers - place + 1) * 10) : 0));
        a.setXp(a.getXp() + xpGain);
        if (won) a.setWins(a.getWins() + 1);
        long coinGain = won ? 50 : (place > 0 && place <= Math.max(1, totalPlayers / 2)) ? 15 : 5;
        a.setCoinBalance(a.getCoinBalance() + coinGain);
        ledger.save(new LedgerEntry(accountId, coinGain, a.getCoinBalance(), LedgerEntry.Reason.MATCH_REWARD, "match"));
    }

    /** Grant the daily bonus if eligible; returns coins granted (0 if already claimed today). */
    @Transactional
    public long claimDaily(long accountId) {
        Account a = accounts.findByIdForUpdate(accountId).orElse(null);
        if (a == null) return 0;
        Instant now = Instant.now();
        if (a.getLastDailyAt() != null && a.getLastDailyAt().isAfter(now.minus(DAILY_WINDOW))) return 0;
        a.setLastDailyAt(now);
        a.setCoinBalance(a.getCoinBalance() + DAILY_BONUS);
        ledger.save(new LedgerEntry(accountId, DAILY_BONUS, a.getCoinBalance(), LedgerEntry.Reason.DAILY_BONUS, "daily"));
        return DAILY_BONUS;
    }
}
