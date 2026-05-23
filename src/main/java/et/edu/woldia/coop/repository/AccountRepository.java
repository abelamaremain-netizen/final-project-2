package et.edu.woldia.coop.repository;

import et.edu.woldia.coop.entity.Account;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Repository for Account entity.
 */
@Repository
public interface AccountRepository extends JpaRepository<Account, UUID> {

    /**
     * Find accounts by member ID
     */
    List<Account> findByMemberId(UUID memberId);

    /**
     * Find account by member ID and account type
     */
    Optional<Account> findByMemberIdAndAccountType(UUID memberId, Account.AccountType accountType);

    /**
     * Check if account exists for member and type
     */
    boolean existsByMemberIdAndAccountType(UUID memberId, Account.AccountType accountType);

    /**
     * Find account by exact code
     */
    Optional<Account> findByCode(String code);

    /**
     * Find accounts by code prefix (case-insensitive) - for smart search
     */
    @Query("SELECT a FROM Account a WHERE LOWER(a.code) LIKE LOWER(CONCAT(:prefix, '%'))")
    List<Account> findByCodePrefix(@Param("prefix") String prefix);

    /**
     * Count accounts by status
     */
    @Query("SELECT COUNT(a) FROM Account a WHERE a.status = :status")
    long countByStatus(Account.AccountStatus status);

    /**
     * Find all active accounts
     */
    List<Account> findByStatus(Account.AccountStatus status);

    /**
     * Find active accounts by type (used for interest calculation)
     */
    List<Account> findByStatusAndAccountType(Account.AccountStatus status, Account.AccountType accountType);

    /**
     * Sum balances by account type for active accounts
     */
    @Query("SELECT COALESCE(SUM(a.balance.amount), 0) FROM Account a " +
            "WHERE a.status = 'ACTIVE' AND a.accountType = :type")
    BigDecimal getTotalBalanceByType(@Param("type") Account.AccountType type);
}