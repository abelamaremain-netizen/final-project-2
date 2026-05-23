package et.edu.woldia.coop.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * DTO for LoanRepayment entity.
 */
@Data
public class LoanRepaymentDto {
    private UUID id;
    private UUID loanId;
    private BigDecimal paymentAmount;
    private BigDecimal principalPaid;
    private BigDecimal interestPaid;
    private BigDecimal penaltyPaid;
    // Outstanding balance on the loan immediately after this payment
    private BigDecimal outstandingBalanceAfter;
    // Interest forgiven due to early settlement (0 for normal payments)
    private BigDecimal interestForgiven;
    // Configuration version of the loan — auditors use this to verify which interest rate was applied
    private Integer configVersion;
    private LocalDate paymentDate;
    // When this record was created in the system (for backdating detection)
    private LocalDateTime recordedAt;
    private String processedBy;
    private String notes;
    private String currency;
}
