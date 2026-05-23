package et.edu.woldia.coop.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
public class LoanDto {
    private UUID id;
    private String code;
    private UUID memberId;
    private UUID applicationId;
    private BigDecimal principalAmount;
    private BigDecimal interestRate;
    private Integer durationMonths;
    private BigDecimal outstandingPrincipal;
    private BigDecimal outstandingInterest;
    private BigDecimal totalPaid;
    private LocalDate disbursementDate;
    private LocalDate firstPaymentDate;
    private LocalDate lastPaymentDate;
    private LocalDate maturityDate;
    private String status;
    private String approvedBy;
    private LocalDate approvalDate;
    private String disbursedBy;
    private String reviewedBy;
    private Integer configVersion;
    private String currency;
    private String loanPurpose;
    private String purposeDescription;
    private Integer queuePosition;
    private LocalDateTime disbursementSkippedAt;
    private String disbursementSkippedBy;
    private String disbursementSkipReason;
}