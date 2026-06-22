package io.territorial.admin;

import io.territorial.account.Account;
import io.territorial.account.AccountRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

/** Who is an admin/manager. Configured by email via TERRITORIAL_ADMIN_EMAILS (comma-separated). */
@Component
public class Admins {
    private final Set<String> emails;
    private final AccountRepository accounts;

    public Admins(@Value("${territorial.admin-emails:}") String csv, AccountRepository accounts) {
        this.accounts = accounts;
        this.emails = Arrays.stream(csv.split(","))
                .map(s -> s.trim().toLowerCase())
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toSet());
    }

    public boolean isAdmin(String email) {
        return email != null && emails.contains(email.toLowerCase());
    }

    public boolean isAdmin(Long accountId) {
        if (accountId == null) return false;
        return accounts.findById(accountId).map(a -> isAdmin(a.getEmail())).orElse(false);
    }
}
