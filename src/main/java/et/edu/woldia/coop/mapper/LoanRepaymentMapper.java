package et.edu.woldia.coop.mapper;

import et.edu.woldia.coop.dto.LoanRepaymentDto;
import et.edu.woldia.coop.entity.LoanRepayment;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

/**
 * Mapper for LoanRepayment entity and DTO.
 */
@Component
public class LoanRepaymentMapper {

    public LoanRepaymentDto toDto(LoanRepayment entity) {
        if (entity == null) return null;

        LoanRepaymentDto dto = new LoanRepaymentDto();
        dto.setId(entity.getId());
        dto.setLoanId(entity.getLoanId());

        // Payment amount — prefer Money field, fall back to legacy column for old records
        if (entity.getPaymentAmount() != null && entity.getPaymentAmount().getAmount() != null) {
            dto.setPaymentAmount(entity.getPaymentAmount().getAmount());
            dto.setCurrency(entity.getPaymentAmount().getCurrency() != null
                ? entity.getPaymentAmount().getCurrency() : "ETB");
        } else {
            dto.setPaymentAmount(entity.getAmountAmount() != null ? entity.getAmountAmount() : BigDecimal.ZERO);
            dto.setCurrency("ETB");
        }

        // Principal paid
        dto.setPrincipalPaid(entity.getPrincipalPaid() != null && entity.getPrincipalPaid().getAmount() != null
            ? entity.getPrincipalPaid().getAmount()
            : (entity.getPrincipalPortionAmount() != null ? entity.getPrincipalPortionAmount() : BigDecimal.ZERO));

        // Interest paid
        dto.setInterestPaid(entity.getInterestPaid() != null && entity.getInterestPaid().getAmount() != null
            ? entity.getInterestPaid().getAmount()
            : (entity.getInterestPortionAmount() != null ? entity.getInterestPortionAmount() : BigDecimal.ZERO));

        // Penalty paid
        dto.setPenaltyPaid(entity.getPenaltyPaid() != null && entity.getPenaltyPaid().getAmount() != null
            ? entity.getPenaltyPaid().getAmount()
            : BigDecimal.ZERO);

        // Outstanding balance after this payment
        dto.setOutstandingBalanceAfter(entity.getOutstandingBalanceAfter() != null
            ? entity.getOutstandingBalanceAfter()
            : (entity.getOutstandingBalanceAfterAmount() != null ? entity.getOutstandingBalanceAfterAmount() : null));

        // Interest forgiven (early settlement)
        dto.setInterestForgiven(entity.getInterestForgiven() != null ? entity.getInterestForgiven() : BigDecimal.ZERO);

        // Config version — for audit verification of interest rate
        dto.setConfigVersion(entity.getConfigVersion());

        dto.setPaymentDate(entity.getPaymentDate());
        dto.setRecordedAt(entity.getRecordedAt());
        dto.setProcessedBy(entity.getProcessedBy());
        dto.setNotes(entity.getNotes());

        return dto;
    }
}
