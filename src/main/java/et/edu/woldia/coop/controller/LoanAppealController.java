package et.edu.woldia.coop.controller;

import et.edu.woldia.coop.dto.LoanAppealDto;
import et.edu.woldia.coop.dto.LoanAppealRequestDto;
import et.edu.woldia.coop.entity.LoanAppeal;
import et.edu.woldia.coop.service.LoanAppealService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/loans/appeals")
@RequiredArgsConstructor
@Tag(name = "Loan Appeals", description = "Loan appeal management API")
@SecurityRequirement(name = "bearerAuth")
public class LoanAppealController {

    private final LoanAppealService loanAppealService;

    @PostMapping
    @PreAuthorize("hasAnyRole('MANAGER', 'LOAN_OFFICER', 'MEMBER_OFFICER')")
    @Operation(summary = "Submit appeal")
    public ResponseEntity<UUID> submitAppeal(
            @Valid @RequestBody LoanAppealRequestDto dto,
            @RequestParam UUID memberId) {
        UUID appealId = loanAppealService.submitAppeal(dto.getApplicationId(), dto.getAppealReason(), memberId);
        return ResponseEntity.status(HttpStatus.CREATED).body(appealId);
    }

    @PostMapping("/{id}/pickup")
    @PreAuthorize("hasRole('MANAGER')")
    @Operation(summary = "Pick up appeal for review")
    public ResponseEntity<Void> pickUpAppeal(
            @PathVariable UUID id,
            Authentication authentication) {
        loanAppealService.pickUpAppeal(id, authentication.getName());
        return ResponseEntity.ok().build();
    }

    @PostMapping("/{id}/decision")
    @PreAuthorize("hasRole('MANAGER')")
    @Operation(summary = "Record appeal decision")
    public ResponseEntity<Void> recordDecision(
            @PathVariable UUID id,
            @RequestParam LoanAppeal.AppealDecision decision,
            @RequestParam(required = false) String decisionNotes,
            Authentication authentication) {
        loanAppealService.recordDecision(id, decision, decisionNotes, authentication.getName());
        return ResponseEntity.ok().build();
    }

    @GetMapping("/pending")
    @PreAuthorize("hasAnyRole('MANAGER', 'LOAN_OFFICER')")
    @Operation(summary = "Get pending appeals")
    public ResponseEntity<List<LoanAppealDto>> getPendingAppeals() {
        List<LoanAppealDto> appeals = loanAppealService.getAllActiveAppeals();
        return ResponseEntity.ok(appeals);
    }

    @GetMapping("/application/{applicationId}")
    @PreAuthorize("hasAnyRole('MANAGER', 'LOAN_OFFICER')")
    @Operation(summary = "Get appeals for application")
    public ResponseEntity<List<LoanAppealDto>> getAppealsForApplication(@PathVariable UUID applicationId) {
        List<LoanAppealDto> appeals = loanAppealService.getAppealsForApplication(applicationId);
        return ResponseEntity.ok(appeals);
    }

    @GetMapping("/member/{memberId}")
    @PreAuthorize("hasAnyRole('MANAGER', 'LOAN_OFFICER')")
    @Operation(summary = "Get appeals for member")
    public ResponseEntity<List<LoanAppealDto>> getAppealsForMember(@PathVariable UUID memberId) {
        List<LoanAppealDto> appeals = loanAppealService.getAppealsForMember(memberId);
        return ResponseEntity.ok(appeals);
    }
}