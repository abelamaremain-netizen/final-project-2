package et.edu.woldia.coop.service;

import et.edu.woldia.coop.dto.LoanAppealDto;
import et.edu.woldia.coop.entity.LoanAppeal;
import et.edu.woldia.coop.entity.LoanApplication;
import et.edu.woldia.coop.exception.ResourceNotFoundException;
import et.edu.woldia.coop.exception.ValidationException;
import et.edu.woldia.coop.mapper.LoanAppealMapper;
import et.edu.woldia.coop.repository.LoanAppealRepository;
import et.edu.woldia.coop.repository.LoanApplicationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class LoanAppealService {

    private final LoanAppealRepository loanAppealRepository;
    private final LoanApplicationRepository loanApplicationRepository;
    private final LoanAppealMapper loanAppealMapper;
    private final AuditService auditService;

    @Transactional
    public UUID submitAppeal(UUID applicationId, String appealReason, UUID memberId) {
        log.info("Submitting appeal for application: {}", applicationId);

        LoanApplication application = loanApplicationRepository.findById(applicationId)
                .orElseThrow(() -> new ResourceNotFoundException("Application not found: " + applicationId));

        if (application.getStatus() != LoanApplication.ApplicationStatus.DENIED) {
            throw new ValidationException("Can only appeal denied applications");
        }

        if (!application.getMemberId().equals(memberId)) {
            throw new ValidationException("Member ID does not match application");
        }

        List<LoanAppeal> existingAppeals = loanAppealRepository.findByApplicationIdOrderBySubmissionDateDesc(applicationId);
        boolean hasPending = existingAppeals.stream()
                .anyMatch(a -> a.getStatus() == LoanAppeal.AppealStatus.PENDING ||
                        a.getStatus() == LoanAppeal.AppealStatus.UNDER_REVIEW);
        if (hasPending) {
            throw new ValidationException("An appeal is already pending for this application");
        }

        LoanAppeal appeal = new LoanAppeal();
        appeal.setApplicationId(applicationId);
        appeal.setMemberId(memberId);
        appeal.setAppealReason(appealReason);
        appeal.setSubmissionDate(LocalDateTime.now());
        appeal.setStatus(LoanAppeal.AppealStatus.PENDING);
        appeal.setProcessedBy(memberId.toString());

        LoanAppeal saved = loanAppealRepository.save(appeal);

        log.info("Appeal submitted: {}", saved.getId());

        try { auditService.logAction(memberId, memberId.toString(), "CREATE", "LOAN_APPEAL", saved.getId(),
                "Appeal submitted for application " + applicationId); } catch (Exception ignored) {}

        return saved.getId();
    }

    @Transactional
    public void pickUpAppeal(UUID appealId, String managerUsername) {
        log.info("Manager {} picking up appeal: {}", managerUsername, appealId);

        LoanAppeal appeal = loanAppealRepository.findById(appealId)
                .orElseThrow(() -> new ResourceNotFoundException("Appeal not found: " + appealId));

        if (appeal.getStatus() != LoanAppeal.AppealStatus.PENDING) {
            throw new ValidationException("Appeal is not in PENDING status");
        }

        appeal.setReviewedBy(managerUsername);
        appeal.setReviewDate(LocalDateTime.now());
        appeal.setStatus(LoanAppeal.AppealStatus.UNDER_REVIEW);

        loanAppealRepository.save(appeal);

        try { auditService.logAction(null, managerUsername, "UPDATE", "LOAN_APPEAL", appealId,
                "Appeal picked up for review"); } catch (Exception ignored) {}
    }

    @Transactional
    public void recordDecision(UUID appealId, LoanAppeal.AppealDecision decision,
                               String decisionNotes, String recordedBy) {
        log.info("Recording decision for appeal: {}", appealId);

        LoanAppeal appeal = loanAppealRepository.findById(appealId)
                .orElseThrow(() -> new ResourceNotFoundException("Appeal not found: " + appealId));

        if (appeal.getStatus() == LoanAppeal.AppealStatus.DECIDED) {
            throw new ValidationException("Appeal has already been decided");
        }

        appeal.setDecision(decision);
        appeal.setDecisionDate(LocalDateTime.now());
        appeal.setDecisionNotes(decisionNotes);
        appeal.setRecordedBy(recordedBy);
        appeal.setStatus(LoanAppeal.AppealStatus.DECIDED);

        loanAppealRepository.save(appeal);

        if (decision == LoanAppeal.AppealDecision.APPROVED) {
            LoanApplication application = loanApplicationRepository.findById(appeal.getApplicationId())
                    .orElseThrow(() -> new ResourceNotFoundException("Application not found"));

            // Find next queue position — same logic as your approval panel
            Integer maxQueue = loanApplicationRepository.findMaxQueuePosition();
            int nextPosition = (maxQueue != null ? maxQueue : 0) + 1;

            application.setStatus(LoanApplication.ApplicationStatus.PENDING);
            application.setQueuePosition(nextPosition);
            loanApplicationRepository.save(application);

            appeal.setAssignedQueuePosition(nextPosition);
            loanAppealRepository.save(appeal);

            log.info("Application {} reset to PENDING with queue position {} after appeal approval",
                    application.getId(), nextPosition);
        }

        try { auditService.logAction(null, recordedBy,
                decision == LoanAppeal.AppealDecision.APPROVED ? "APPROVE" : "DENY",
                "LOAN_APPEAL", appealId,
                "Appeal decision: " + decision + ". Notes: " + decisionNotes); } catch (Exception ignored) {}
    }

    @Transactional(readOnly = true)
    public List<LoanAppealDto> getAllActiveAppeals() {
        List<LoanAppeal> pending = loanAppealRepository.findByStatusOrderBySubmissionDateAsc(LoanAppeal.AppealStatus.PENDING);
        List<LoanAppeal> underReview = loanAppealRepository.findByStatusOrderByReviewDateDesc(LoanAppeal.AppealStatus.UNDER_REVIEW);

        pending.addAll(underReview);

        return pending.stream()
                .map(this::enrichDto)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<LoanAppealDto> getAppealsForApplication(UUID applicationId) {
        return loanAppealRepository.findByApplicationIdOrderBySubmissionDateDesc(applicationId).stream()
                .map(this::enrichDto)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<LoanAppealDto> getAppealsForMember(UUID memberId) {
        return loanAppealRepository.findByMemberIdOrderBySubmissionDateDesc(memberId).stream()
                .map(this::enrichDto)
                .collect(Collectors.toList());
    }

    private LoanAppealDto enrichDto(LoanAppeal appeal) {
        LoanAppealDto dto = loanAppealMapper.toDto(appeal);
        loanApplicationRepository.findById(appeal.getApplicationId()).ifPresent(app -> {
            dto.setDenialReason(app.getDenialReason());
        });
        return dto;
    }
}