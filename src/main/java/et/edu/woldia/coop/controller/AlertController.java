package et.edu.woldia.coop.controller;

import et.edu.woldia.coop.service.AlertService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.YearMonth;
import java.util.List;

/**
 * REST controller for compliance alerts.
 * Exposes missed-deposit and missed-repayment warnings.
 */
@RestController
@RequestMapping("/api/alerts")
@RequiredArgsConstructor
@Tag(name = "Alerts", description = "Compliance alert API")
@SecurityRequirement(name = "bearerAuth")
public class AlertController {

    private final AlertService alertService;

    /**
     * Members with a payroll deduction entry for the given month that is not CONFIRMED.
     * Defaults to the current month if no month param is provided.
     */
    @GetMapping("/missed-deposits")
    @PreAuthorize("hasAnyRole('MANAGER', 'ACCOUNTANT', 'MEMBER_OFFICER')")
    @Operation(summary = "Missed monthly deposits",
               description = "Returns members whose regular savings deposit is not confirmed for the given month")
    public ResponseEntity<List<AlertService.MissedDepositAlert>> getMissedDeposits(
            @RequestParam(required = false) String month) {
        YearMonth ym = month != null ? YearMonth.parse(month) : YearMonth.now();
        return ResponseEntity.ok(alertService.getMissedDeposits(ym));
    }

    /**
     * Active loans with no repayment recorded for the given month.
     * Defaults to the current month if no month param is provided.
     */
    @GetMapping("/missed-repayments")
    @PreAuthorize("hasAnyRole('MANAGER', 'ACCOUNTANT', 'LOAN_OFFICER')")
    @Operation(summary = "Missed monthly loan repayments",
               description = "Returns active loans with no repayment recorded for the given month")
    public ResponseEntity<List<AlertService.MissedRepaymentAlert>> getMissedRepayments(
            @RequestParam(required = false) String month) {
        YearMonth ym = month != null ? YearMonth.parse(month) : YearMonth.now();
        return ResponseEntity.ok(alertService.getMissedRepayments(ym));
    }
}
