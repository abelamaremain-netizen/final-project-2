package et.edu.woldia.coop.service;

import et.edu.woldia.coop.dto.LoanApplicationDto;
import et.edu.woldia.coop.dto.LoanDto;
import et.edu.woldia.coop.dto.LoanRepaymentDto;
import et.edu.woldia.coop.dto.LoanScheduleDto;
import et.edu.woldia.coop.dto.LoanScheduleEntryDto;
import et.edu.woldia.coop.dto.MemberDto;
import et.edu.woldia.coop.entity.*;
import et.edu.woldia.coop.exception.ResourceNotFoundException;
import et.edu.woldia.coop.exception.ValidationException;
import et.edu.woldia.coop.mapper.LoanApplicationMapper;
import et.edu.woldia.coop.mapper.LoanMapper;
import et.edu.woldia.coop.mapper.LoanRepaymentMapper;
import et.edu.woldia.coop.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Service for loan management operations.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class LoanService {
    
    private final LoanApplicationRepository loanApplicationRepository;
    private final LoanRepository loanRepository;
    private final LoanRepaymentRepository loanRepaymentRepository;
    private final CodeGenerator codeGenerator;
    private final CollateralRepository collateralRepository;
    private final AccountRepository accountRepository;
    private final ShareRecordRepository shareRecordRepository;
    private final DocumentReferenceRepository documentReferenceRepository;
    private final ConfigurationService configurationService;
    private final MemberService memberService;
    private final LoanMapper loanMapper;
    private final LoanApplicationMapper loanApplicationMapper;
    private final LoanRepaymentMapper loanRepaymentMapper;
    private final AccountService accountService;
    private final AuditService auditService;
    
    /**
     * Submit loan application
     */
    @Transactional
    public UUID submitLoanApplication(UUID memberId, BigDecimal requestedAmount, 
                                       Integer durationMonths,
                                       LoanApplication.LoanPurpose purpose, String description) {
        log.info("Submitting loan application for member: {}, amount: {}", memberId, requestedAmount);
        
        // Validate member
        MemberDto memberDto = memberService.getMemberById(memberId);
        
        if (!memberDto.getStatus().equals("ACTIVE")) {
            throw new ValidationException("Member is not active");
        }
        
        // Get configuration
        SystemConfiguration config = configurationService.getCurrentConfiguration();
        
        // Validate loan duration
        if (durationMonths == null || durationMonths <= 0) {
            throw new ValidationException("Loan duration must be at least 1 month.");
        }

        // Validate amount
        if (requestedAmount.compareTo(config.getMinimumLoanAmount().getAmount()) < 0) {
            throw new ValidationException(
                "Loan amount must be at least ETB " + config.getMinimumLoanAmount().getAmount()
            );
        }
        
        if (requestedAmount.compareTo(config.getMaximumLoanCapPerMember().getAmount()) > 0) {
            throw new ValidationException(
                "Loan amount cannot exceed ETB " + config.getMaximumLoanCapPerMember().getAmount()
            );
        }
        
        // Check maximum active loans
        Long activeLoans = loanApplicationRepository.countActiveLoansForMember(memberId);
        if (activeLoans >= config.getMaximumActiveLoansPerMember()) {
            throw new ValidationException(
                "Member has reached maximum active loans limit (" + 
                config.getMaximumActiveLoansPerMember() + ")"
            );
        }

        // Validate loan amount against savings-based multiplier cap
        // Cap = member's regular savings balance × multiplier (based on membership duration)
        validateLoanAmountAgainstSavingsCap(memberId, memberDto, requestedAmount, config);
        
        // Create application
        LoanApplication application = new LoanApplication();
        application.setMemberId(memberId);
        application.setRequestedAmount(new Money(requestedAmount, "ETB"));
        application.setLoanDurationMonths(durationMonths);
        application.setLoanPurpose(purpose);
        application.setPurposeDescription(description);
        application.setStatus(LoanApplication.ApplicationStatus.PENDING);
        application.setSubmissionDate(LocalDateTime.now());

        // Assign queue position atomically; retry once on UNIQUE constraint collision
        int queuePosition = loanApplicationRepository.getMaxQueuePosition() + 1;
        application.setQueuePosition(queuePosition);

        LoanApplication saved;
        try {
            saved = loanApplicationRepository.save(application);
            loanApplicationRepository.flush();
        } catch (DataIntegrityViolationException ex) {
            log.warn("Queue position collision on first attempt (pos={}), retrying", queuePosition);
            int retryPosition = loanApplicationRepository.getMaxQueuePosition() + 1;
            application.setQueuePosition(retryPosition);
            try {
                saved = loanApplicationRepository.save(application);
                loanApplicationRepository.flush();
            } catch (DataIntegrityViolationException retryEx) {
                log.error("Queue position collision on retry (pos={}), returning 409", retryPosition);
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Could not assign a unique queue position due to concurrent submissions. Please try again.");
            }
        }

        log.info("Loan application submitted: {} with queue position: {}", saved.getId(), saved.getQueuePosition());

        try {
            auditService.logAction(null, "SYSTEM", "CREATE", "LOAN_APPLICATION", saved.getId(),
                "Loan application submitted by member " + memberId + " for ETB " + requestedAmount);
        } catch (Exception ignored) {}

        return saved.getId();
    }
    
    /**
     * Get application queue — sorted ascending by queue_position (FIFO order)
     */
    @Transactional(readOnly = true)
    public List<LoanApplicationDto> getApplicationQueue() {
        return loanApplicationRepository.findActiveQueueOrderedByPosition().stream()
            .map(loanApplicationMapper::toDto)
            .collect(Collectors.toList());
    }

    /**
     * Get application by ID
     */
    @Transactional(readOnly = true)
    public LoanApplicationDto getApplicationById(UUID applicationId) {
        LoanApplication application = findApplicationById(applicationId);
        return loanApplicationMapper.toDto(application);
    }

    /**
     * Get denied applications (for appeal workflow)
     */
    @Transactional(readOnly = true)
    public List<LoanApplicationDto> getDeniedApplications() {        return loanApplicationRepository.findByStatusOrderBySubmissionDateAsc(LoanApplication.ApplicationStatus.DENIED).stream()
            .map(loanApplicationMapper::toDto)
            .collect(Collectors.toList());
    }
    
    /**
     * Start reviewing application
     */
    @Transactional
    public void startReview(UUID applicationId, String reviewedBy) {
        LoanApplication application = findApplicationById(applicationId);
        
        if (application.getStatus() != LoanApplication.ApplicationStatus.PENDING) {
            throw new ValidationException("Application is not pending");
        }
        
        application.setStatus(LoanApplication.ApplicationStatus.UNDER_REVIEW);
        application.setReviewStartedDate(LocalDateTime.now());
        application.setReviewedBy(reviewedBy);
        
        loanApplicationRepository.save(application);
        
        log.info("Application review started: {}", applicationId);
    }
    
    /**
     * Approve loan application
     */
    @Transactional
    public UUID approveLoanApplication(UUID applicationId, String approvedBy) {
        log.info("Approving loan application: {}", applicationId);
        
        LoanApplication application = findApplicationById(applicationId);
        
        if (application.getStatus() != LoanApplication.ApplicationStatus.UNDER_REVIEW) {
            throw new ValidationException("Application must be under review");
        }

        // Re-validate member is still active at approval time
        MemberDto memberDto = memberService.getMemberById(application.getMemberId());
        if (!memberDto.getStatus().equals("ACTIVE")) {
            throw new ValidationException(
                "Cannot approve: member is no longer active (status: " + memberDto.getStatus() + ")."
            );
        }

        // Enforce FIFO queue order: all predecessors must be resolved before this one can be approved
        if (application.getQueuePosition() != null &&
                loanApplicationRepository.existsBlockingApplicationForApproval(application.getQueuePosition())) {
            // Find the first blocking application to include in the error message
            List<LoanApplication> blocking = loanApplicationRepository
                    .findActiveQueueOrderedByPosition().stream()
                    .filter(a -> a.getQueuePosition() != null
                            && a.getQueuePosition() < application.getQueuePosition())
                    .findFirst()
                    .map(List::of)
                    .orElse(List.of());
            int blockingPos = blocking.isEmpty() ? 0 : blocking.get(0).getQueuePosition();
            String blockingStatus = blocking.isEmpty() ? "UNKNOWN" : blocking.get(0).getStatus().name();
            throw new ValidationException(String.format(
                    "QUEUE_BLOCKED_APPROVAL|%d|%s|Cannot approve application: application at queue position %d (status: %s) must be resolved first.",
                    blockingPos, blockingStatus, blockingPos, blockingStatus));
        }

        // Validate collateral sufficiency
        validateCollateralForLoan(applicationId, application.getRequestedAmount().getAmount());
        
        // Lock configuration
        SystemConfiguration config = configurationService.lockConfigurationForTransaction(
            "LOAN_APPROVAL",
            applicationId,
            approvedBy
        );
        
        // Create loan
        Loan loan = new Loan();
        loan.setApplicationId(applicationId);
        loan.setMemberId(application.getMemberId());
        loan.setPrincipalAmount(application.getRequestedAmount());
        loan.setInterestRate(config.getLoanInterestRateMin());
        loan.setDurationMonths(application.getLoanDurationMonths());
        loan.setOutstandingPrincipal(application.getRequestedAmount());
        
        // Calculate total interest
        BigDecimal totalInterest = calculateTotalInterest(
            application.getRequestedAmount().getAmount(),
            config.getLoanInterestRateMin(),
            application.getLoanDurationMonths()
        );
        loan.setOutstandingInterest(new Money(totalInterest, "ETB"));
        loan.setTotalPaid(new Money(BigDecimal.ZERO, "ETB"));
        
        loan.setStatus(Loan.LoanStatus.APPROVED);
        loan.setApprovalDate(LocalDateTime.now());
        loan.setConfigVersion(config.getVersion());
        loan.setCode(codeGenerator.nextLoanCode());  // ADD THIS LINE


        Loan savedLoan = loanRepository.save(loan);

        // Link pledged collateral (stored under applicationId during application phase) to the actual loanId.
        // This makes downstream rules (release/liquidation) enforceable on the loan lifecycle.
        List<Collateral> pledgedForApplication = collateralRepository.findByApplicationId(applicationId);
        for (Collateral c : pledgedForApplication) {
            c.setLoanId(savedLoan.getId());
        }
        collateralRepository.saveAll(pledgedForApplication);
        
        // Update application
        application.setStatus(LoanApplication.ApplicationStatus.APPROVED);
        application.setApprovalDate(LocalDateTime.now());
        application.setApprovedBy(approvedBy);
        application.setConfigVersion(config.getVersion());
        
        loanApplicationRepository.save(application);
        
        log.info("Loan approved: {}", savedLoan.getId());

        try {
            auditService.logAction(null, approvedBy, "APPROVE", "LOAN", savedLoan.getId(),
                "Loan approved for application " + applicationId);
        } catch (Exception ignored) {}

        return savedLoan.getId();
    }
    
    /**
     * Deny loan application
     */
    @Transactional
    public void denyLoanApplication(UUID applicationId, String reason, String deniedBy) {
        log.info("Denying loan application: {}", applicationId);
        
        LoanApplication application = findApplicationById(applicationId);
        
        if (application.getStatus() != LoanApplication.ApplicationStatus.UNDER_REVIEW) {
            throw new ValidationException("Application must be under review");
        }
        
        application.setStatus(LoanApplication.ApplicationStatus.DENIED);
        application.setDenialReason(reason);
        application.setApprovedBy(deniedBy);
        application.setApprovalDate(LocalDateTime.now());
        
        loanApplicationRepository.save(application);
        
        log.info("Loan application denied: {}", applicationId);

        try {
            auditService.logAction(null, deniedBy, "DENY", "LOAN_APPLICATION", applicationId,
                "Loan application denied. Reason: " + reason);
        } catch (Exception ignored) {}
    }
    
    // ── Task 7: Direct application skip (MANAGER) ────────────────────────────

    /**
     * MANAGER directly skips a loan application, marking it as SKIPPED and unblocking the queue.
     * The application retains its original queue_position and can be un-skipped later.
     * Requires a reason of at least 10 characters.
     */
    @Transactional
    public void skipApplication(UUID applicationId, String managerUsername, String reason) {
        log.info("Manager {} skipping application {}", managerUsername, applicationId);

        if (reason == null || reason.trim().length() < 10) {
            throw new ValidationException("SKIP_REASON_TOO_SHORT|Skip reason must be at least 10 characters.");
        }

        LoanApplication application = findApplicationById(applicationId);

        if (application.getStatus() == LoanApplication.ApplicationStatus.APPROVED
                || application.getStatus() == LoanApplication.ApplicationStatus.DENIED
                || application.getStatus() == LoanApplication.ApplicationStatus.WITHDRAWN
                || application.getStatus() == LoanApplication.ApplicationStatus.SKIPPED) {
            throw new ValidationException("Cannot skip an application that is already resolved.");
        }

        // Store the previous status so we can restore it on un-skip
        application.setSkipRequestPreviousStatus(application.getStatus().name());
        application.setStatus(LoanApplication.ApplicationStatus.SKIPPED);
        application.setIsSkipped(true);
        application.setSkipReason(reason.trim());
        application.setSkippedBy(managerUsername);
        application.setSkippedAt(LocalDateTime.now());

        loanApplicationRepository.save(application);

        log.info("Application {} skipped by {}", applicationId, managerUsername);

        try {
            auditService.logAction(null, managerUsername, "SKIP_APPLICATION", "LOAN_APPLICATION", applicationId,
                "Application skipped. Reason: " + reason.trim());
        } catch (Exception ignored) {}
    }

    /**
     * MANAGER un-skips a previously skipped application, restoring it to PENDING so it can
     * be reviewed and approved. The original queue_position is preserved.
     */
    @Transactional
    public void unskipApplication(UUID applicationId, String managerUsername) {
        log.info("Manager {} un-skipping application {}", managerUsername, applicationId);

        LoanApplication application = findApplicationById(applicationId);

        if (application.getStatus() != LoanApplication.ApplicationStatus.SKIPPED) {
            throw new ValidationException("Only SKIPPED applications can be un-skipped.");
        }

        // Restore to PENDING — keep skip fields as historical record for audit trail
        application.setStatus(LoanApplication.ApplicationStatus.PENDING);
        application.setIsSkipped(false);
        // Do NOT clear skipReason/skippedBy/skippedAt — they serve as history
        // Clear only the previous-status field since it's no longer relevant
        application.setSkipRequestPreviousStatus(null);

        loanApplicationRepository.save(application);

        log.info("Application {} un-skipped by {}, restored to PENDING at queue position {}",
            applicationId, managerUsername, application.getQueuePosition());

        try {
            auditService.logAction(null, managerUsername, "UNSKIP_APPLICATION", "LOAN_APPLICATION", applicationId,
                "Application un-skipped and restored to PENDING at queue position " + application.getQueuePosition());
        } catch (Exception ignored) {}
    }

    // ── Task 8: Skip request workflow (LOAN_OFFICER → MANAGER) ───────────────

    /**
     * LOAN_OFFICER submits a skip request for a loan application.
     * Transitions the application to SKIP_REQUESTED status.
     */
    @Transactional
    public void requestSkip(UUID applicationId, String officerUsername, String reason) {
        log.info("Officer {} requesting skip for application {}", officerUsername, applicationId);

        if (reason == null || reason.trim().length() < 10) {
            throw new ValidationException("SKIP_REASON_TOO_SHORT|Skip reason must be at least 10 characters.");
        }

        LoanApplication application = findApplicationById(applicationId);

        if (application.getStatus() != LoanApplication.ApplicationStatus.PENDING
                && application.getStatus() != LoanApplication.ApplicationStatus.UNDER_REVIEW) {
            throw new ValidationException("Skip requests can only be submitted for PENDING or UNDER_REVIEW applications.");
        }

        application.setSkipRequestPreviousStatus(application.getStatus().name());
        application.setSkipRequestReason(reason.trim());
        application.setSkipRequestedBy(officerUsername);
        application.setSkipRequestedAt(LocalDateTime.now());
        application.setSkipRequestStatus("PENDING_MANAGER_REVIEW");
        application.setStatus(LoanApplication.ApplicationStatus.SKIP_REQUESTED);

        loanApplicationRepository.save(application);

        log.info("Skip request submitted for application {} by {}", applicationId, officerUsername);

        try {
            auditService.logAction(null, officerUsername, "SKIP_REQUEST_SUBMITTED", "LOAN_APPLICATION", applicationId,
                "Skip request submitted. Reason: " + reason.trim());
        } catch (Exception ignored) {}
    }

    /**
     * Returns all loan applications with a pending skip request (PENDING_MANAGER_REVIEW).
     */
    @Transactional(readOnly = true)
    public List<LoanApplicationDto> getPendingSkipRequests() {
        return loanApplicationRepository.findBySkipRequestStatusOrderBySkipRequestedAtAsc("PENDING_MANAGER_REVIEW").stream()
                .map(loanApplicationMapper::toDto)
                .collect(Collectors.toList());
    }

    /**
     * MANAGER approves a skip request, transitioning the application to SKIPPED.
     */
    @Transactional
    public void approveSkipRequest(UUID applicationId, String managerUsername, String note) {
        log.info("Manager {} approving skip request for application {}", managerUsername, applicationId);

        LoanApplication application = findApplicationById(applicationId);

        if (!"PENDING_MANAGER_REVIEW".equals(application.getSkipRequestStatus())) {
            throw new ValidationException("No pending skip request found for this application.");
        }

        application.setSkipRequestStatus("APPROVED");
        application.setSkipRequestReviewNote(note);
        application.setSkipRequestReviewedBy(managerUsername);
        application.setSkipRequestReviewedAt(LocalDateTime.now());

        // Transition to SKIPPED and populate direct skip fields from the request
        application.setStatus(LoanApplication.ApplicationStatus.SKIPPED);
        application.setIsSkipped(true);
        application.setSkipReason(application.getSkipRequestReason());
        application.setSkippedBy(managerUsername);
        application.setSkippedAt(LocalDateTime.now());

        loanApplicationRepository.save(application);

        log.info("Skip request approved for application {} by {}", applicationId, managerUsername);

        try {
            auditService.logAction(null, managerUsername, "SKIP_REQUEST_APPROVED", "LOAN_APPLICATION", applicationId,
                "Skip request approved." + (note != null && !note.isBlank() ? " Note: " + note : ""));
        } catch (Exception ignored) {}
    }

    /**
     * MANAGER rejects a skip request, restoring the application to its previous status.
     */
    @Transactional
    public void rejectSkipRequest(UUID applicationId, String managerUsername, String reason) {
        log.info("Manager {} rejecting skip request for application {}", managerUsername, applicationId);

        if (reason == null || reason.trim().length() < 10) {
            throw new ValidationException("SKIP_REASON_TOO_SHORT|Rejection reason must be at least 10 characters.");
        }

        LoanApplication application = findApplicationById(applicationId);

        if (!"PENDING_MANAGER_REVIEW".equals(application.getSkipRequestStatus())) {
            throw new ValidationException("No pending skip request found for this application.");
        }

        application.setSkipRequestStatus("REJECTED");
        application.setSkipRequestRejectionReason(reason.trim());
        application.setSkipRequestReviewedBy(managerUsername);
        application.setSkipRequestReviewedAt(LocalDateTime.now());

        // Restore to previous status
        String previousStatus = application.getSkipRequestPreviousStatus();
        LoanApplication.ApplicationStatus restored = (previousStatus != null)
                ? LoanApplication.ApplicationStatus.valueOf(previousStatus)
                : LoanApplication.ApplicationStatus.PENDING;
        application.setStatus(restored);

        loanApplicationRepository.save(application);

        log.info("Skip request rejected for application {} by {}", applicationId, managerUsername);

        try {
            auditService.logAction(null, managerUsername, "SKIP_REQUEST_REJECTED", "LOAN_APPLICATION", applicationId,
                "Skip request rejected. Reason: " + reason.trim());
        } catch (Exception ignored) {}
    }

    // ── Task 10: FIFO disbursement enforcement and disbursement skip ──────────

    /**
     * Disburse loan
     */
    /**
     * Disburse loan
     */
    @Transactional
    public void disburseLoan(UUID loanId, String processedBy) {
        log.info("Disbursing loan: {}", loanId);

        Loan loan = findLoanById(loanId);

        if (loan.getStatus() != Loan.LoanStatus.APPROVED &&
                loan.getStatus() != Loan.LoanStatus.CONTRACT_PENDING) {
            throw new ValidationException("Loan is not ready for disbursement");
        }

        // ── 1. Enforce disbursement deadline ────────────────────────────────────
        SystemConfiguration disbConfig = configurationService.getCurrentConfiguration();
        if (loan.getApprovalDate() != null && disbConfig.getLoanDisbursementDeadlineDays() > 0) {
            LocalDate deadline = loan.getApprovalDate().toLocalDate()
                    .plusDays(disbConfig.getLoanDisbursementDeadlineDays());
            if (LocalDate.now().isAfter(deadline)) {
                throw new ValidationException(String.format(
                        "Disbursement deadline has passed. Loan was approved on %s and must be disbursed within %d days (by %s).",
                        loan.getApprovalDate().toLocalDate(),
                        disbConfig.getLoanDisbursementDeadlineDays(),
                        deadline
                ));
            }
        }

        // ── 2. Enforce FIFO disbursement queue order ──────────────────────────
        if (loan.getApplicationId() != null) {
            LoanApplication linkedApp = loanApplicationRepository.findById(loan.getApplicationId())
                    .orElse(null);

            if (linkedApp != null && linkedApp.getQueuePosition() != null
                    && loanApplicationRepository.existsBlockingLoanForDisbursement(linkedApp.getQueuePosition())) {

                // Find the actual blocking position among APPROVED loans that are
                // truly awaiting disbursement (disbursementDate IS NULL and not skipped)
                int blockingPos = loanRepository.findByStatus(
                                Loan.LoanStatus.APPROVED,
                                org.springframework.data.domain.Pageable.unpaged())
                        .getContent()
                        .stream()
                        .filter(l -> l.getDisbursementDate() == null)          // ← FIXED: exclude already-disbursed
                        .filter(l -> l.getDisbursementSkippedAt() == null)     // respect disbursement skips
                        .filter(l -> l.getApplicationId() != null)
                        .map(l -> loanApplicationRepository.findById(l.getApplicationId()).orElse(null))
                        .filter(a -> a != null
                                && a.getQueuePosition() != null
                                && a.getQueuePosition() < linkedApp.getQueuePosition())
                        .mapToInt(LoanApplication::getQueuePosition)
                        .min()
                        .orElse(0); // 0 means inconsistency (should not happen if existsBlocking... is true)

                if (blockingPos == 0) {
                    throw new ValidationException(
                            "Cannot disburse loan: a preceding loan is awaiting disbursement, but its queue position could not be determined.");
                }

                throw new ValidationException(String.format(
                        "QUEUE_BLOCKED_DISBURSEMENT|%d|Cannot disburse loan: loan for application at queue position %d is awaiting disbursement.",
                        blockingPos, blockingPos));
            }
        }

        // ── 3. Check liquidity (80% lending limit) ────────────────────────────
        validateLiquidityForDisbursement(loan.getPrincipalAmount().getAmount());

        // ── 4. Perform disbursement ────────────────────────────────────────────
        loan.setStatus(Loan.LoanStatus.DISBURSED);
        loan.setDisbursementDate(LocalDate.now());
        loan.setFirstPaymentDate(LocalDate.now().plusMonths(1));
        loan.setMaturityDate(LocalDate.now().plusMonths(loan.getDurationMonths()));
        loan.setDisbursedBy(processedBy);

        loanRepository.save(loan);

        // Transfer documents from LOAN_APPLICATION to LOAN entity
        if (loan.getApplicationId() != null) {
            transferDocumentsFromApplicationToLoan(loan.getApplicationId(), loanId, processedBy);
        }

        log.info("Loan disbursed: {}", loanId);

        try {
            auditService.logAction(null, processedBy, "DISBURSE", "LOAN", loanId,
                    "Loan disbursed. Principal: ETB " + loan.getPrincipalAmount().getAmount());
        } catch (Exception ignored) {}
    }

    /**
     * MANAGER skips a loan's disbursement, unblocking the disbursement queue.
     * Requires a reason of at least 10 characters.
     */
    @Transactional
    public void skipDisbursement(UUID loanId, String managerUsername, String reason) {
        log.info("Manager {} skipping disbursement for loan {}", managerUsername, loanId);

        if (reason == null || reason.trim().length() < 10) {
            throw new ValidationException("SKIP_REASON_TOO_SHORT|Skip reason must be at least 10 characters.");
        }

        Loan loan = findLoanById(loanId);

        if (loan.getDisbursementSkippedAt() != null) {
            throw new ValidationException("Disbursement has already been skipped for this loan.");
        }

        loan.setDisbursementSkipReason(reason.trim());
        loan.setDisbursementSkippedBy(managerUsername);
        loan.setDisbursementSkippedAt(LocalDateTime.now());

        loanRepository.save(loan);

        log.info("Disbursement skipped for loan {} by {}", loanId, managerUsername);

        try {
            auditService.logAction(null, managerUsername, "SKIP_DISBURSEMENT", "LOAN", loanId,
                "Disbursement skipped. Reason: " + reason.trim());
        } catch (Exception ignored) {}
    }

    /**
     * MANAGER un-skips a loan's disbursement, restoring it to the disbursement queue.
     * The loan returns to its original queue position and will block/disburse according to FIFO rules.
     */
    @Transactional
    public void unskipDisbursement(UUID loanId, String managerUsername) {
        log.info("Manager {} un-skipping disbursement for loan {}", managerUsername, loanId);

        Loan loan = findLoanById(loanId);

        if (loan.getDisbursementSkippedAt() == null) {
            throw new ValidationException("Disbursement has not been skipped for this loan.");
        }

        // Clear the skip fields
        loan.setDisbursementSkippedAt(null);
        loan.setDisbursementSkippedBy(null);
        loan.setDisbursementSkipReason(null);

        loanRepository.save(loan);

        log.info("Disbursement un-skipped for loan {} by {}", loanId, managerUsername);

        try {
            auditService.logAction(null, managerUsername, "UNSKIP_DISBURSEMENT", "LOAN", loanId,
                    "Disbursement un-skipped, loan returned to queue at position " +
                            (loan.getApplicationId() != null
                                    ? loanApplicationRepository.findById(loan.getApplicationId())
                                    .map(LoanApplication::getQueuePosition)
                                    .orElse(null)
                                    : null));
        } catch (Exception ignored) {}
    }
    
    /**
     * Record loan repayment.
     *
     * Repayment model:
     * - The loan carries a pre-calculated total interest (simple interest for the full term).
     * - Each month the borrower pays a fixed installment = (principal + totalInterest) / durationMonths.
     * - If the borrower pays off the remaining principal early, only the interest accrued up to
     *   the current month is charged — the unearned future interest is forgiven (early settlement).
     * - Overpayment (amount > total outstanding) is rejected.
     */
    @Transactional
    public String recordRepayment(UUID loanId, BigDecimal paymentAmount, String processedBy, String notes) {
        log.info("Recording repayment for loan: {}, amount: {}", loanId, paymentAmount);

        Loan loan = findLoanById(loanId);

        if (loan.getStatus() != Loan.LoanStatus.ACTIVE && loan.getStatus() != Loan.LoanStatus.DISBURSED) {
            throw new ValidationException("Loan is not active");
        }

        // ── Compute true outstanding (principal + accrued interest only) ──────
        BigDecimal outstandingPrincipal = loan.getOutstandingPrincipal().getAmount();
        BigDecimal outstandingInterest  = loan.getOutstandingInterest().getAmount();

        // Track how much interest is forgiven for early settlement audit trail
        BigDecimal interestForgiven = BigDecimal.ZERO;

        // If the borrower is paying off the full remaining principal, recalculate interest
        // based on months elapsed (early settlement — forgive unearned future interest).
        if (loan.getDisbursementDate() != null) {
            LocalDate today2 = LocalDate.now();
            long monthsElapsed = java.time.temporal.ChronoUnit.MONTHS.between(
                loan.getDisbursementDate(), today2);
            if (monthsElapsed < 1) monthsElapsed = 1; // at least 1 month of interest

            // Interest accrued to date = principal × annualRate × (monthsElapsed / 12)
            BigDecimal accruedInterest = loan.getPrincipalAmount().getAmount()
                .multiply(loan.getInterestRate())
                .multiply(BigDecimal.valueOf(monthsElapsed))
                .divide(BigDecimal.valueOf(12), 2, RoundingMode.HALF_UP);

            // Total interest already paid
            BigDecimal interestAlreadyPaid = loan.getPrincipalAmount().getAmount()
                .multiply(loan.getInterestRate())
                .multiply(BigDecimal.valueOf(loan.getDurationMonths()))
                .divide(BigDecimal.valueOf(12), 2, RoundingMode.HALF_UP)
                .subtract(outstandingInterest);

            // Remaining accrued interest = accrued to date - already paid (floor at 0)
            BigDecimal remainingAccruedInterest = accruedInterest.subtract(interestAlreadyPaid)
                .max(BigDecimal.ZERO);

            // Cap outstanding interest at the accrued amount (early settlement discount)
            if (remainingAccruedInterest.compareTo(outstandingInterest) < 0) {
                interestForgiven = outstandingInterest.subtract(remainingAccruedInterest);
                outstandingInterest = remainingAccruedInterest;
                log.info("Early settlement: forgiving ETB {} of unearned interest for loan {}",
                    interestForgiven.setScale(2, RoundingMode.HALF_UP), loanId);
            }
        }

        BigDecimal totalOutstanding = outstandingPrincipal.add(outstandingInterest);

        // ── Reject overpayment ────────────────────────────────────────────────
        if (totalOutstanding.compareTo(BigDecimal.ZERO) == 0) {
            throw new ValidationException("Loan is already fully paid off");
        }
        if (paymentAmount.compareTo(totalOutstanding) > 0) {
            throw new ValidationException(String.format(
                "Payment amount (ETB %s) exceeds total outstanding balance (ETB %s). " +
                "Maximum accepted payment is ETB %s.",
                paymentAmount.setScale(2, RoundingMode.HALF_UP),
                totalOutstanding.setScale(2, RoundingMode.HALF_UP),
                totalOutstanding.setScale(2, RoundingMode.HALF_UP)
            ));
        }

        // ── Duplicate payment check ───────────────────────────────────────────
        LocalDate today = LocalDate.now();

        // Block exact same-day duplicate of the same amount (accidental double-submit)
        boolean sameDayExists = loanRepaymentRepository.findByLoanIdOrderByPaymentDateDesc(loanId)
            .stream()
            .anyMatch(r -> r.getPaymentDate().equals(today)
                && r.getPaymentAmount() != null
                && r.getPaymentAmount().getAmount() != null
                && r.getPaymentAmount().getAmount().compareTo(paymentAmount) == 0);
        if (sameDayExists) {
            throw new ValidationException(
                "A payment of ETB " + paymentAmount.setScale(2, RoundingMode.HALF_UP) +
                " was already recorded today for this loan. " +
                "If this is intentional, record it with a different amount or contact a manager.");
        }

        // Warn for additional payments in the same month
        long repaymentsThisMonth = loanRepaymentRepository.countByLoanIdAndMonth(loanId, today.getYear(), today.getMonthValue());
        String warning = null;
        if (repaymentsThisMonth > 0) {
            warning = String.format("Note: %d repayment(s) already recorded for %s %d. This is an additional payment.",
                repaymentsThisMonth, today.getMonth().getDisplayName(java.time.format.TextStyle.FULL, java.util.Locale.ENGLISH), today.getYear());
            log.warn("Additional repayment for loan {} in {}/{}: {} existing repayment(s)", loanId, today.getMonthValue(), today.getYear(), repaymentsThisMonth);
        }

        // ── Minimum payment: must cover at least the interest portion ─────────
        // Prevents the loan from running indefinitely on interest-only payments
        if (paymentAmount.compareTo(totalOutstanding) < 0) {
            // Calculate the monthly interest installment
            BigDecimal monthlyInterestInstallment = loan.getPrincipalAmount().getAmount()
                .multiply(loan.getInterestRate())
                .divide(BigDecimal.valueOf(12), 2, RoundingMode.HALF_UP);
            BigDecimal minimumPayment = monthlyInterestInstallment.min(outstandingInterest);
            if (minimumPayment.compareTo(BigDecimal.ZERO) > 0
                    && paymentAmount.compareTo(minimumPayment) < 0) {
                throw new ValidationException(String.format(
                    "Minimum payment is ETB %s (monthly interest). " +
                    "Payments below this amount do not reduce the principal and the loan will never be paid off.",
                    minimumPayment.setScale(2, RoundingMode.HALF_UP)
                ));
            }
        }

        Money payment = new Money(paymentAmount, "ETB");

        Money principalPaid;
        Money interestPaid;

        if (payment.getAmount().compareTo(totalOutstanding) >= 0) {
            // Full settlement — pay off everything (interest capped at accrued amount)
            principalPaid = new Money(outstandingPrincipal, "ETB");
            interestPaid  = new Money(outstandingInterest, "ETB");
            loan.setOutstandingPrincipal(new Money(BigDecimal.ZERO, "ETB"));
            loan.setOutstandingInterest(new Money(BigDecimal.ZERO, "ETB"));
        } else {
            // Partial payment — interest-first, then principal
            BigDecimal interestPortion = payment.getAmount().min(outstandingInterest);
            BigDecimal principalPortion = payment.getAmount().subtract(interestPortion)
                .max(BigDecimal.ZERO);

            principalPaid = new Money(principalPortion, "ETB");
            interestPaid  = new Money(interestPortion, "ETB");

            loan.setOutstandingPrincipal(new Money(
                outstandingPrincipal.subtract(principalPortion), "ETB"));
            loan.setOutstandingInterest(new Money(
                outstandingInterest.subtract(interestPortion), "ETB"));
        }
        
        // Update total paid
        loan.setTotalPaid(new Money(
            loan.getTotalPaid().getAmount().add(payment.getAmount()),
            "ETB"
        ));
        
        loan.setLastPaymentDate(LocalDate.now());
        
        // Check if fully paid
        if (loan.getOutstandingPrincipal().getAmount().compareTo(BigDecimal.ZERO) == 0 &&
            loan.getOutstandingInterest().getAmount().compareTo(BigDecimal.ZERO) == 0) {
            loan.setStatus(Loan.LoanStatus.PAID_OFF);
            log.info("Loan fully paid off: {}", loanId);

            try { auditService.logAction(null, processedBy, "LOAN_PAID_OFF", "LOAN", loanId,
                "Loan fully paid off"); } catch (Exception ignored) {}
            
            // Auto-release all pledged collateral with explicit audit log per item
            List<Collateral> pledgedCollaterals = collateralRepository.findByLoanId(loanId).stream()
                .filter(c -> c.getStatus() == Collateral.CollateralStatus.PLEDGED)
                .collect(Collectors.toList());
            
            for (Collateral c : pledgedCollaterals) {
                c.setStatus(Collateral.CollateralStatus.RELEASED);
                c.setReleaseDate(LocalDate.now());
                try {
                    if (c.getCollateralType() == Collateral.CollateralType.OWN_SAVINGS
                            && c.getAccountId() != null && c.getPledgedAmount() != null) {
                        accountService.releaseAmount(c.getAccountId(),
                            c.getPledgedAmount().getAmount(), "Loan paid off: " + loanId, processedBy);
                    } else if (c.getCollateralType() == Collateral.CollateralType.GUARANTOR
                            && c.getGuarantorAccountId() != null && c.getGuaranteedAmount() != null) {
                        accountService.releaseAmount(c.getGuarantorAccountId(),
                            c.getGuaranteedAmount().getAmount(), "Guarantor released: loan " + loanId, processedBy);
                    }
                    // Audit log per collateral release
                    try { auditService.logAction(null, processedBy, "RELEASE", "COLLATERAL", c.getId(),
                        "Auto-released on loan payoff. Loan: " + loanId + ", Type: " + c.getCollateralType()); } catch (Exception ignored) {}
                } catch (Exception e) {
                    log.error("Failed to release collateral {} for paid-off loan {}: {}", c.getId(), loanId, e.getMessage());
                    // Don't swallow — rethrow so the transaction rolls back and the issue is visible
                    throw new et.edu.woldia.coop.exception.ValidationException(
                        "Loan is paid off but collateral release failed for " + c.getId() + ": " + e.getMessage());
                }
            }
            collateralRepository.saveAll(pledgedCollaterals);
        } else {
            loan.setStatus(Loan.LoanStatus.ACTIVE);
        }

        // Normalize Money currency fields before saving to avoid null currency constraint issues
        if (loan.getOutstandingPrincipal() != null && loan.getOutstandingPrincipal().getCurrency() == null) {
            loan.setOutstandingPrincipal(new Money(loan.getOutstandingPrincipal().getAmount(), "ETB"));
        }
        if (loan.getOutstandingInterest() != null && loan.getOutstandingInterest().getCurrency() == null) {
            loan.setOutstandingInterest(new Money(loan.getOutstandingInterest().getAmount(), "ETB"));
        }
        if (loan.getTotalPaid() != null && loan.getTotalPaid().getCurrency() == null) {
            loan.setTotalPaid(new Money(loan.getTotalPaid().getAmount(), "ETB"));
        }
        if (loan.getPrincipalAmount() != null && loan.getPrincipalAmount().getCurrency() == null) {
            loan.setPrincipalAmount(new Money(loan.getPrincipalAmount().getAmount(), "ETB"));
        }
        
        loanRepository.save(loan);

        // ── Balance reconciliation check ──────────────────────────────────────
        // Verify stored outstanding = principal - paid principal (within 1 cent tolerance)
        BigDecimal storedOutstandingPrincipal = loan.getOutstandingPrincipal().getAmount();
        BigDecimal storedOutstandingInterest  = loan.getOutstandingInterest().getAmount();
        if (storedOutstandingPrincipal.compareTo(BigDecimal.ZERO) < 0) {
            log.error("RECONCILIATION ERROR: outstandingPrincipal went negative ({}) for loan {}",
                storedOutstandingPrincipal, loanId);
            throw new et.edu.woldia.coop.exception.ValidationException(
                "Internal error: outstanding principal went negative. Payment rejected.");
        }
        if (storedOutstandingInterest.compareTo(BigDecimal.ZERO) < 0) {
            log.error("RECONCILIATION ERROR: outstandingInterest went negative ({}) for loan {}",
                storedOutstandingInterest, loanId);
            throw new et.edu.woldia.coop.exception.ValidationException(
                "Internal error: outstanding interest went negative. Payment rejected.");
        }

        // Outstanding balance after this payment (principal + interest)
        BigDecimal outstandingBalanceAfterPayment = storedOutstandingPrincipal.add(storedOutstandingInterest);

        // Create repayment record
        LoanRepayment repayment = new LoanRepayment();
        repayment.setLoanId(loanId);
        repayment.setPaymentAmount(payment);
        repayment.setPrincipalPaid(principalPaid);
        repayment.setInterestPaid(interestPaid);
        repayment.setPenaltyPaid(new Money(BigDecimal.ZERO, "ETB"));
        repayment.setOutstandingBalanceAfter(outstandingBalanceAfterPayment);
        repayment.setInterestForgiven(interestForgiven);
        repayment.setPaymentDate(LocalDate.now());
        repayment.setProcessedBy(processedBy);
        repayment.setNotes(notes);
        repayment.setConfigVersion(loan.getConfigVersion());
        // Populate legacy NOT NULL columns
        repayment.setAmountAmount(payment.getAmount());
        repayment.setPrincipalPortionAmount(principalPaid.getAmount());
        repayment.setInterestPortionAmount(interestPaid.getAmount());
        repayment.setOutstandingBalanceAfterAmount(outstandingBalanceAfterPayment);
        
        loanRepaymentRepository.save(repayment);
        
        log.info("Repayment recorded: principal={}, interest={}", 
            principalPaid.getAmount(), interestPaid.getAmount());

        try {
            auditService.logAction(null, processedBy, "REPAYMENT", "LOAN", loanId,
                String.format("Repayment of ETB %s recorded. Principal: %s, Interest: %s, Outstanding after: %s%s",
                    paymentAmount.setScale(2, RoundingMode.HALF_UP),
                    principalPaid.getAmount().setScale(2, RoundingMode.HALF_UP),
                    interestPaid.getAmount().setScale(2, RoundingMode.HALF_UP),
                    outstandingBalanceAfterPayment.setScale(2, RoundingMode.HALF_UP),
                    interestForgiven.compareTo(BigDecimal.ZERO) > 0
                        ? ", Interest forgiven (early settlement): ETB " + interestForgiven.setScale(2, RoundingMode.HALF_UP)
                        : ""));
        } catch (Exception ignored) {}

        return warning;
    }
    
    /**
     * Get loan details
     */
    @Transactional(readOnly = true)
    public LoanDto getLoanDetails(UUID loanId) {
        Loan loan = findLoanById(loanId);
        return loanMapper.toDto(loan);
    }

    /**
     * Get all loans, optionally filtered by status
     */
    @Transactional(readOnly = true)
    public org.springframework.data.domain.Page<LoanDto> getAllLoans(String status, org.springframework.data.domain.Pageable pageable) {
        org.springframework.data.domain.Page<Loan> page;
        if (status != null && !status.isBlank()) {
            try {
                Loan.LoanStatus loanStatus = Loan.LoanStatus.valueOf(status);
                page = loanRepository.findByStatus(loanStatus, pageable);
            } catch (IllegalArgumentException e) {
                page = loanRepository.findAll(pageable);
            }
        } else {
            page = loanRepository.findAll(pageable);
        }
        return page.map(loanMapper::toDto);
    }
    
    /**
     * Get repayment history
     */
    @Transactional(readOnly = true)
    public List<LoanRepaymentDto> getRepaymentHistory(UUID loanId) {
        return loanRepaymentRepository.findByLoanIdOrderByPaymentDateDesc(loanId).stream()
            .map(loanRepaymentMapper::toDto)
            .collect(Collectors.toList());
    }
    
    /**
     * Get active loans for member
     */
    @Transactional(readOnly = true)
    public List<LoanDto> getActiveLoansForMember(UUID memberId) {
        return loanRepository.findActiveLoansForMember(memberId).stream()
            .map(loanMapper::toDto)
            .collect(Collectors.toList());
    }
    
    /**
     * Generate amortization schedule for a loan.
     * Uses simple interest: Interest = Principal × AnnualRate × (months/12)
     * Each installment = (Principal + TotalInterest) / durationMonths
     * Split evenly: interestComponent = TotalInterest/months, principalComponent = Principal/months
     * Last installment absorbs any rounding remainder.
     */
    @Transactional(readOnly = true)
    public LoanScheduleDto getLoanSchedule(UUID loanId) {
        Loan loan = findLoanById(loanId);

        if (loan.getStatus() == Loan.LoanStatus.APPROVED ||
            loan.getStatus() == Loan.LoanStatus.CONTRACT_PENDING) {
            throw new ValidationException("Loan has not been disbursed yet");
        }

        BigDecimal principal = loan.getPrincipalAmount().getAmount();
        BigDecimal annualRate = loan.getInterestRate();
        int months = loan.getDurationMonths();

        BigDecimal totalInterest = calculateTotalInterest(principal, annualRate, months);
        BigDecimal totalPayable = principal.add(totalInterest);

        // Monthly installment (rounded to 2 dp)
        BigDecimal monthlyInstallment = totalPayable
            .divide(BigDecimal.valueOf(months), 2, RoundingMode.HALF_UP);

        // Per-installment components (even split; last absorbs rounding)
        BigDecimal monthlyInterest = totalInterest
            .divide(BigDecimal.valueOf(months), 2, RoundingMode.HALF_UP);
        BigDecimal monthlyPrincipal = principal
            .divide(BigDecimal.valueOf(months), 2, RoundingMode.HALF_UP);

        // Fetch actual repayments ordered by date
        List<LoanRepayment> repayments = loanRepaymentRepository
            .findByLoanIdOrderByPaymentDateDesc(loanId);

        // Build a running total of what has actually been paid (principal + interest)
        BigDecimal totalPrincipalPaid = repayments.stream()
            .map(r -> r.getPrincipalPaid().getAmount())
            .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalInterestPaid = repayments.stream()
            .map(r -> r.getInterestPaid().getAmount())
            .reduce(BigDecimal.ZERO, BigDecimal::add);

        LocalDate today = LocalDate.now();
        List<LoanScheduleEntryDto> entries = new java.util.ArrayList<>();

        BigDecimal cumulativePrincipalScheduled = BigDecimal.ZERO;
        BigDecimal cumulativeInterestScheduled = BigDecimal.ZERO;

        for (int i = 1; i <= months; i++) {
            LocalDate dueDate = loan.getFirstPaymentDate().plusMonths(i - 1);

            BigDecimal pComp = monthlyPrincipal;
            BigDecimal iComp = monthlyInterest;

            // Last installment absorbs rounding
            if (i == months) {
                pComp = principal.subtract(cumulativePrincipalScheduled);
                iComp = totalInterest.subtract(cumulativeInterestScheduled);
            }

            BigDecimal installmentAmt = pComp.add(iComp);
            cumulativePrincipalScheduled = cumulativePrincipalScheduled.add(pComp);
            cumulativeInterestScheduled = cumulativeInterestScheduled.add(iComp);

            BigDecimal remPrincipal = principal.subtract(cumulativePrincipalScheduled)
                .max(BigDecimal.ZERO);
            BigDecimal remInterest = totalInterest.subtract(cumulativeInterestScheduled)
                .max(BigDecimal.ZERO);

            // Determine status by comparing cumulative scheduled vs actual paid
            // Use a 1-cent tolerance to avoid false OVERDUE/PARTIAL due to rounding
            String status;
            BigDecimal cumulativeScheduledPrincipal = cumulativePrincipalScheduled;
            BigDecimal cumulativeScheduledInterest = cumulativeInterestScheduled;
            BigDecimal tolerance = new BigDecimal("0.01");

            boolean principalCovered = totalPrincipalPaid.compareTo(cumulativeScheduledPrincipal.subtract(tolerance)) >= 0;
            boolean interestCovered  = totalInterestPaid.compareTo(cumulativeScheduledInterest.subtract(tolerance)) >= 0;

            // If loan is fully paid off, mark all installments as PAID
            if (loan.getStatus() == Loan.LoanStatus.PAID_OFF) {
                status = "PAID";
            } else if (principalCovered && interestCovered) {
                status = "PAID";
            } else if (dueDate.isBefore(today) && (!principalCovered || !interestCovered)) {
                BigDecimal prevCumPrincipal = cumulativeScheduledPrincipal.subtract(pComp);
                BigDecimal prevCumInterest = cumulativeScheduledInterest.subtract(iComp);
                if (totalPrincipalPaid.compareTo(prevCumPrincipal) > 0
                    || totalInterestPaid.compareTo(prevCumInterest) > 0) {
                    status = "PARTIAL";
                } else {
                    status = "OVERDUE";
                }
            } else {
                status = "PENDING";
            }

            LoanScheduleEntryDto entry = new LoanScheduleEntryDto();
            entry.setInstallmentNumber(i);
            entry.setDueDate(dueDate);
            entry.setScheduledPayment(installmentAmt);
            entry.setPrincipalComponent(pComp);
            entry.setInterestComponent(iComp);
            entry.setRemainingPrincipal(remPrincipal);
            entry.setRemainingInterest(remInterest);
            entry.setStatus(status);
            entries.add(entry);
        }

        LoanScheduleDto schedule = new LoanScheduleDto();
        schedule.setLoanId(loanId);
        schedule.setPrincipalAmount(principal);
        schedule.setTotalInterest(totalInterest);
        schedule.setTotalPayable(totalPayable);
        schedule.setMonthlyInstallment(monthlyInstallment);
        schedule.setDurationMonths(months);
        schedule.setDisbursementDate(loan.getDisbursementDate());
        schedule.setMaturityDate(loan.getMaturityDate());
        schedule.setCurrency("ETB");
        schedule.setEntries(entries);

        return schedule;
    }

    /**
     * Calculate total interest
     */
    private BigDecimal calculateTotalInterest(BigDecimal principal, BigDecimal annualRate, Integer months) {
        // Simple interest: Principal × Rate × Time
        BigDecimal years = BigDecimal.valueOf(months).divide(BigDecimal.valueOf(12), 4, RoundingMode.HALF_UP);
        return principal.multiply(annualRate).multiply(years).setScale(2, RoundingMode.HALF_UP);
    }
    
    /**
     * Validate liquidity for disbursement (80% lending limit)
     */
    private void validateLiquidityForDisbursement(BigDecimal loanAmount) {
        SystemConfiguration config = configurationService.getCurrentConfiguration();
        
        BigDecimal totalOutstanding = loanRepository.getTotalOutstandingLoans();
        BigDecimal totalRegularSavings = accountRepository.getTotalBalanceByType(Account.AccountType.REGULAR_SAVING);
        BigDecimal totalNonRegularSavings = accountRepository.getTotalBalanceByType(Account.AccountType.NON_REGULAR_SAVING);
        BigDecimal totalSavings = totalRegularSavings.add(totalNonRegularSavings);

        BigDecimal totalShareCapital = shareRecordRepository.getTotalShareCapital();
        if (totalShareCapital == null) {
            totalShareCapital = BigDecimal.ZERO;
        }

        BigDecimal totalAssets = totalSavings.add(totalShareCapital);

        // Enforce cooperative lending limit: outstanding loans must not exceed (total assets × lending limit %).
        BigDecimal lendingLimitPct = config.getLendingLimitPercentage();
        BigDecimal maxOutstandingAllowed = totalAssets.multiply(lendingLimitPct).setScale(2, RoundingMode.HALF_UP);

        // Current outstanding (ACTIVE/DISBURSED) plus this loan (being disbursed now).
        BigDecimal projectedOutstanding = totalOutstanding.add(loanAmount).setScale(2, RoundingMode.HALF_UP);

        if (projectedOutstanding.compareTo(maxOutstandingAllowed) > 0) {
            BigDecimal remainingCapacity = maxOutstandingAllowed.subtract(totalOutstanding).setScale(2, RoundingMode.HALF_UP);
            throw new ValidationException(String.format(
                "Disbursement exceeds lending limit. Outstanding=%s, Loan=%s, Projected=%s, MaxAllowed=%s (Assets=%s × Limit=%s). Remaining capacity=%s.",
                totalOutstanding.setScale(2, RoundingMode.HALF_UP),
                loanAmount.setScale(2, RoundingMode.HALF_UP),
                projectedOutstanding,
                maxOutstandingAllowed,
                totalAssets.setScale(2, RoundingMode.HALF_UP),
                lendingLimitPct,
                remainingCapacity
            ));
        }

        log.info(
            "Liquidity check passed. Outstanding={} Loan={} Projected={} MaxAllowed={} (Assets={} LimitPct={})",
            totalOutstanding, loanAmount, projectedOutstanding, maxOutstandingAllowed, totalAssets, lendingLimitPct
        );
    }
    
    /**
     * Validate loan amount against savings-based multiplier cap.
     * Members with membership duration >= threshold get a higher multiplier.
     * Cap = regularSavingsBalance × multiplier
     */
    private void validateLoanAmountAgainstSavingsCap(UUID memberId, MemberDto memberDto,
                                                      BigDecimal requestedAmount,
                                                      SystemConfiguration config) {
        // Determine membership duration in months
        int membershipMonths = 0;
        if (memberDto.getRegistrationDate() != null) {
            membershipMonths = (int) java.time.temporal.ChronoUnit.MONTHS.between(
                memberDto.getRegistrationDate(), java.time.LocalDate.now());
        }

        BigDecimal multiplier = membershipMonths >= config.getMembershipDurationThresholdMonths()
            ? config.getLoanMultiplierAboveThreshold()
            : config.getLoanMultiplierBelowThreshold();

        // Get member's regular savings balance
        BigDecimal regularSavings = accountRepository.findByMemberIdAndAccountType(memberId, Account.AccountType.REGULAR_SAVING)
            .map(a -> a.getBalance() != null ? a.getBalance().getAmount() : BigDecimal.ZERO)
            .orElse(BigDecimal.ZERO);

        BigDecimal savingsCap = regularSavings.multiply(multiplier).setScale(2, RoundingMode.HALF_UP);

        if (savingsCap.compareTo(BigDecimal.ZERO) > 0 && requestedAmount.compareTo(savingsCap) > 0) {
            throw new ValidationException(String.format(
                "Loan amount ETB %s exceeds savings-based cap of ETB %s " +
                "(savings: ETB %s × multiplier: %s based on %d months membership).",
                requestedAmount.setScale(2, RoundingMode.HALF_UP),
                savingsCap,
                regularSavings.setScale(2, RoundingMode.HALF_UP),
                multiplier,
                membershipMonths
            ));
        }
    }

    /**
     * Find application by ID or throw exception
     */
    private LoanApplication findApplicationById(UUID id) {
        return loanApplicationRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Loan application not found: " + id));
    }
    
    /**
     * Find loan by ID or throw exception
     */
    private Loan findLoanById(UUID id) {
        return loanRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Loan not found: " + id));
    }
    
    /**
     * Validate collateral sufficiency for loan approval
     */
    private void validateCollateralForLoan(UUID applicationId, BigDecimal loanAmount) {
        List<Collateral> collaterals = collateralRepository.findByApplicationId(applicationId);
        
        if (collaterals.isEmpty()) {
            throw new ValidationException("No collateral provided for loan application");
        }
        
        // Use current policy parameters for collateral rules (LTV, validity windows, age limits, etc.)
        SystemConfiguration config = configurationService.getCurrentConfiguration();

        BigDecimal totalCoverage = BigDecimal.ZERO;
        LocalDate today = LocalDate.now();
        
        for (Collateral collateral : collaterals) {
            // Check if collateral is pledged (active)
            if (collateral.getStatus() == Collateral.CollateralStatus.PENDING_APPROVAL) {
                throw new ValidationException(
                    "External cooperative collateral " + collateral.getId() +
                    " is still pending manager approval. Approve it before approving the loan."
                );
            }
            if (collateral.getStatus() != Collateral.CollateralStatus.PLEDGED) {
                throw new ValidationException(
                    "Collateral " + collateral.getId() + " is not in PLEDGED status"
                );
            }

            // Determine coverage amount based on collateral type
            BigDecimal coverage;
            Collateral.CollateralType type = collateral.getCollateralType();
            if (type == null) {
                throw new ValidationException("Collateral " + collateral.getId() + " has no collateral type");
            }

            switch (type) {
                case OWN_SAVINGS -> {
                    if (collateral.getPledgedAmount() == null || collateral.getPledgedAmount().getAmount() == null) {
                        throw new ValidationException("OWN_SAVINGS collateral " + collateral.getId() + " missing pledged amount");
                    }
                    coverage = collateral.getPledgedAmount().getAmount();
                }
                case GUARANTOR -> {
                    if (collateral.getGuaranteedAmount() == null || collateral.getGuaranteedAmount().getAmount() == null) {
                        throw new ValidationException("GUARANTOR collateral " + collateral.getId() + " missing guaranteed amount");
                    }
                    coverage = collateral.getGuaranteedAmount().getAmount();
                }
                case EXTERNAL_COOPERATIVE -> {
                    // Use declared collateral value for external cooperative coverage
                    if (collateral.getCollateralValue() == null || collateral.getCollateralValue().getAmount() == null) {
                        throw new ValidationException("EXTERNAL_COOPERATIVE collateral " + collateral.getId() + " missing collateral value");
                    }
                    coverage = collateral.getCollateralValue().getAmount();
                }
                case FIXED_ASSET -> {
                    // Fixed assets use LTV against appraised value.
                    if (collateral.getAppraisalDate() == null) {
                        throw new ValidationException("FIXED_ASSET collateral " + collateral.getId() + " has no appraisal date");
                    }
                    if (collateral.getAppraisalValue() == null || collateral.getAppraisalValue().getAmount() == null) {
                        throw new ValidationException("FIXED_ASSET collateral " + collateral.getId() + " missing appraisal value");
                    }

                    // Appraisal validity window
                    int validityMonths = config.getCollateralAppraisalValidityMonths();
                    if (validityMonths > 0) {
                        LocalDate expiry = collateral.getAppraisalDate().plusMonths(validityMonths);
                        if (today.isAfter(expiry)) {
                            throw new ValidationException(
                                "FIXED_ASSET collateral " + collateral.getId() + " appraisal expired on " + expiry
                            );
                        }
                    }

                    // Vehicle age limit for vehicle fixed assets
                    if (collateral.getAssetType() == Collateral.AssetType.VEHICLE && collateral.getVehicleYear() != null) {
                        int vehicleAge = today.getYear() - collateral.getVehicleYear();
                        int maxAge = config.getVehicleAgeLimitYears();
                        if (vehicleAge > maxAge) {
                            throw new ValidationException(
                                "Vehicle collateral " + collateral.getId() +
                                " is too old (age: " + vehicleAge + " years, max: " + maxAge + " years)"
                            );
                        }
                    }

                    BigDecimal ltv = config.getFixedAssetLtvRatio();
                    coverage = collateral.getAppraisalValue().getAmount()
                        .multiply(ltv)
                        .setScale(2, RoundingMode.HALF_UP);
                }
                default -> throw new ValidationException("Unsupported collateral type: " + type);
            }

            if (coverage.compareTo(BigDecimal.ZERO) <= 0) {
                throw new ValidationException("Collateral " + collateral.getId() + " has non-positive coverage amount");
            }

            totalCoverage = totalCoverage.add(coverage);
        }
        
        // Total coverage must meet or exceed requested amount
        if (totalCoverage.compareTo(loanAmount) < 0) {
            throw new ValidationException(
                String.format("Insufficient collateral coverage. Required: %s, Provided: %s",
                    loanAmount, totalCoverage)
            );
        }
        
        log.info("Collateral validation passed for application {}: {} collaterals with total coverage {}",
            applicationId, collaterals.size(), totalCoverage);
    }
    
    /**
     * Transfer documents from LOAN_APPLICATION entity to LOAN entity during disbursement.
     * This ensures documents uploaded during the application phase remain accessible
     * after the loan is disbursed.
     */
    private void transferDocumentsFromApplicationToLoan(UUID applicationId, UUID loanId, String processedBy) {
        log.info("Starting document transfer from application {} to loan {}", applicationId, loanId);
        
        try {
            // Find all documents attached to the loan application
            List<DocumentReference> applicationDocuments = documentReferenceRepository
                .findByEntityTypeAndEntityId("LOAN_APPLICATION", applicationId);
            
            log.info("Found {} total documents for application {}", applicationDocuments.size(), applicationId);
            
            if (applicationDocuments.isEmpty()) {
                log.info("No documents to transfer from application {} to loan {}", applicationId, loanId);
                return;
            }
            
            // Create new document references for the LOAN entity
            // Keep original documents on LOAN_APPLICATION (don't delete)
            List<DocumentReference> loanDocuments = applicationDocuments.stream()
                .filter(doc -> {
                    boolean isActive = doc.getStatus() == DocumentReference.DocumentStatus.ACTIVE;
                    log.debug("Document {}: status={}, isActive={}", doc.getId(), doc.getStatus(), isActive);
                    return isActive;
                })
                .map(doc -> {
                    DocumentReference newDoc = new DocumentReference();
                    newDoc.setDocumentName(doc.getDocumentName());
                    newDoc.setDocumentType(doc.getDocumentType());
                    newDoc.setFilePath(doc.getFilePath()); // Same MinIO object key
                    newDoc.setFileSize(doc.getFileSize());
                    newDoc.setMimeType(doc.getMimeType());
                    newDoc.setEntityType("LOAN"); // Changed from LOAN_APPLICATION to LOAN
                    newDoc.setEntityId(loanId); // Changed from applicationId to loanId
                    newDoc.setUploadDate(doc.getUploadDate());
                    newDoc.setUploadedBy(doc.getUploadedBy());
                    newDoc.setDescription(doc.getDescription());
                    newDoc.setStatus(DocumentReference.DocumentStatus.ACTIVE);
                    log.debug("Creating new document reference for LOAN: name={}, type={}", 
                        newDoc.getDocumentName(), newDoc.getDocumentType());
                    return newDoc;
                })
                .collect(Collectors.toList());
            
            if (loanDocuments.isEmpty()) {
                log.warn("No ACTIVE documents found to transfer from application {} to loan {}", 
                    applicationId, loanId);
                return;
            }
            
            List<DocumentReference> savedDocs = documentReferenceRepository.saveAll(loanDocuments);
            
            log.info("Successfully transferred {} documents from application {} to loan {}. Document IDs: {}", 
                savedDocs.size(), applicationId, loanId, 
                savedDocs.stream().map(d -> d.getId().toString()).collect(Collectors.joining(", ")));
            
            try {
                auditService.logAction(null, processedBy, "TRANSFER", "DOCUMENT", loanId,
                    String.format("Transferred %d documents from application %s to loan %s", 
                        savedDocs.size(), applicationId, loanId));
            } catch (Exception auditEx) {
                log.warn("Failed to log audit entry for document transfer: {}", auditEx.getMessage());
            }
            
        } catch (Exception e) {
            // Log error with full stack trace but don't fail the disbursement
            log.error("Failed to transfer documents from application {} to loan {}: {}", 
                applicationId, loanId, e.getMessage(), e);
        }
    }
}
