package io.territorial.account;

import jakarta.persistence.*;
import java.time.Instant;

/** Append-only audit trail of every coin movement (money-ready double-entry). One row per change;
 *  {@code delta} is +credit / -debit and {@code balanceAfter} is the resulting balance. */
@Entity
@Table(name = "ledger_entries", indexes = @Index(name = "idx_ledger_account", columnList = "accountId"))
public class LedgerEntry {
    public enum Reason { SIGNUP_GRANT, PRIZE_ANTE, PRIZE_PAYOUT, PRIZE_REFUND, MATCH_REWARD, DAILY_BONUS, COSMETIC, QUEST, DEPOSIT, WITHDRAWAL, ADJUSTMENT }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long accountId;

    @Column(nullable = false)
    private long delta;

    @Column(nullable = false)
    private long balanceAfter;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private Reason reason;

    @Column(length = 64)
    private String ref;     // e.g. "room:42" — what this movement was for

    @Column(nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    protected LedgerEntry() {}

    public LedgerEntry(Long accountId, long delta, long balanceAfter, Reason reason, String ref) {
        this.accountId = accountId;
        this.delta = delta;
        this.balanceAfter = balanceAfter;
        this.reason = reason;
        this.ref = ref;
    }

    public Long getId() { return id; }
    public Long getAccountId() { return accountId; }
    public long getDelta() { return delta; }
    public long getBalanceAfter() { return balanceAfter; }
    public Reason getReason() { return reason; }
    public String getRef() { return ref; }
    public Instant getCreatedAt() { return createdAt; }
}
