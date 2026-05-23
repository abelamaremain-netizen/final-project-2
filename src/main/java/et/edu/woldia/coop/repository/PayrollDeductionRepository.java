package et.edu.woldia.coop.repository;

import et.edu.woldia.coop.entity.PayrollDeduction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.YearMonth;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Repository for PayrollDeduction entity.
 * NOTE: deductionMonth is YearMonth with autoApply converter — pass YearMonth directly in queries.
 */
@Repository
public interface PayrollDeductionRepository extends JpaRepository<PayrollDeduction, UUID> {

    List<PayrollDeduction> findByDeductionMonth(YearMonth month);

    Optional<PayrollDeduction> findByMemberIdAndDeductionMonth(UUID memberId, YearMonth month);

    List<PayrollDeduction> findByDeductionMonthAndStatus(YearMonth month, PayrollDeduction.DeductionStatus status);

    long countByDeductionMonthAndStatus(YearMonth month, PayrollDeduction.DeductionStatus status);

    boolean existsByDeductionMonth(YearMonth month);

    @Query("SELECT pd FROM PayrollDeduction pd WHERE pd.deductionMonth = :month AND pd.status = 'FAILED'")
    List<PayrollDeduction> findFailedDeductions(@Param("month") YearMonth month);

    List<PayrollDeduction> findByMemberIdOrderByDeductionMonthDesc(UUID memberId);

    /**
     * Find member IDs that have a deduction list entry for the given month
     * but no CONFIRMED record — i.e. missed their deposit.
     */
    @Query("SELECT pd.memberId FROM PayrollDeduction pd " +
           "WHERE pd.deductionMonth = :month AND pd.status <> 'CONFIRMED'")
    List<UUID> findMemberIdsWithMissedDeposit(@Param("month") YearMonth month);

    /**
     * Find all PENDING deductions for a given month (not yet confirmed or failed).
     */
    @Query("SELECT pd FROM PayrollDeduction pd " +
           "WHERE pd.deductionMonth = :month AND pd.status = 'PENDING'")
    List<PayrollDeduction> findPendingDeductions(@Param("month") YearMonth month);

    /**
     * Paginated deduction list with optional status and memberType filters.
     * memberType is resolved via a JOIN to the Member entity.
     */
    @Query("SELECT pd FROM PayrollDeduction pd " +
           "JOIN Member m ON m.id = pd.memberId " +
           "WHERE pd.deductionMonth = :month " +
           "AND (:status IS NULL OR pd.status = :status) " +
           "AND (:memberType IS NULL OR m.memberType = :memberType)")
    org.springframework.data.domain.Page<PayrollDeduction> findByMonthWithFilters(
        @Param("month") YearMonth month,
        @Param("status") PayrollDeduction.DeductionStatus status,
        @Param("memberType") String memberType,
        org.springframework.data.domain.Pageable pageable);

    /**
     * Find all deduction IDs matching a memberType filter for a given month (used for Select All).
     */
    @Query("SELECT pd.id FROM PayrollDeduction pd " +
           "JOIN Member m ON m.id = pd.memberId " +
           "WHERE pd.deductionMonth = :month " +
           "AND (:status IS NULL OR pd.status = :status) " +
           "AND (:memberType IS NULL OR m.memberType = :memberType)")
    List<java.util.UUID> findMemberIdsByMonthWithFilters(
        @Param("month") YearMonth month,
        @Param("status") PayrollDeduction.DeductionStatus status,
        @Param("memberType") String memberType);
}
