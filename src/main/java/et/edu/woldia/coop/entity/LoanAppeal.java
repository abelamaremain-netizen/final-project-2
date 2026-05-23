package et.edu.woldia.coop.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "loan_appeals")
@Data
public class LoanAppeal {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private UUID applicationId;

    @Column(nullable = false)
    private UUID memberId;

    @Column(nullable = false, length = 2000)
    private String appealReason;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AppealStatus status = AppealStatus.PENDING;

    @CreationTimestamp
    private LocalDateTime submissionDate;

    @Enumerated(EnumType.STRING)
    private AppealDecision decision;

    private LocalDateTime decisionDate;

    private String decisionNotes;

    private String recordedBy;      // Manager who made final decision

    private String reviewedBy;      // Manager who picked it up

    private LocalDateTime reviewDate;

    private Integer assignedQueuePosition;  // Only set if APPROVED

    @Column(nullable = false)
    private String processedBy;

    public enum AppealStatus {
        PENDING, UNDER_REVIEW, DECIDED
    }

    public enum AppealDecision {
        APPROVED, REJECTED
    }
}