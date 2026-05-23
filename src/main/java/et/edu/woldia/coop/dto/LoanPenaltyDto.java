package et.edu.woldia.coop.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/**
 * DTO for LoanPenalty entity.
 * Includes all fields needed for manual audit verification:
 *   penalty = outstandingAtAssessment × penaltyRate × (daysOverdue / 365)
 */
@Data
public class LoanPenaltyDto {
    private UUID id;
    private UUID loanId;
    private BigDecimal penaltyAmount;
    private String penaltyType;
    // Audit fields — allow verifying the calculation
    private BigDecimal penaltyRate;
    private Integer daysOverdue;
    private BigDecimal outstandingAtAssessment;
    private Integer configVersion;
    private LocalDate assessmentDate;
    private String assessedBy;
    private Boolean paid;
    private LocalDate paidDate;
    private String notes;
    private String currency;
}
