package io.territorial.account;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LedgerRepository extends JpaRepository<LedgerEntry, Long> {
    Page<LedgerEntry> findByAccountIdOrderByIdDesc(Long accountId, Pageable pageable);
}
