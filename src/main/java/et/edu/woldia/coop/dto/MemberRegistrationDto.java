package et.edu.woldia.coop.dto;

import jakarta.validation.constraints.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
public class MemberRegistrationDto {

    @NotBlank(message = "Member type is required (REGULAR or EXTERNAL_COOPERATIVE)")
    @Pattern(regexp = "^(REGULAR|EXTERNAL_COOPERATIVE)$",
            message = "Member type must be REGULAR or EXTERNAL_COOPERATIVE")
    private String memberType;

    // Personal Info
    @NotBlank(message = "First name is required")
    @Size(max = 100, message = "First name must not exceed 100 characters")
    private String firstName;

    @NotBlank(message = "Last name is required")
    @Size(max = 100, message = "Last name must not exceed 100 characters")
    private String lastName;

    @NotNull(message = "Date of birth is required")
    @Past(message = "Date of birth must be in the past")
    private LocalDate dateOfBirth;

    @NotBlank(message = "National ID is required")
    @Size(max = 50, message = "National ID must not exceed 50 characters")
    private String nationalId;

    @NotBlank(message = "Phone number is required")
    @Pattern(regexp = "^\\+?[0-9]{7,15}$", message = "Phone number must be valid")
    private String phoneNumber;

    @Email(message = "Email must be valid")
    @Size(max = 255, message = "Email must not exceed 255 characters")
    private String email;

    // Address
    @Size(max = 500, message = "Address must not exceed 500 characters")
    private String address;

    // Employment Info
    @NotBlank(message = "Employment status is required")
    private String employmentStatus;

    @NotNull(message = "Committed monthly deduction is required")
    @DecimalMin(value = "0.0", message = "Committed deduction must be positive")
    private BigDecimal committedDeduction;

    // External Cooperative Info (for EXTERNAL_COOPERATIVE type)
    private String externalCooperativeName;
    private String externalCooperativeMemberId;

    // Share purchase (for REGULAR members)
    @Min(value = 0, message = "Share count cannot be negative")
    private Integer shareCount;
}