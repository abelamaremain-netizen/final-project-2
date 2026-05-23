package et.edu.woldia.coop.service;

import et.edu.woldia.coop.dto.CollateralDto;
import et.edu.woldia.coop.entity.*;
import et.edu.woldia.coop.exception.ResourceNotFoundException;
import et.edu.woldia.coop.exception.ValidationException;
import et.edu.woldia.coop.mapper.CollateralMapper;
import et.edu.woldia.coop.repository.CollateralRepository;
import et.edu.woldia.coop.repository.LoanApplicationRepository;
import et.edu.woldia.coop.repository.LoanRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Service for collateral management operations.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class CollateralService {
    
    private final CollateralRepository collateralRepository;
    private final CollateralMapper collateralMapper;
    private final LoanRepository loanRepository;
    private final LoanApplicationRepository loanApplicationRepository;
    private final AccountService accountService;
    private final AuditService auditService;
    private final ConfigurationService configurationService;
    private final DocumentService documentService;  // ✅ ADD THIS

    /**
     * Add collateral to loan application
     */
    @Transactional
    public CollateralDto addCollateral(UUID applicationId, CollateralDto dto, String processedBy) {
        log.info("Adding collateral to application: {}", applicationId);

        Collateral collateral = collateralMapper.toEntity(dto);
        collateral.setLoanId(applicationId);
        if (collateral.getCollateralType() == Collateral.CollateralType.EXTERNAL_COOPERATIVE) {
            collateral.setStatus(Collateral.CollateralStatus.PENDING_APPROVAL);
        } else {
            collateral.setStatus(Collateral.CollateralStatus.PLEDGED);
        }
        collateral.setPledgeDate(LocalDate.now());

        // ── Pre-save validations ──────────────────────────────────────────────
        if (collateral.getCollateralType() == Collateral.CollateralType.OWN_SAVINGS) {
            if (collateral.getAccountId() == null)
                throw new ValidationException("OWN_SAVINGS collateral requires an account ID");
            if (collateral.getPledgedAmount() == null || collateral.getPledgedAmount().getAmount() == null)
                throw new ValidationException("OWN_SAVINGS collateral requires a pledged amount");
        }

        if (collateral.getCollateralType() == Collateral.CollateralType.GUARANTOR) {
            if (collateral.getGuarantorMemberId() == null)
                throw new ValidationException("GUARANTOR collateral requires a guarantor member ID");
            if (collateral.getGuarantorAccountId() == null)
                throw new ValidationException("GUARANTOR collateral requires the guarantor's account ID");
            if (collateral.getGuaranteedAmount() == null || collateral.getGuaranteedAmount().getAmount() == null)
                throw new ValidationException("GUARANTOR collateral requires a guaranteed amount");
        }

        if (collateral.getCollateralType() == Collateral.CollateralType.EXTERNAL_COOPERATIVE) {
            if (collateral.getExternalCooperativeName() == null || collateral.getExternalCooperativeName().isBlank())
                throw new ValidationException("EXTERNAL_COOPERATIVE collateral requires the cooperative name");
            // ✅ REMOVED: verificationDocument validation (uploaded after creation)
            if (collateral.getCollateralValue() == null || collateral.getCollateralValue().getAmount() == null
                    || collateral.getCollateralValue().getAmount().compareTo(java.math.BigDecimal.ZERO) <= 0)
                throw new ValidationException("EXTERNAL_COOPERATIVE collateral requires a positive collateral value");
        }

        if (collateral.getCollateralType() == Collateral.CollateralType.FIXED_ASSET
                && collateral.getAssetType() == Collateral.AssetType.VEHICLE
                && collateral.getVehicleYear() != null) {
            int currentYear = LocalDate.now().getYear();
            if (collateral.getVehicleYear() > currentYear)
                throw new ValidationException("Vehicle year cannot be in the future");
            if (collateral.getVehicleYear() < 1900)
                throw new ValidationException("Vehicle year is not valid");
        }

        // ── Save ──────────────────────────────────────────────────────────────
        Collateral saved = collateralRepository.save(collateral);

        // ── Over-coverage check ───────────────────────────────────────────────
        // ✅ UNWRAPPED from lambda - exception now properly triggers rollback
        if (collateral.getCollateralType() != Collateral.CollateralType.FIXED_ASSET) {
            try {
                LoanApplication app = loanApplicationRepository.findById(applicationId).orElse(null);
                if (app != null) {
                    java.math.BigDecimal loanAmount = app.getRequestedAmount().getAmount();
                    java.math.BigDecimal existingCoverage = collateralRepository.findByApplicationId(applicationId).stream()
                            .filter(c -> !c.getId().equals(saved.getId()))
                            .filter(c -> c.getStatus() == Collateral.CollateralStatus.PLEDGED)
                            .map(c -> {
                                if (c.getCollateralType() == Collateral.CollateralType.OWN_SAVINGS && c.getPledgedAmount() != null)
                                    return c.getPledgedAmount().getAmount();
                                if (c.getCollateralType() == Collateral.CollateralType.GUARANTOR && c.getGuaranteedAmount() != null)
                                    return c.getGuaranteedAmount().getAmount();
                                if (c.getCollateralValue() != null) return c.getCollateralValue().getAmount();
                                return java.math.BigDecimal.ZERO;
                            })
                            .reduce(java.math.BigDecimal.ZERO, java.math.BigDecimal::add);

                    java.math.BigDecimal newCoverage = java.math.BigDecimal.ZERO;
                    if (collateral.getCollateralType() == Collateral.CollateralType.OWN_SAVINGS && collateral.getPledgedAmount() != null)
                        newCoverage = collateral.getPledgedAmount().getAmount();
                    else if (collateral.getCollateralType() == Collateral.CollateralType.GUARANTOR && collateral.getGuaranteedAmount() != null)
                        newCoverage = collateral.getGuaranteedAmount().getAmount();
                    else if (collateral.getCollateralValue() != null)
                        newCoverage = collateral.getCollateralValue().getAmount();

                    if (existingCoverage.add(newCoverage).compareTo(loanAmount) > 0) {
                        // ✅ Thrown directly, not inside lambda - rollback WILL work
                        throw new ValidationException(
                                "Total collateral coverage (ETB " + existingCoverage.add(newCoverage).setScale(2, java.math.RoundingMode.HALF_UP) +
                                        ") would exceed the loan amount (ETB " + loanAmount.setScale(2, java.math.RoundingMode.HALF_UP) +
                                        "). Only fixed assets may exceed the loan amount."
                        );
                    }
                }
            } catch (ValidationException ve) {
                throw ve; // Re-throw to trigger rollback
            }
        }

        // ── Lock funds ────────────────────────────────────────────────────────
        if (saved.getCollateralType() == Collateral.CollateralType.OWN_SAVINGS
                && saved.getAccountId() != null
                && saved.getPledgedAmount() != null) {
            accountService.pledgeAmount(saved.getAccountId(),
                    saved.getPledgedAmount().getAmount(),
                    "Collateral for application " + applicationId, processedBy);
        } else if (saved.getCollateralType() == Collateral.CollateralType.GUARANTOR
                && saved.getGuarantorAccountId() != null
                && saved.getGuaranteedAmount() != null) {
            accountService.pledgeAmount(saved.getGuarantorAccountId(),
                    saved.getGuaranteedAmount().getAmount(),
                    "Guarantor collateral for application " + applicationId, processedBy);
        }

        log.info("Collateral added: {} for application {}", saved.getId(), applicationId);

        try { auditService.logAction(null, processedBy, "CREATE", "COLLATERAL", saved.getId(),
                "Collateral added (" + saved.getCollateralType() + ") for application " + applicationId); } catch (Exception ignored) {}

        return collateralMapper.toDto(saved);
    }

    /**
     * Get all pending external cooperative collaterals awaiting manager approval
     */
    @Transactional(readOnly = true)
    public Page<CollateralDto> getPendingExternalCollaterals(int page, int size) {
        Pageable pageable = PageRequest.of(page, size, Sort.by("pledgeDate").ascending());
        return collateralRepository.findByCollateralTypeAndStatus(
                        Collateral.CollateralType.EXTERNAL_COOPERATIVE,
                        Collateral.CollateralStatus.PENDING_APPROVAL,
                        pageable)
                .map(collateralMapper::toDto);
    }
    
    /**
     * Approve external cooperative collateral (MANAGER only)
     */
    @Transactional
    public CollateralDto approveExternalCollateral(UUID id, String approvedBy) {
        log.info("Approving external cooperative collateral: {}", id);

        Collateral collateral = findCollateralById(id);

        if (collateral.getCollateralType() != Collateral.CollateralType.EXTERNAL_COOPERATIVE) {
            throw new ValidationException("Only EXTERNAL_COOPERATIVE collateral requires approval");
        }
        if (collateral.getStatus() != Collateral.CollateralStatus.PENDING_APPROVAL) {
            throw new ValidationException("Collateral is not pending approval (status: " + collateral.getStatus() + ")");
        }

        collateral.setStatus(Collateral.CollateralStatus.PLEDGED);
        Collateral saved = collateralRepository.save(collateral);

        log.info("External cooperative collateral approved: {} by {}", id, approvedBy);
        try { auditService.logAction(null, approvedBy, "APPROVE", "COLLATERAL", id,
            "External cooperative collateral approved"); } catch (Exception ignored) {}

        return collateralMapper.toDto(saved);
    }

    /**
     * Get all collateral for loan application
     */
    @Transactional(readOnly = true)
    public List<CollateralDto> getCollateralForApplication(UUID applicationId) {
        return collateralRepository.findByApplicationId(applicationId).stream()
            .map(collateralMapper::toDto)
            .collect(Collectors.toList());
    }
    
    /**
     * Get all collateral for loan
     */
    @Transactional(readOnly = true)
    public List<CollateralDto> getCollateralForLoan(UUID loanId) {
        return collateralRepository.findByLoanId(loanId).stream()
            .map(collateralMapper::toDto)
            .collect(Collectors.toList());
    }
    
    /**
     * Get collateral by ID
     */
    @Transactional(readOnly = true)
    public CollateralDto getCollateralById(UUID id) {
        Collateral collateral = findCollateralById(id);
        return collateralMapper.toDto(collateral);
    }
    
    /**
     * Update collateral
     */
    @Transactional
    public CollateralDto updateCollateral(UUID id, CollateralDto dto, String updatedBy) {
        log.info("Updating collateral: {}", id);

        Collateral collateral = findCollateralById(id);

        if (collateral.getStatus() == Collateral.CollateralStatus.RELEASED ||
                collateral.getStatus() == Collateral.CollateralStatus.LIQUIDATED) {
            throw new ValidationException("Cannot update collateral that has been released or liquidated");
        }

        // ✅ Only update fields that are provided (not null)
        if (dto.getCollateralType() != null) {
            collateral.setCollateralType(Collateral.CollateralType.valueOf(dto.getCollateralType()));
        }
        if (dto.getCollateralValue() != null) {
            collateral.setCollateralValue(new Money(dto.getCollateralValue(), "ETB"));
        }
        if (dto.getAppraisalValue() != null) {
            collateral.setAppraisalValue(new Money(dto.getAppraisalValue(), "ETB"));
        }
        if (dto.getAppraisalDate() != null) {
            collateral.setAppraisalDate(dto.getAppraisalDate());
        }
        if (dto.getAppraisedBy() != null) {
            collateral.setAppraisedBy(dto.getAppraisedBy());
        }
        if (dto.getAssetDescription() != null) {
            collateral.setAssetDescription(dto.getAssetDescription());
        }
        if (dto.getAccountId() != null) {
            collateral.setAccountId(dto.getAccountId());
        }
        if (dto.getPledgedAmount() != null) {
            collateral.setPledgedAmount(new Money(dto.getPledgedAmount(), "ETB"));
        }
        if (dto.getGuarantorMemberId() != null) {
            collateral.setGuarantorMemberId(dto.getGuarantorMemberId());
        }
        if (dto.getGuarantorAccountId() != null) {
            collateral.setGuarantorAccountId(dto.getGuarantorAccountId());
        }
        if (dto.getGuaranteedAmount() != null) {
            collateral.setGuaranteedAmount(new Money(dto.getGuaranteedAmount(), "ETB"));
        }
        if (dto.getExternalCooperativeName() != null) {
            collateral.setExternalCooperativeName(dto.getExternalCooperativeName());
        }
        if (dto.getExternalAccountNumber() != null) {
            collateral.setExternalAccountNumber(dto.getExternalAccountNumber());
        }
        if (dto.getVerificationDocument() != null) {
            collateral.setVerificationDocument(dto.getVerificationDocument());
        }
        if (dto.getAssetType() != null) {
            collateral.setAssetType(Collateral.AssetType.valueOf(dto.getAssetType()));
        }
        if (dto.getVehicleYear() != null) {
            collateral.setVehicleYear(dto.getVehicleYear());
        }

        Collateral updated = collateralRepository.save(collateral);

        log.info("Collateral updated: {}", id);
        try { auditService.logAction(null, updatedBy, "UPDATE", "COLLATERAL", id,
                "Collateral updated"); } catch (Exception ignored) {}

        return collateralMapper.toDto(updated);
    }
    
    /**
     * Delete collateral
     */
    @Transactional
    public void deleteCollateral(UUID id) {
        log.info("Deleting collateral: {}", id);
        
        Collateral collateral = findCollateralById(id);
        
        if (collateral.getStatus() == Collateral.CollateralStatus.PLEDGED) {
            throw new ValidationException("Cannot delete pledged collateral");
        }
        
        collateralRepository.delete(collateral);
        
        log.info("Collateral deleted: {}", id);
    }
    
    /**
     * Release collateral
     */
    @Transactional
    public void releaseCollateral(UUID id, String releasedBy) {
        log.info("Releasing collateral: {}", id);
        
        Collateral collateral = findCollateralById(id);
        
        if (collateral.getStatus() == Collateral.CollateralStatus.RELEASED) {
            throw new ValidationException("Collateral is already released");
        }
        
        if (collateral.getStatus() == Collateral.CollateralStatus.LIQUIDATED) {
            throw new ValidationException("Cannot release liquidated collateral");
        }

        // Business rule: collateral can only be released after the linked loan is fully paid off.
        UUID loanId = collateral.getLoanId();
        Loan loan = loanRepository.findById(loanId)
            .orElseThrow(() -> new ValidationException(
                "Collateral is not linked to an existing loan (loanId=" + loanId + "). Cannot release."
            ));
        if (loan.getStatus() != Loan.LoanStatus.PAID_OFF) {
            throw new ValidationException(
                "Cannot release collateral unless loan is PAID_OFF. Current loan status: " + loan.getStatus()
            );
        }
        
        collateral.setStatus(Collateral.CollateralStatus.RELEASED);
        collateral.setReleaseDate(LocalDate.now());
        
        collateralRepository.save(collateral);
        
        // Release the locked amount on the account
        try {
            if (collateral.getCollateralType() == Collateral.CollateralType.OWN_SAVINGS
                    && collateral.getAccountId() != null
                    && collateral.getPledgedAmount() != null) {
                accountService.releaseAmount(collateral.getAccountId(),
                    collateral.getPledgedAmount().getAmount(),
                    "Collateral released: " + id, releasedBy);
            } else if (collateral.getCollateralType() == Collateral.CollateralType.GUARANTOR
                    && collateral.getGuarantorAccountId() != null
                    && collateral.getGuaranteedAmount() != null) {
                accountService.releaseAmount(collateral.getGuarantorAccountId(),
                    collateral.getGuaranteedAmount().getAmount(),
                    "Guarantor collateral released: " + id, releasedBy);
            }
        } catch (Exception e) {
            log.warn("Could not release pledged amount on account for collateral {}: {}", id, e.getMessage());
        }
        
        log.info("Collateral released: {} by {}", id, releasedBy);

        try { auditService.logAction(null, releasedBy, "RELEASE", "COLLATERAL", id,
            "Collateral released for loan " + collateral.getLoanId()); } catch (Exception ignored) {}
    }
    
    /**
     * Liquidate collateral
     */
    @Transactional
    public void liquidateCollateral(UUID id, String liquidatedBy) {
        log.info("Liquidating collateral: {}", id);
        
        Collateral collateral = findCollateralById(id);
        
        if (collateral.getStatus() == Collateral.CollateralStatus.LIQUIDATED) {
            throw new ValidationException("Collateral is already liquidated");
        }
        
        if (collateral.getStatus() == Collateral.CollateralStatus.RELEASED) {
            throw new ValidationException("Cannot liquidate released collateral");
        }

        // Business rule: collateral can only be liquidated when the linked loan is defaulted.
        UUID loanId = collateral.getLoanId();
        Loan loan = loanRepository.findById(loanId)
            .orElseThrow(() -> new ValidationException(
                "Collateral is not linked to an existing loan (loanId=" + loanId + "). Cannot liquidate."
            ));
        if (loan.getStatus() != Loan.LoanStatus.DEFAULTED) {
            throw new ValidationException(
                "Cannot liquidate collateral unless loan is DEFAULTED. Current loan status: " + loan.getStatus()
            );
        }
        
        collateral.setStatus(Collateral.CollateralStatus.LIQUIDATED);
        
        collateralRepository.save(collateral);
        
        log.info("Collateral liquidated: {} by {}", id, liquidatedBy);

        try { auditService.logAction(null, liquidatedBy, "LIQUIDATE", "COLLATERAL", id,
            "Collateral liquidated for defaulted loan " + collateral.getLoanId()); } catch (Exception ignored) {}
    }
    
    /**
     * Find collateral by ID or throw exception
     */
    private Collateral findCollateralById(UUID id) {
        return collateralRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Collateral not found with ID: " + id));
    }
}
