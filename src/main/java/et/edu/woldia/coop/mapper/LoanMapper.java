package et.edu.woldia.coop.mapper;

import et.edu.woldia.coop.dto.LoanDto;
import et.edu.woldia.coop.entity.Loan;
import et.edu.woldia.coop.entity.LoanApplication;
import et.edu.woldia.coop.repository.LoanApplicationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * Mapper for Loan entity and DTO.
 */
@Component
@RequiredArgsConstructor
public class LoanMapper {

    private final LoanApplicationRepository loanApplicationRepository;

    public LoanDto toDto(Loan entity) {
        if (entity == null) return null;

        LoanDto dto = new LoanDto();
        dto.setId(entity.getId());
        dto.setCode(entity.getCode());
        dto.setMemberId(entity.getMemberId());
        dto.setApplicationId(entity.getApplicationId());
        dto.setPrincipalAmount(entity.getPrincipalAmount() != null ? entity.getPrincipalAmount().getAmount() : null);
        dto.setInterestRate(entity.getInterestRate());
        dto.setDurationMonths(entity.getDurationMonths());
        dto.setOutstandingPrincipal(entity.getOutstandingPrincipal() != null ? entity.getOutstandingPrincipal().getAmount() : null);
        dto.setOutstandingInterest(entity.getOutstandingInterest() != null ? entity.getOutstandingInterest().getAmount() : null);
        // totalPaid — always expose so frontend doesn't need to sum repayment history
        dto.setTotalPaid(entity.getTotalPaid() != null ? entity.getTotalPaid().getAmount() : java.math.BigDecimal.ZERO);
        dto.setDisbursementDate(entity.getDisbursementDate());
        dto.setFirstPaymentDate(entity.getFirstPaymentDate());
        dto.setLastPaymentDate(entity.getLastPaymentDate());
        dto.setMaturityDate(entity.getMaturityDate());
        dto.setStatus(entity.getStatus() != null ? entity.getStatus().name() : null);
        dto.setApprovalDate(entity.getApprovalDate() != null ? entity.getApprovalDate().toLocalDate() : null);
        dto.setDisbursedBy(entity.getDisbursedBy());
        dto.setConfigVersion(entity.getConfigVersion());
        dto.setCurrency(entity.getPrincipalAmount() != null ? entity.getPrincipalAmount().getCurrency() : "ETB");

        // Loan purpose from linked application — needed for audit trail
        if (entity.getApplicationId() != null) {
            try {
                loanApplicationRepository.findById(entity.getApplicationId()).ifPresent(app -> {
                    dto.setLoanPurpose(app.getLoanPurpose() != null ? app.getLoanPurpose().name() : null);
                    dto.setPurposeDescription(app.getPurposeDescription());
                    dto.setApprovedBy(app.getApprovedBy());
                    dto.setReviewedBy(app.getReviewedBy());
                    dto.setQueuePosition(app.getQueuePosition());
                });
                dto.setDisbursementSkippedAt(entity.getDisbursementSkippedAt());
                dto.setDisbursementSkippedBy(entity.getDisbursementSkippedBy());
                dto.setDisbursementSkipReason(entity.getDisbursementSkipReason());
            } catch (Exception ignored) {
                // Non-critical — don't fail the mapping if application not found
            }
        }

        return dto;
    }
}
