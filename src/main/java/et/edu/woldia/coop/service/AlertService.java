package et.edu.woldia.coop.service;

import et.edu.woldia.coop.entity.Loan;
import et.edu.woldia.coop.entity.Member;
import et.edu.woldia.coop.repository.LoanRepaymentRepository;
import et.edu.woldia.coop.repository.LoanRepository;
import et.edu.woldia.coop.repository.MemberRepository;
import et.edu.woldia.coop.repository.PayrollDeductionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Service for generating compliance alerts:
 * - Members who missed their monthly regular savings deposit
 * - Active loans with no repayment recorded this month
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AlertService {

    private final PayrollDeductionRepository payrollDeductionRepository;
    private final LoanRepaymentRepository loanRepaymentRepository;
    private final LoanRepository loanRepository;
    private final MemberRepository memberRepository;

    // ─── DTOs ────────────────────────────────────────────────────────────────

    public record MissedDepositAlert(
        UUID memberId,
        String memberCode,
        String memberName,
        String deductionStatus,   // PENDING or FAILED
        String month
    ) {}

    public record MissedRepaymentAlert(
        UUID loanId,
        String loanCode,
        UUID memberId,
        String memberCode,
        String memberName,
        double outstandingAmount,
        String firstPaymentDate,
        String month
    ) {}

    // ─── Missed deposits ─────────────────────────────────────────────────────

    /**
     * Returns members who have a payroll deduction entry for the given month
     * but it is not yet CONFIRMED (i.e. PENDING or FAILED).
     * If no deduction list has been generated for the month, returns empty.
     */
    @Transactional(readOnly = true)
    public List<MissedDepositAlert> getMissedDeposits(YearMonth month) {
        List<UUID> memberIds = payrollDeductionRepository.findMemberIdsWithMissedDeposit(month);
        if (memberIds.isEmpty()) return List.of();

        Map<UUID, Member> memberMap = memberRepository.findAllById(memberIds).stream()
            .collect(Collectors.toMap(Member::getId, m -> m));

        return payrollDeductionRepository.findByDeductionMonth(month).stream()
            .filter(d -> d.getStatus() != et.edu.woldia.coop.entity.PayrollDeduction.DeductionStatus.CONFIRMED)
            .map(d -> {
                Member m = memberMap.get(d.getMemberId());
                return new MissedDepositAlert(
                    d.getMemberId(),
                    m != null ? m.getCode() : "—",
                    m != null ? m.getFullName() : "Unknown",
                    d.getStatus().name(),
                    month.toString()
                );
            })
            .collect(Collectors.toList());
    }

    // ─── Missed repayments ───────────────────────────────────────────────────

    /**
     * Returns active loans that have no repayment recorded in the given month,
     * and whose first payment date is on or before the end of that month
     * (i.e. repayment was due).
     */
    @Transactional(readOnly = true)
    public List<MissedRepaymentAlert> getMissedRepayments(YearMonth month) {
        LocalDate monthEnd = month.atEndOfMonth();
        List<UUID> loanIds = loanRepaymentRepository.findLoanIdsWithNoRepaymentInMonth(
            month.getYear(), month.getMonthValue(), monthEnd);

        if (loanIds.isEmpty()) return List.of();

        List<Loan> loans = loanRepository.findAllById(loanIds);
        List<UUID> memberIds = loans.stream().map(Loan::getMemberId).distinct().collect(Collectors.toList());
        Map<UUID, Member> memberMap = memberRepository.findAllById(memberIds).stream()
            .collect(Collectors.toMap(Member::getId, m -> m));

        List<MissedRepaymentAlert> alerts = new ArrayList<>();
        for (Loan loan : loans) {
            Member m = memberMap.get(loan.getMemberId());
            double outstanding = loan.getOutstandingPrincipal().getAmount()
                .add(loan.getOutstandingInterest().getAmount())
                .doubleValue();
            alerts.add(new MissedRepaymentAlert(
                loan.getId(),
                loan.getCode(),
                loan.getMemberId(),
                m != null ? m.getCode() : "—",
                m != null ? m.getFullName() : "Unknown",
                outstanding,
                loan.getFirstPaymentDate() != null ? loan.getFirstPaymentDate().toString() : "—",
                month.toString()
            ));
        }
        return alerts;
    }
}
