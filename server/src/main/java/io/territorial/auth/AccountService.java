package io.territorial.auth;

import io.territorial.account.Account;
import io.territorial.account.AccountRepository;
import io.territorial.account.LedgerEntry;
import io.territorial.account.LedgerRepository;
import io.territorial.account.WalletService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Registration + login. New accounts get the free starting balance, recorded in the ledger. */
@Service
public class AccountService {
    private final AccountRepository accounts;
    private final LedgerRepository ledger;
    private final PasswordEncoder encoder;

    public AccountService(AccountRepository accounts, LedgerRepository ledger, PasswordEncoder encoder) {
        this.accounts = accounts;
        this.ledger = ledger;
        this.encoder = encoder;
    }

    @Transactional
    public Account register(String email, String password, String displayName) {
        String e = email.trim().toLowerCase();
        if (accounts.existsByEmail(e)) throw new IllegalStateException("email_taken");
        String name = displayName == null || displayName.isBlank() ? e.split("@")[0] : displayName.trim();
        if (name.length() > 24) name = name.substring(0, 24);
        Account a = accounts.save(new Account(e, encoder.encode(password), name, WalletService.STARTING_COINS));
        ledger.save(new LedgerEntry(a.getId(), WalletService.STARTING_COINS, WalletService.STARTING_COINS,
                LedgerEntry.Reason.SIGNUP_GRANT, "signup"));
        return a;
    }

    @Transactional(readOnly = true)
    public Account login(String email, String password) {
        Account a = accounts.findByEmail(email.trim().toLowerCase()).orElse(null);
        if (a == null || !encoder.matches(password, a.getPasswordHash())) return null;
        return a;
    }
}
