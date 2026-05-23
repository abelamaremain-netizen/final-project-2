package et.edu.woldia.coop.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * Request body for direct application skip and disbursement skip operations.
 */
public record SkipReasonDto(
    @NotBlank(message = "Reason is required")
    String reason
) {}
