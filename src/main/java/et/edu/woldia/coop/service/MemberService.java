package et.edu.woldia.coop.service;

import et.edu.woldia.coop.dto.MemberDto;
import et.edu.woldia.coop.dto.MemberRegistrationDto;
import et.edu.woldia.coop.dto.MemberSuspensionDto;
import et.edu.woldia.coop.dto.UpdateMemberRequest;
import et.edu.woldia.coop.dto.WithdrawalPayoutDto;
import et.edu.woldia.coop.entity.Account;
import et.edu.woldia.coop.entity.Loan;
import et.edu.woldia.coop.entity.Member;
import et.edu.woldia.coop.entity.MemberSuspension;
import et.edu.woldia.coop.entity.Money;
import et.edu.woldia.coop.entity.SystemConfiguration;
import et.edu.woldia.coop.exception.ResourceNotFoundException;
import et.edu.woldia.coop.exception.ValidationException;
import et.edu.woldia.coop.mapper.MemberMapper;
import et.edu.woldia.coop.mapper.MemberSuspensionMapper;
import et.edu.woldia.coop.repository.AccountRepository;
import et.edu.woldia.coop.repository.LoanRepository;
import et.edu.woldia.coop.repository.MemberRepository;
import et.edu.woldia.coop.repository.MemberSuspensionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class MemberService {

    private final MemberRepository memberRepository;
    private final MemberSuspensionRepository memberSuspensionRepository;
    private final AccountRepository accountRepository;
    private final LoanRepository loanRepository;
    private final AccountService accountService;
    private final MemberMapper memberMapper;
    private final MemberSuspensionMapper memberSuspensionMapper;
    private final ConfigurationService configurationService;
    private final AuditService auditService;
    private final CodeGenerator codeGenerator;

    @Transactional
    public MemberDto registerMember(MemberRegistrationDto dto, String processedBy) {
        log.info("Registering new member: {} {}", dto.getFirstName(), dto.getLastName());

        if (memberRepository.existsByNationalId(dto.getNationalId())) {
            throw new ValidationException("Member with national ID " + dto.getNationalId() + " already exists");
        }

        if (dto.getDateOfBirth() != null) {
            long age = ChronoUnit.YEARS.between(dto.getDateOfBirth(), LocalDate.now());
            if (age < 18) {
                throw new ValidationException(
                        "Member must be at least 18 years old. Date of birth " + dto.getDateOfBirth() +
                                " gives an age of " + age + " years."
                );
            }
        }

        UUID transactionId = UUID.randomUUID();
        SystemConfiguration config = configurationService.lockConfigurationForTransaction(
                "MEMBER_REGISTRATION",
                transactionId,
                processedBy
        );

        Member member = memberMapper.toEntity(dto);
        member.setRegistrationDate(LocalDate.now());
        member.setRegistrationConfigVersion(config.getVersion());

        if ("REGULAR".equals(member.getMemberType())) {
            int requestedShares = dto.getShareCount() != null ? dto.getShareCount() : 0;
            int minimumShares = config.getMinimumSharesRequired();
            if (requestedShares < minimumShares) {
                throw new ValidationException(
                        "Minimum " + minimumShares + " shares required for registration"
                );
            }
            member.setShareCount(requestedShares);
        } else {
            member.setShareCount(0);
        }

        if (member.getCommittedDeduction().getAmount()
                .compareTo(config.getMinimumMonthlyDeduction().getAmount()) < 0) {
            throw new ValidationException(
                    "Committed deduction must be at least " + config.getMinimumMonthlyDeduction().getAmount()
            );
        }

        member.setLastDeductionChangeDate(LocalDate.now());
        member.setStatus(Member.MemberStatus.ACTIVE);
        member.setCode(codeGenerator.nextMemberCode());

        Member saved = memberRepository.save(member);

        accountService.createRegularSavingAccount(saved.getId(), processedBy);

        if ("REGULAR".equals(saved.getMemberType())) {
            accountService.createNonRegularSavingAccount(saved.getId(), processedBy);
        }

        log.info("Member registered successfully: {} with code {} and ID {}",
                saved.getFullName(), saved.getCode(), saved.getId());

        try {
            auditService.logAction(null, processedBy, "CREATE", "MEMBER", saved.getId(),
                    "Member registered: " + saved.getFullName() + " (code: " + saved.getCode() + ")");
        } catch (Exception ignored) {}

        return memberMapper.toDto(saved);
    }

    @Transactional(readOnly = true)
    public MemberDto getMemberById(UUID id) {
        Member member = findMemberById(id);
        return memberMapper.toDto(member);
    }

    @Transactional(readOnly = true)
    public MemberDto getMemberByNationalId(String nationalId) {
        Member member = memberRepository.findByNationalId(nationalId)
                .orElseThrow(() -> new ResourceNotFoundException("Member not found with national ID: " + nationalId));
        return memberMapper.toDto(member);
    }

    @Transactional(readOnly = true)
    public MemberDto getMemberByCode(String code) {
        Member member = memberRepository.findByCode(code)
                .orElseThrow(() -> new ResourceNotFoundException("Member not found with code: " + code));
        return memberMapper.toDto(member);
    }

    @Transactional(readOnly = true)
    public List<MemberDto> getAllMembers() {
        return memberRepository.findAll().stream()
                .map(memberMapper::toDto)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<MemberDto> getActiveMembers() {
        return memberRepository.findByStatus(Member.MemberStatus.ACTIVE).stream()
                .map(memberMapper::toDto)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public Page<MemberDto> getAllMembersPaged(Pageable pageable) {
        return memberRepository.findAll(pageable).map(memberMapper::toDto);
    }

    @Transactional(readOnly = true)
    public Page<MemberDto> searchMembers(String status, String memberType, String search, Pageable pageable) {
        org.springframework.data.domain.Sort sort = org.springframework.data.domain.Sort.by("last_name").ascending();
        Pageable nativePageable = org.springframework.data.domain.PageRequest.of(
                pageable.getPageNumber(), pageable.getPageSize(), sort);
        return memberRepository.searchMembers(status, memberType, search, nativePageable)
                .map(memberMapper::toDto);
    }

    @Transactional
    public MemberDto updateMemberProfile(UUID id, UpdateMemberRequest dto, String updatedBy) {
        Member member = findMemberById(id);

        if (dto.getFirstName() != null) member.setFirstName(dto.getFirstName());
        if (dto.getLastName() != null) member.setLastName(dto.getLastName());
        if (dto.getPhoneNumber() != null) member.setPhoneNumber(dto.getPhoneNumber());
        if (dto.getEmail() != null) member.setEmail(dto.getEmail());
        if (dto.getAddress() != null) member.setAddress(dto.getAddress());
        if (dto.getEmploymentStatus() != null) member.setEmploymentStatus(dto.getEmploymentStatus());

        Member updated = memberRepository.save(member);

        log.info("Member profile updated: {} by {}", id, updatedBy);

        try { auditService.logAction(null, updatedBy, "UPDATE", "MEMBER", id,
                "Member profile updated"); } catch (Exception ignored) {}

        return memberMapper.toDto(updated);
    }

    @Transactional
    public void suspendMember(UUID id, String reason, String suspendedBy) {
        Member member = findMemberById(id);

        if (member.getStatus() == Member.MemberStatus.SUSPENDED) {
            throw new ValidationException("Member is already suspended");
        }

        MemberSuspension suspension = new MemberSuspension();
        suspension.setSuspendedDate(LocalDateTime.now());
        suspension.setReason(reason);
        suspension.setSuspendedBy(suspendedBy);

        member.addSuspension(suspension);
        member.setStatus(Member.MemberStatus.SUSPENDED);

        memberRepository.save(member);

        // Freeze all ACTIVE accounts belonging to this member
        List<Account> accounts = accountRepository.findByMemberId(id);
        for (Account account : accounts) {
            if (account.getStatus() == Account.AccountStatus.ACTIVE) {
                account.setStatus(Account.AccountStatus.FROZEN);
                account.setFrozenBySuspension(true);
                account.setFreezeReason("Member suspended — " + reason);
                account.setUnfreezeReason(null);
                accountRepository.save(account);
                log.info("Account {} frozen due to member suspension: {}", account.getId(), id);
                try {
                    auditService.logAction(null, suspendedBy, "FREEZE", "ACCOUNT", account.getId(),
                            "Account frozen — member suspended. Reason: " + reason);
                } catch (Exception ignored) {}
            }
        }

        log.info("Member suspended: {} by {} for reason: {}", id, suspendedBy, reason);

        try {
            auditService.logAction(null, suspendedBy, "SUSPEND", "MEMBER", id,
                    "Member suspended. Reason: " + reason);
        } catch (Exception ignored) {}
    }

    @Transactional
    public void reactivateMember(UUID id, String reactivatedBy) {
        Member member = findMemberById(id);

        if (member.getStatus() != Member.MemberStatus.SUSPENDED) {
            throw new ValidationException("Member is not suspended");
        }

        List<MemberSuspension> suspensions = memberSuspensionRepository.findByMemberId(id);
        if (!suspensions.isEmpty()) {
            MemberSuspension lastSuspension = suspensions.get(suspensions.size() - 1);
            if (lastSuspension.getReactivatedDate() == null) {
                lastSuspension.setReactivatedDate(LocalDateTime.now());
                lastSuspension.setReactivatedBy(reactivatedBy);
                memberSuspensionRepository.save(lastSuspension);
            }
        }

        member.setStatus(Member.MemberStatus.ACTIVE);
        memberRepository.save(member);

        // Unfreeze only accounts that were frozen by this suspension — leave manually-frozen ones untouched
        List<Account> accounts = accountRepository.findByMemberId(id);
        for (Account account : accounts) {
            if (account.getStatus() == Account.AccountStatus.FROZEN && account.isFrozenBySuspension()) {
                account.setStatus(Account.AccountStatus.ACTIVE);
                account.setFrozenBySuspension(false);
                account.setUnfreezeReason("Member reactivated");
                accountRepository.save(account);
                log.info("Account {} unfrozen due to member reactivation: {}", account.getId(), id);
                try {
                    auditService.logAction(null, reactivatedBy, "UNFREEZE", "ACCOUNT", account.getId(),
                            "Account unfrozen — member reactivated");
                } catch (Exception ignored) {}
            }
        }

        log.info("Member reactivated: {} by {}", id, reactivatedBy);

        try {
            auditService.logAction(null, reactivatedBy, "REACTIVATE", "MEMBER", id,
                    "Member reactivated");
        } catch (Exception ignored) {}
    }

    @Transactional
    public void initiateVoluntaryWithdrawal(UUID id, String reason, String processedBy) {
        Member member = findMemberById(id);

        if (member.getStatus() == Member.MemberStatus.WITHDRAWN) {
            throw new ValidationException("Member has already withdrawn");
        }

        SystemConfiguration config = configurationService.getCurrentConfiguration();
        int minMonths = config.getMinimumMembershipDurationBeforeWithdrawalMonths();
        if (minMonths > 0 && member.getRegistrationDate() != null) {
            long monthsAsMember = ChronoUnit.MONTHS.between(member.getRegistrationDate(), LocalDate.now());
            if (monthsAsMember < minMonths) {
                throw new ValidationException(
                        String.format("Member must be registered for at least %d months before withdrawal. Current duration: %d months.",
                                minMonths, monthsAsMember)
                );
            }
        }

        List<Loan> activeLoans = loanRepository.findActiveLoansForMember(id);
        if (!activeLoans.isEmpty()) {
            BigDecimal outstandingLoans = activeLoans.stream()
                    .map(l -> l.getOutstandingPrincipal().getAmount().add(l.getOutstandingInterest().getAmount()))
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            if (outstandingLoans.compareTo(BigDecimal.ZERO) > 0) {
                throw new ValidationException(
                        "Member has outstanding loans of " + outstandingLoans + " ETB. Settle all loans before withdrawal."
                );
            }
        }

        member.setStatus(Member.MemberStatus.WITHDRAWN);
        memberRepository.save(member);

        accountRepository.findByMemberIdAndAccountType(id, Account.AccountType.REGULAR_SAVING)
                .ifPresent(acc -> {
                    acc.setStatus(Account.AccountStatus.CLOSED);
                    accountRepository.save(acc);
                    log.info("Regular Saving account {} closed for withdrawn member {}", acc.getId(), id);
                    try { auditService.logAction(null, processedBy, "CLOSE", "ACCOUNT", acc.getId(),
                            "Regular Saving account closed — member withdrawal"); } catch (Exception ignored) {}
                });

        log.info("Member withdrawal initiated: {} by {} for reason: {}", id, processedBy, reason);

        try { auditService.logAction(null, processedBy, "WITHDRAWAL_INITIATE", "MEMBER", id,
                "Member voluntary withdrawal initiated. Reason: " + reason); } catch (Exception ignored) {}
    }

    @Transactional(readOnly = true)
    public WithdrawalPayoutDto calculateWithdrawalPayout(UUID id) {
        Member member = findMemberById(id);

        SystemConfiguration config = configurationService.getCurrentConfiguration();

        BigDecimal regularSavingBalance = accountRepository
                .findByMemberIdAndAccountType(id, Account.AccountType.REGULAR_SAVING)
                .map(a -> a.getBalance().getAmount())
                .orElse(BigDecimal.ZERO);

        BigDecimal nonRegularSavingBalance = accountRepository
                .findByMemberIdAndAccountType(id, Account.AccountType.NON_REGULAR_SAVING)
                .map(a -> a.getBalance().getAmount())
                .orElse(BigDecimal.ZERO);

        BigDecimal accruedInterest = BigDecimal.ZERO;

        BigDecimal sharePrice = config.getSharePricePerShare().getAmount();
        BigDecimal shareValue = sharePrice.multiply(BigDecimal.valueOf(member.getShareCount()));

        BigDecimal outstandingLoans = loanRepository.findActiveLoansForMember(id).stream()
                .map(l -> l.getOutstandingPrincipal().getAmount().add(l.getOutstandingInterest().getAmount()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal totalSavings = regularSavingBalance.add(nonRegularSavingBalance);
        BigDecimal processingFees = BigDecimal.ZERO;
        BigDecimal otherDeductions = BigDecimal.ZERO;
        BigDecimal totalDeductions = outstandingLoans.add(processingFees).add(otherDeductions);

        BigDecimal grossPayout = totalSavings.add(shareValue).add(accruedInterest);
        BigDecimal netPayout = grossPayout.subtract(totalDeductions);

        return WithdrawalPayoutDto.builder()
                .memberId(member.getId())
                .memberName(member.getFullName())
                .regularSavingBalance(regularSavingBalance)
                .nonRegularSavingBalance(nonRegularSavingBalance)
                .totalSavings(totalSavings)
                .shareCount(member.getShareCount())
                .sharePrice(sharePrice)
                .shareValue(shareValue)
                .accruedInterest(accruedInterest)
                .outstandingLoans(outstandingLoans)
                .processingFees(processingFees)
                .otherDeductions(otherDeductions)
                .totalDeductions(totalDeductions)
                .grossPayout(grossPayout)
                .netPayout(netPayout)
                .currency("ETB")
                .build();
    }

    @Transactional
    public void increaseDeduction(UUID id, BigDecimal newAmount, String processedBy) {
        Member member = findMemberById(id);

        BigDecimal currentAmount = member.getCommittedDeduction().getAmount();

        if (newAmount.compareTo(currentAmount) <= 0) {
            throw new ValidationException("New deduction amount must be greater than current amount");
        }

        SystemConfiguration config = configurationService.getCurrentConfiguration();
        if (newAmount.compareTo(config.getMinimumMonthlyDeduction().getAmount()) < 0) {
            throw new ValidationException(
                    "Deduction amount must be at least " + config.getMinimumMonthlyDeduction().getAmount()
            );
        }

        member.setCommittedDeduction(new Money(newAmount, "ETB"));
        member.setLastDeductionChangeDate(LocalDate.now());

        memberRepository.save(member);

        log.info("Deduction increased for member {}: {} -> {} by {}",
                id, currentAmount, newAmount, processedBy);

        try { auditService.logAction(null, processedBy, "DEDUCTION_CHANGE", "MEMBER", id,
                "Monthly deduction increased from ETB " + currentAmount + " to ETB " + newAmount); } catch (Exception ignored) {}
    }

    @Transactional
    public void requestDeductionDecrease(UUID id, BigDecimal newAmount, String processedBy) {
        Member member = findMemberById(id);

        BigDecimal currentAmount = member.getCommittedDeduction().getAmount();

        if (newAmount.compareTo(currentAmount) >= 0) {
            throw new ValidationException("New deduction amount must be less than current amount");
        }

        SystemConfiguration config = configurationService.getCurrentConfiguration();
        if (newAmount.compareTo(config.getMinimumMonthlyDeduction().getAmount()) < 0) {
            throw new ValidationException(
                    "Deduction amount must be at least " + config.getMinimumMonthlyDeduction().getAmount()
            );
        }

        validateDeductionDecreaseWaitingPeriod(member, config);

        member.setCommittedDeduction(new Money(newAmount, "ETB"));
        member.setLastDeductionChangeDate(LocalDate.now());

        memberRepository.save(member);

        log.info("Deduction decreased for member {}: {} -> {} by {}",
                id, currentAmount, newAmount, processedBy);

        try { auditService.logAction(null, processedBy, "DEDUCTION_CHANGE", "MEMBER", id,
                "Monthly deduction decreased from ETB " + currentAmount + " to ETB " + newAmount); } catch (Exception ignored) {}
    }

    private void validateDeductionDecreaseWaitingPeriod(Member member, SystemConfiguration config) {
        if (member.getLastDeductionChangeDate() == null) {
            return;
        }

        long monthsSinceLastChange = ChronoUnit.MONTHS.between(
                member.getLastDeductionChangeDate(),
                LocalDate.now()
        );

        int requiredWaitingMonths = config.getDeductionDecreaseWaitingMonths();

        if (monthsSinceLastChange < requiredWaitingMonths) {
            throw new ValidationException(
                    String.format("Must wait %d months before decreasing deduction. Last change was %d months ago.",
                            requiredWaitingMonths, monthsSinceLastChange)
            );
        }
    }

    private Member findMemberById(UUID id) {
        return memberRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Member not found with ID: " + id));
    }

    @Transactional
    public void updateShareCount(UUID memberId, Integer newShareCount) {
        Member member = findMemberById(memberId);
        member.setShareCount(newShareCount);
        memberRepository.save(member);
        log.info("Share count updated for member {}: {}", memberId, newShareCount);
    }

    @Transactional(readOnly = true)
    public Member getMemberEntity(UUID memberId) {
        return findMemberById(memberId);
    }

    @Transactional(readOnly = true)
    public List<MemberSuspensionDto> getSuspensionHistory(UUID memberId) {
        findMemberById(memberId);
        return memberSuspensionRepository.findByMemberId(memberId).stream()
                .map(memberSuspensionMapper::toDto)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public org.springframework.data.domain.Page<MemberSuspensionDto> getSuspensionHistoryPaginated(
            UUID memberId, int page, int size) {
        findMemberById(memberId);
        org.springframework.data.domain.Pageable pageable =
                org.springframework.data.domain.PageRequest.of(page, size);
        return memberSuspensionRepository.findByMemberIdPaginated(memberId, pageable)
                .map(memberSuspensionMapper::toDto);
    }
}