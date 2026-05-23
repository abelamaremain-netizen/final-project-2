package et.edu.woldia.coop.mapper;

import et.edu.woldia.coop.dto.LoanPenaltyDto;
import et.edu.woldia.coop.entity.LoanPenalty;
import org.springframework.stereotype.Component;

/**
 * Mapper for LoanPenalty entity and DTO.
 */
@Component
public class LoanPenaltyMapper {

    public LoanPenaltyDto toDto(LoanPenalty entity) {
        if (entity == null) return null;

        LoanPenaltyDto dto = new LoanPenaltyDto();
        dto.setId(entity.getId());
        dto.setLoanId(entity.getLoanId());
        dto.setPenaltyAmount(entity.getPenaltyAmount() != null ? entity.getPenaltyAmount().getAmount() : null);
        dto.setPenaltyType(entity.getPenaltyType() != null ? entity.getPenaltyType().name() : null);
        dto.setPenaltyRate(entity.getPenaltyRate());
        dto.setDaysOverdue(entity.getDaysOverdue());
        dto.setOutstandingAtAssessment(
            entity.getOutstandingAtAssessment() != null ? entity.getOutstandingAtAssessment().getAmount() : null);
        dto.setConfigVersion(entity.getConfigVersion());
        dto.setAssessmentDate(entity.getAssessmentDate());
        dto.setAssessedBy(entity.getAssessedBy());
        dto.setPaid(entity.getIsPaid());
        dto.setPaidDate(entity.getPaidDate());
        dto.setNotes(entity.getNotes());
        dto.setCurrency(entity.getPenaltyAmount() != null && entity.getPenaltyAmount().getCurrency() != null
            ? entity.getPenaltyAmount().getCurrency() : "ETB");

        return dto;
    }
}
