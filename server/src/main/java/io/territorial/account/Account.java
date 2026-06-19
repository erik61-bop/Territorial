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
    public Instant getCreatedAt() { return createdAt; }
}
