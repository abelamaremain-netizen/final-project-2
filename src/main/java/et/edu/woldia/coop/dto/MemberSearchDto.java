package et.edu.woldia.coop.dto;

import lombok.Data;

/**
 * DTO for member search and filtering.
 */
@Data
public class MemberSearchDto {

    private String memberType;
    private String status;
    private String nationalId;
    private String phoneNumber;
    private String firstName;
    private String lastName;
    private String code;  // user-facing short code (e.g. M-2024-001)

    // Pagination fields
    private Integer page = 0;
    private Integer size = 20;

    // Sorting
    private String sortBy = "lastName";
    private String sortDirection = "ASC";
}