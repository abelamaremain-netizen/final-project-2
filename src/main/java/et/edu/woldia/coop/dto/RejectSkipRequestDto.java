package et.edu.woldia.coop.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * Request body for MANAGER rejecting a skip request.
 * The reason is required and must be at least 10 characters (enforced in service layer).
 */
public record RejectSkipRequestDto(
    @NotBlank(message = "Rejection reason is required")
    String reason
) {}
