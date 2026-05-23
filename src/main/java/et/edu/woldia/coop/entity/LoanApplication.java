package et.edu.woldia.coop.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Loan application entity.
 */
@Entity
@Table(name = "loan_applications")
@Data
@EqualsAndHashCode(callSuper = true)
@NoArgsConstructor
@AllArgsConstructor
public class LoanApplication extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(columnDefinition = "uuid")
    private UUID id;

    @Column(name = "member_id", nullable = false, columnDefinition = "uuid")
    private UUID memberId;

    @Embedded
    @AttributeOverrides({
        @AttributeOverride(name = "amount", column = @Column(name = "requested_amount_amount")),
        @AttributeOverride(name = "currency", column = @Column(name = "requested_currency", length = 3))
    })
    private Money requestedAmount;

    @Column(name = "loan_duration_months", nullable = false)
    private Integer loanDurationMonths;

    @Enumerated(EnumType.STRING)
    @Column(name = "loan_purpose", nullable = false)
    private LoanPurpose loanPurpose;

    @Column(name = "purpose_description", length = 1000)
    private String purposeDescription;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.NAMED_ENUM)
    private ApplicationStatus status = ApplicationStatus.PENDING;

    @Column(name = "submission_date", nullable = false)
    private LocalDateTime submissionDate;

    @Column(name = "queue_position")
    private Integer queuePosition;

    @Column(name = "review_started_date")
    private LocalDateTime reviewStartedDate;

    @Column(name = "reviewed_by")
    private String reviewedBy;

    @Column(name = "approval_date")
    private LocalDateTime approvalDate;

    @Column(name = "approved_by")
    private String approvedBy;

    @Column(name = "denial_reason", length = 1000)
    private String denialReason;

    @Column(name = "config_version")
    private Integer configVersion;

    // ── Direct skip fields (MANAGER) ─────────────────────────────────────────
    @Column(name = "is_skipped", nullable = false)
    private Boolean isSkipped = false;

    @Column(name = "skip_reason")
    private String skipReason;

    @Column(name = "skipped_by")
    private String skippedBy;

    @Column(name = "skipped_at")
    private java.time.LocalDateTime skippedAt;

    // ── Skip request fields (LOAN_OFFICER → MANAGER workflow) ────────────────
    @Column(name = "skip_request_reason")
    private String skipRequestReason;

    @Column(name = "skip_requested_by")
    private String skipRequestedBy;

    @Column(name = "skip_requested_at")
    private java.time.LocalDateTime skipRequestedAt;

    @Column(name = "skip_request_status", length = 30)
    private String skipRequestStatus; // PENDING_MANAGER_REVIEW, APPROVED, REJECTED

    @Column(name = "skip_request_review_note")
    private String skipRequestReviewNote;

    @Column(name = "skip_request_rejection_reason")
    private String skipRequestRejectionReason;

    @Column(name = "skip_request_reviewed_by")
    private String skipRequestReviewedBy;

    @Column(name = "skip_request_reviewed_at")
    private java.time.LocalDateTime skipRequestReviewedAt;

    @Column(name = "skip_request_previous_status", length = 30)
    private String skipRequestPreviousStatus; // PENDING or UNDER_REVIEW — for restoration on rejection

    public enum LoanPurpose {
        BUSINESS,
        EDUCATION,
        MEDICAL,
        HOUSING,
        VEHICLE,
        EMERGENCY,
        OTHER
    }

    public enum ApplicationStatus {
        PENDING,
        UNDER_REVIEW,
        APPROVED,
        DENIED,
        WITHDRAWN,
        EXPIRED,
        SKIPPED,        // directly skipped by MANAGER or via approved skip request
        SKIP_REQUESTED  // skip request submitted by LOAN_OFFICER, awaiting MANAGER decision
    }
}