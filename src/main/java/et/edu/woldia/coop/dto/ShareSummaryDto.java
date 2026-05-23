package et.edu.woldia.coop.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * DTO for share capital summary statistics
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ShareSummaryDto {
    private Integer totalMembers;
    private Integer totalShares;
    private BigDecimal totalValue;
    private Integer averageSharesPerMember;
    private BigDecimal currentPricePerShare;
    private List<RecentShareTransaction> recentTransactions;
    
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RecentShareTransaction {
        private String id;
        private String type; // PURCHASE or TRANSFER
        private String memberName;
        private Integer shares;
        private LocalDateTime date;
        private BigDecimal amount;
    }
}
