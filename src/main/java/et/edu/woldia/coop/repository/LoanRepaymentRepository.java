package et.edu.woldia.coop.repository;

import et.edu.woldia.coop.entity.LoanRepayment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * Repository for LoanRepayment entity.
 */
@Repository
public interface LoanRepaymentRepository extends JpaRepository<LoanRepayment, UUID> {
    
    /**
     * Find repayments for a loan
     */
    List<LoanRepayment> findByLoanIdOrderByPaymentDateDesc(UUID loanId);

    /**
     * Count repayments for a loan in a given month/year
     */
    @Query("SELECT COUNT(r) FROM LoanRepayment r WHERE r.loanId = :loanId AND YEAR(r.paymentDate) = :year AND MONTH(r.paymentDate) = :month")
    long countByLoanIdAndMonth(UUID loanId, int year, int month);

    /**
     * Count repayments for a loan on a specific date (same-day duplicate detection)
     */
    @Query("SELECT COUNT(r) FROM LoanRepayment r WHERE r.loanId = :loanId AND r.paymentDate = :date")
    long countByLoanIdAndPaymentDate(UUID loanId, java.time.LocalDate date);

    /**
     * Sum all repayment amounts
     */
    @Query("SELECT COALESCE(SUM(r.paymentAmount.amount), 0) FROM LoanRepayment r")
    BigDecimal getTotalRepayments();

    /**
     * Sum all interest paid across all repayments
     */
    @Query("SELECT COALESCE(SUM(r.interestPaid.amount), 0) FROM LoanRepayment r")
    BigDecimal getTotalInterestPaid();

    /**
     * Find loan IDs for active loans that have NO repayment recorded in the given month/year.
     * Used for missed repayment detection.
     */
    @Query(value =
        "SELECT l.id FROM loans l " +
        "WHERE l.status IN ('ACTIVE', 'DISBURSED') " +
        "AND l.first_payment_date IS NOT NULL " +
        "AND l.first_payment_date <= :monthEnd " +
        "AND l.id NOT IN (" +
        "  SELECT DISTINCT r.loan_id FROM loan_repayments r " +
        "  WHERE EXTRACT(YEAR FROM r.payment_date) = :year " +
        "  AND EXTRACT(MONTH FROM r.payment_date) = :month" +
        ")",
        nativeQuery = true)
    List<UUID> findLoanIdsWithNoRepaymentInMonth(
        @Param("year") int year,
        @Param("month") int month,
        @Param("monthEnd") java.time.LocalDate monthEnd);
}
