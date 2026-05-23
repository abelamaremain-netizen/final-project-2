package et.edu.woldia.coop.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * DTO for LoanApplication entity.
 */
@Data
public class LoanApplicationDto {
    private UUID id;
    private UUID memberId;
    private BigDecimal requestedAmount;
    private Integer loanDurationMonths;
    private String loanPurpose;
    private String purposeDescription;
    private String status;
    private LocalDateTime submissionDate;
    private String reviewedBy;
    private LocalDateTime reviewStartDate;
    private String denialReason;
    private String currency;

    // Queue position (FIFO enforcement)
    private Integer queuePosition;

    // Direct skip fields
    private Boolean isSkipped;
    private String skipReason;
    private String skippedBy;
    private LocalDateTime skippedAt;

    // Skip request fields (LOAN_OFFICER → MANAGER workflow)
    private String skipRequestReason;
    private String skipRequestedBy;
    private LocalDateTime skipRequestedAt;
    private String skipRequestStatus;
    private String skipRequestReviewNote;
    private String skipRequestRejectionReason;
    private String skipRequestReviewedBy;
    private LocalDateTime skipRequestReviewedAt;
    private String skipRequestPreviousStatus;
}