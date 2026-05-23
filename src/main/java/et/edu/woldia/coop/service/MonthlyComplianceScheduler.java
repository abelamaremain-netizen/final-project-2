package et.edu.woldia.coop.service;

import et.edu.woldia.coop.entity.PayrollDeduction;
import et.edu.woldia.coop.repository.LoanRepaymentRepository;
import et.edu.woldia.coop.repository.LoanRepository;
import et.edu.woldia.coop.repository.PayrollDeductionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.UUID;

/**
 * Scheduled compliance checks that run on the 5th of each month at 06:00.
 *
 * 1. Auto-flag missed regular savings deposits:
 *    Any PENDING deduction entry for the previous month is marked FAILED.
 *    This feeds into the existing consecutive-failure → auto-suspension logic
 *    in PayrollService.flagFailedDeduction().
 *
 * 2. Log missed loan repayments:
 *    Active loans with no repayment in the previous month are logged to the
 *    audit trail. Staff can view them via GET /api/alerts/missed-repayments.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class MonthlyComplianceScheduler {

    private final PayrollDeductionRepository payrollDeductionRepository;
    private final LoanRepaymentRepository loanRepaymentRepository;
    private final LoanRepository loanRepository;
    private final PayrollService payrollService;
    private final AuditService auditService;

    private static final String SYSTEM_USER = "SYSTEM";

    /**
     * Runs at 06:00 on the 5th of every month.
     * Checks the PREVIOUS month for missed deposits and repayments.
     */
    @Scheduled(cron = "0 0 6 5 * *")
    public void runMonthlyComplianceCheck() {
        YearMonth previousMonth = YearMonth.now().minusMonths(1);
        log.info("Monthly compliance check started for month: {}", previousMonth);

        autoFlagMissedDeposits(previousMonth);
        logMissedRepayments(previousMonth);

        log.info("Monthly compliance check completed for month: {}", previousMonth);
    }

    /**
     * Marks all PENDING deduction entries for the given month as FAILED.
     * This triggers the consecutive-failure counter in PayrollService,
     * which auto-suspends members who exceed the configured threshold.
     */
    @Transactional
    public void autoFlagMissedDeposits(YearMonth month) {
        List<PayrollDeduction> pending = payrollDeductionRepository.findPendingDeductions(month);
        log.info("Auto-flagging {} missed deposits for month: {}", pending.size(), month);

        for (PayrollDeduction deduction : pending) {
            try {
                payrollService.flagFailedDeduction(
                    deduction.getMemberId(),
                    month,
                    "Auto-flagged: no deposit confirmed by end of month",
                    SYSTEM_USER
                );
            } catch (Exception e) {
                log.error("Failed to auto-flag deduction for member {}: {}",
                    deduction.getMemberId(), e.getMessage());
            }
        }

        log.info("Auto-flagged {} missed deposits for {}", pending.size(), month);
    }

    /**
     * Logs active loans with no repayment in the given month to the audit trail.
     * Does not take any automated action — staff review via the alerts API.
     */
    @Transactional(readOnly = true)
    public void logMissedRepayments(YearMonth month) {
        LocalDate monthEnd = month.atEndOfMonth();
        List<UUID> loanIds = loanRepaymentRepository.findLoanIdsWithNoRepaymentInMonth(
            month.getYear(), month.getMonthValue(), monthEnd);

        log.info("Found {} loans with no repayment in {}", loanIds.size(), month);

        for (UUID loanId : loanIds) {
            try {
                auditService.logAction(
                    null,
                    SYSTEM_USER,
                    "MISSED_REPAYMENT",
                    "LOAN",
                    loanId,
                    "No repayment recorded for month: " + month
                );
            } catch (Exception e) {
                log.error("Failed to log missed repayment for loan {}: {}", loanId, e.getMessage());
            }
        }

        log.info("Logged {} missed repayments for {}", loanIds.size(), month);
    }
}
