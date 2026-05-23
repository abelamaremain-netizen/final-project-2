package et.edu.woldia.coop.repository;

import et.edu.woldia.coop.entity.DocumentReference;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Repository for DocumentReference entity.
 */
@Repository
public interface DocumentReferenceRepository extends JpaRepository<DocumentReference, UUID> {
    
    List<DocumentReference> findByEntityTypeAndEntityId(String entityType, UUID entityId);
    
    Page<DocumentReference> findByEntityTypeAndEntityId(String entityType, UUID entityId, Pageable pageable);
    
    List<DocumentReference> findByDocumentType(String documentType);
    
    Page<DocumentReference> findByDocumentType(String documentType, Pageable pageable);
    
    List<DocumentReference> findByStatus(DocumentReference.DocumentStatus status);
    
    List<DocumentReference> findByUploadedBy(String uploadedBy);

    /** Used by the nightly cleanup job to find stale soft-deleted documents */
    List<DocumentReference> findByStatusAndUploadDateBefore(
        DocumentReference.DocumentStatus status, LocalDateTime cutoff);
}
