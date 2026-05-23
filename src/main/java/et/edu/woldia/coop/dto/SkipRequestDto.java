package et.edu.woldia.coop.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * Request body for LOAN_OFFICER skip request submission.
 */
public record SkipRequestDto(
    @NotBlank(message = "Reason is required")
    String reason
) {}
