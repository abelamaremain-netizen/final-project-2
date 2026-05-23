package et.edu.woldia.coop.repository;

import et.edu.woldia.coop.entity.LoanAppeal;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface LoanAppealRepository extends JpaRepository<LoanAppeal, UUID> {

    List<LoanAppeal> findByApplicationIdOrderBySubmissionDateDesc(UUID applicationId);

    List<LoanAppeal> findByMemberIdOrderBySubmissionDateDesc(UUID memberId);

    List<LoanAppeal> findByStatusOrderBySubmissionDateAsc(LoanAppeal.AppealStatus status);

    List<LoanAppeal> findByStatusOrderByReviewDateDesc(LoanAppeal.AppealStatus status);
}