package et.edu.woldia.coop.repository;

import et.edu.woldia.coop.entity.LoanApplication;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

/**
 * Repository for LoanApplication entity.
 */
@Repository
public interface LoanApplicationRepository extends JpaRepository<LoanApplication, UUID> {
    
    /**
     * Find applications by member
     */
    List<LoanApplication> findByMemberIdOrderBySubmissionDateDesc(UUID memberId);
    
    /**
     * Find applications by status
     */
    List<LoanApplication> findByStatusOrderBySubmissionDateAsc(LoanApplication.ApplicationStatus status);
    
    /**
     * Find pending applications in queue order
     */
    @Query("SELECT la FROM LoanApplication la WHERE la.status IN ('PENDING', 'UNDER_REVIEW') ORDER BY la.submissionDate ASC")
    List<LoanApplication> findPendingApplicationsInQueue();

    /**
     * Find pending applications in queue order (sorted by queue_position for FIFO enforcement)
     * Includes SKIPPED applications so they remain visible in the queue list (Requirement 7.2)
     */
    @Query("SELECT la FROM LoanApplication la WHERE la.status IN ('PENDING', 'UNDER_REVIEW', 'SKIP_REQUESTED', 'SKIPPED') ORDER BY la.queuePosition ASC NULLS LAST")
    List<LoanApplication> findActiveQueueOrderedByPosition();

    /**
     * Returns true if any application with queue_position < given position
     * is in a non-resolved status (PENDING, UNDER_REVIEW, SKIP_REQUESTED).
     * Used to enforce FIFO approval order.
     */
    @Query("SELECT COUNT(la) > 0 FROM LoanApplication la " +
           "WHERE la.queuePosition < :pos " +
           "AND la.status IN ('PENDING', 'UNDER_REVIEW', 'SKIP_REQUESTED')")
    boolean existsBlockingApplicationForApproval(@Param("pos") int queuePosition);

    /**
     * Returns true if any APPROVED loan (awaiting disbursement, not skipped)
     * has a linked application with queue_position < given position.
     * Used to enforce FIFO disbursement order.
     */
    @Query("SELECT COUNT(l) > 0 FROM Loan l " +
            "JOIN LoanApplication la ON la.id = l.applicationId " +
            "WHERE la.queuePosition < :pos " +
            "AND l.status = 'APPROVED' " +
            "AND l.disbursementDate IS NULL " +        // ← ADD THIS
            "AND l.disbursementSkippedAt IS NULL")
    boolean existsBlockingLoanForDisbursement(@Param("pos") int queuePosition);
    /**
     * Returns the current maximum queue_position across all applications.
     * Used to assign the next position atomically at submission.
     */
    @Query("SELECT COALESCE(MAX(la.queuePosition), 0) FROM LoanApplication la")
    int getMaxQueuePosition();

    /**
     * Returns all applications with a pending skip request awaiting manager review.
     */
    List<LoanApplication> findBySkipRequestStatusOrderBySkipRequestedAtAsc(String skipRequestStatus);

    /**
     * Count active loans for a member
     */
    @Query("SELECT COUNT(l) FROM Loan l WHERE l.memberId = :memberId AND l.status IN ('ACTIVE', 'DISBURSED')")
    Long countActiveLoansForMember(@Param("memberId") UUID memberId);

    // Add this method to your existing LoanApplicationRepository
    // In LoanApplicationRepository.java — replace the findMaxQueuePosition method:
    @Query("SELECT COALESCE(MAX(a.queuePosition), 0) FROM LoanApplication a")
    Integer findMaxQueuePosition();

}
