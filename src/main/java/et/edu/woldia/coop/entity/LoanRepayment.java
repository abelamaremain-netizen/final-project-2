package et.edu.woldia.coop.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Loan repayment entity representing a payment made towards a loan.
 *
 * Audit fields:
 * - paymentDate: the date the payment was made (may be backdated)
 * - recordedAt:  when this record was created in the system (cannot be backdated)
 * - processedBy: the user who recorded this payment
 *
 * Financial fields:
 * - paymentAmount:            total amount received
 * - principalPaid:            portion applied to principal
 * - interestPaid:             portion applied to interest
 * - penaltyPaid:              portion applied to penalties
 * - outstandingBalanceAfter:  loan outstanding balance immediately after this payment
 * - interestForgiven:         interest waived due to early settlement (0 for normal payments)
 */
@Entity
@Table(name = "loan_repayments")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class LoanRepayment {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(columnDefinition = "uuid")
    private UUID id;

    @Column(name = "loan_id", nullable = false, columnDefinition = "uuid")
    private UUID loanId;

    @Embedded
    @AttributeOverrides({
        @AttributeOverride(name = "amount", column = @Column(name = "payment_amount")),
        @AttributeOverride(name = "currency", column = @Column(name = "payment_currency", length = 3))
    })
    private Money paymentAmount;

    @Embedded
    @AttributeOverrides({
        @AttributeOverride(name = "amount", column = @Column(name = "principal_paid_amount")),
        @AttributeOverride(name = "currency", column = @Column(name = "principal_paid_currency", length = 3))
    })
    private Money principalPaid;

    @Embedded
    @AttributeOverrides({
        @AttributeOverride(name = "amount", column = @Column(name = "interest_paid_amount")),
        @AttributeOverride(name = "currency", column = @Column(name = "interest_paid_currency", length = 3))
    })
    private Money interestPaid;

    @Embedded
    @AttributeOverrides({
        @AttributeOverride(name = "amount", column = @Column(name = "penalty_paid_amount")),
        @AttributeOverride(name = "currency", column = @Column(name = "penalty_paid_currency", length = 3))
    })
    private Money penaltyPaid;

    /** Outstanding loan balance (principal + interest) immediately after this payment. */
    @Column(name = "outstanding_balance_after", precision = 15, scale = 2)
    private BigDecimal outstandingBalanceAfter;

    /**
     * Interest forgiven due to early settlement.
     * Zero for normal scheduled payments.
     * Positive when borrower pays off early and unearned future interest is waived.
     */
    @Column(name = "interest_forgiven", precision = 15, scale = 2)
    private BigDecimal interestForgiven = BigDecimal.ZERO;

    /** The date the payment was made (may differ from recordedAt if backdated). */
    @Column(name = "payment_date", nullable = false)
    private LocalDate paymentDate;

    /** When this record was entered into the system — cannot be backdated. */
    @Column(name = "recorded_at", nullable = false, updatable = false)
    private LocalDateTime recordedAt;

    @Column(name = "processed_by", nullable = false)
    private String processedBy;

    @Column(length = 500)
    private String notes;

    /** Configuration version of the loan — for auditors to verify interest rate applied. */
    @Column(name = "config_version")
    private Integer configVersion;

    @PrePersist
    protected void onPrePersist() {
        if (recordedAt == null) {
            recordedAt = LocalDateTime.now();
        }
        if (interestForgiven == null) {
            interestForgiven = BigDecimal.ZERO;
        }
    }

    // ── Legacy columns — kept to avoid NOT NULL constraint violations on old rows ──
    @Column(name = "amount_amount")
    private BigDecimal amountAmount;

    @Column(name = "principal_portion_amount")
    private BigDecimal principalPortionAmount;

    @Column(name = "interest_portion_amount")
    private BigDecimal interestPortionAmount;

    @Column(name = "outstanding_balance_after_amount")
    private BigDecimal outstandingBalanceAfterAmount;
}
