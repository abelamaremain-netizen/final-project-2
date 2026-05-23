package et.edu.woldia.coop.service;

import et.edu.woldia.coop.entity.Account;
import et.edu.woldia.coop.entity.Money;
import et.edu.woldia.coop.entity.Transaction;
import et.edu.woldia.coop.repository.AccountRepository;
import et.edu.woldia.coop.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.List;
import java.util.UUID;

/**
 * Service for calculating and applying interest to Non-Regular Saving accounts.
 *
 * Rules:
 * - Interest is applied ONLY to NON_REGULAR_SAVING accounts.
 * - Regular Saving accounts do NOT earn interest.
 * - Loan interest rates are locked at approval time and are NOT affected here.
 * - The interest rate used is always the CURRENT savings interest rate from config
 *   (not the rate stored on the account — that is updated each run).
 * - Formula: Monthly Interest = (End-of-Month Balance × Current Annual Rate) / 12
 * - Duplicate prevention: if interest was already applied this calendar month, skip.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class InterestCalculationService {

    private final AccountRepository accountRepository;
    private final TransactionRepository transactionRepository;
    private final ConfigurationService configurationService;
    private final AuditService auditService;

    private static final String SYSTEM_USER = "SYSTEM";

    /**
     * Calculate monthly interest for a non-regular saving account.
     * Uses the CURRENT config rate, not the rate stored on the account.
     * Formula: (balance × currentAnnualRate) / 12
     */
    public BigDecimal calculateMonthlyInterest(Account account) {
        if (account.getAccountType() != Account.AccountType.NON_REGULAR_SAVING) {
            return BigDecimal.ZERO;
        }
        BigDecimal balance = account.getBalance().getAmount();
        if (balance.compareTo(BigDecimal.ZERO) <= 0) {
            return BigDecimal.ZERO;
        }
        // Always use current config rate so rate changes apply to existing accounts
        BigDecimal currentRate = configurationService.getCurrentConfiguration().getSavingsInterestRate();
        return balance
            .multiply(currentRate)
            .divide(BigDecimal.valueOf(12), 2, RoundingMode.HALF_UP);
    }

    /**
     * Apply monthly interest to a single non-regular saving account.
     * Skips if:
     * - Account is not NON_REGULAR_SAVING
     * - Account is not ACTIVE
     * - Interest was already applied this calendar month
     * - Balance is zero or negative
     */
    @Transactional
    public void applyMonthlyInterest(UUID accountId, String processedBy) {
        log.info("Applying monthly interest to account: {}", accountId);

        Account account = accountRepository.findById(accountId)
            .orElseThrow(() -> new IllegalArgumentException("Account not found: " + accountId));

        // Only non-regular saving accounts earn interest
        if (account.getAccountType() != Account.AccountType.NON_REGULAR_SAVING) {
            log.debug("Skipping interest for {} account: {}", account.getAccountType(), accountId);
            return;
        }

        if (account.getStatus() != Account.AccountStatus.ACTIVE) {
            log.warn("Skipping inactive account: {}", accountId);
            return;
        }

        // Duplicate prevention — skip if interest already applied this calendar month
        YearMonth currentMonth = YearMonth.now();
        if (account.getLastInterestDate() != null) {
            YearMonth lastInterestMonth = YearMonth.from(account.getLastInterestDate());
            if (lastInterestMonth.equals(currentMonth)) {
                log.info("Interest already applied for {} in {}, skipping", accountId, currentMonth);
                return;
            }
        }

        BigDecimal interestAmount = calculateMonthlyInterest(account);
        if (interestAmount.compareTo(BigDecimal.ZERO) <= 0) {
            log.info("No interest to apply for account: {}", accountId);
            return;
        }

        // Update the account's stored interest rate to match current config
        // (so the rate shown on the account is always current)
        BigDecimal currentRate = configurationService.getCurrentConfiguration().getSavingsInterestRate();
        account.setInterestRate(currentRate);

        Money balanceBefore = account.getBalance();
        if (balanceBefore.getCurrency() == null) {
            balanceBefore = new Money(balanceBefore.getAmount(), "ETB");
        }
        Money balanceAfter = new Money(
            balanceBefore.getAmount().add(interestAmount),
            "ETB"
        );

        account.setBalance(balanceAfter);
        account.setLastInterestDate(LocalDate.now());
        accountRepository.save(account);

        // Create transaction record
        Transaction transaction = new Transaction();
        transaction.setAccountId(accountId);
        transaction.setTransactionType(Transaction.TransactionType.INTEREST_CREDIT);
        transaction.setAmount(new Money(interestAmount, "ETB"));
        transaction.setBalanceBefore(balanceBefore);
        transaction.setBalanceAfter(balanceAfter);
        transaction.setTimestamp(LocalDateTime.now());
        transaction.setProcessedBy(processedBy);
        transaction.setNotes(String.format("Monthly interest credit — rate: %.4f%%, balance: ETB %s",
            currentRate.multiply(BigDecimal.valueOf(100)), balanceBefore.getAmount().setScale(2, RoundingMode.HALF_UP)));

        transactionRepository.save(transaction);

        log.info("Interest applied to account {}: ETB {} at rate {}%, new balance: ETB {}",
            accountId, interestAmount, currentRate.multiply(BigDecimal.valueOf(100)).setScale(2, RoundingMode.HALF_UP),
            balanceAfter.getAmount());

        try {
            auditService.logAction(null, processedBy, "INTEREST_APPLIED", "ACCOUNT", accountId,
                String.format("Monthly interest of ETB %s applied at rate %.4f%%. New balance: ETB %s",
                    interestAmount, currentRate.doubleValue() * 100, balanceAfter.getAmount()));
        } catch (Exception ignored) {}
    }

    /**
     * Apply monthly interest to all active non-regular saving accounts.
     * Called by the scheduler and can also be triggered manually.
     */
    @Transactional
    public void applyMonthlyInterestForAllAccounts() {
        log.info("Starting monthly interest calculation for all Non-Regular Saving accounts");

        List<Account> accounts = accountRepository.findByStatusAndAccountType(
            Account.AccountStatus.ACTIVE, Account.AccountType.NON_REGULAR_SAVING);

        int successCount = 0;
        int skippedCount = 0;
        int failureCount = 0;

        for (Account account : accounts) {
            try {
                YearMonth currentMonth = YearMonth.now();
                if (account.getLastInterestDate() != null &&
                    YearMonth.from(account.getLastInterestDate()).equals(currentMonth)) {
                    skippedCount++;
                    continue;
                }
                applyMonthlyInterest(account.getId(), SYSTEM_USER);
                successCount++;
            } catch (Exception e) {
                log.error("Failed to apply interest to account {}: {}", account.getId(), e.getMessage());
                failureCount++;
            }
        }

        log.info("Monthly interest calculation completed. Applied: {}, Skipped (already done): {}, Failed: {}",
            successCount, skippedCount, failureCount);
    }

    /**
     * Scheduled job — runs at 23:00 on the last day of each month.
     */
    @Scheduled(cron = "0 0 23 L * *")
    @Transactional
    public void scheduledMonthlyInterestCalculation() {
        log.info("Scheduled monthly interest calculation triggered");
        applyMonthlyInterestForAllAccounts();
    }
}
