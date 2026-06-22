package io.territorial.account;

import jakarta.persistence.*;
import java.time.Instant;

/** A player account. Coins live here as a fast-read balance; every change is also recorded in the
 *  {@link LedgerEntry} audit trail (money-ready double-entry). Identity for the coin economy. */
@Entity
@Table(name = "accounts", indexes = @Index(name = "idx_account_email", columnList = "email", unique = true))
public class Account {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 190)
    private String email;

    @Column(nullable = false)
    private String passwordHash;

    @Column(nullable = false, length = 24)
    private String displayName;

    @Column(nullable = false)
    private long coinBalance;

    // Progression & competition stats.
    @Column(nullable = false)
    private long xp = 0;
    @Column(nullable = false)
    private int wins = 0;
    @Column(nullable = false)
    private int gamesPlayed = 0;
    private Instant lastDailyAt;   // last daily-bonus claim (null = never)

    @Column(nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    protected Account() {}

    public Account(String email, String passwordHash, String displayName, long startingCoins) {
        this.email = email;
        this.passwordHash = passwordHash;
        this.displayName = displayName;
        this.coinBalance = startingCoins;
    }

    public Long getId() { return id; }
    public String getEmail() { return email; }
    public String getPasswordHash() { return passwordHash; }
    public String getDisplayName() { return displayName; }
    public void setDisplayName(String n) { this.displayName = n; }
    public long getCoinBalance() { return coinBalance; }
    public void setCoinBalance(long c) { this.coinBalance = c; }
    public long getXp() { return xp; }
    public void setXp(long xp) { this.xp = xp; }
    public int getWins() { return wins; }
    public void setWins(int wins) { this.wins = wins; }
    public int getGamesPlayed() { return gamesPlayed; }
    public void setGamesPlayed(int g) { this.gamesPlayed = g; }
    public Instant getLastDailyAt() { return lastDailyAt; }
    public void setLastDailyAt(Instant t) { this.lastDailyAt = t; }
    public Instant getCreatedAt() { return createdAt; }

    /** Level from XP: each level needs progressively more (level n at 100*n*(n-1)/2 ... simplified). */
    public int getLevel() { return level(xp); }
    public static int level(long xp) { return (int) Math.floor(Math.sqrt(xp / 100.0)) + 1; }
    /** Total XP required to reach a given level (inverse of {@link #level}). */
    public static long xpForLevel(int lvl) { long n = lvl - 1; return n * n * 100L; }
}
