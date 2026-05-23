package et.edu.woldia.coop.service;

import et.edu.woldia.coop.dto.DocumentDto;
import et.edu.woldia.coop.entity.DocumentReference;
import et.edu.woldia.coop.exception.ResourceNotFoundException;
import et.edu.woldia.coop.exception.ValidationException;
import et.edu.woldia.coop.repository.DocumentReferenceRepository;
import io.minio.*;
import io.minio.http.Method;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * Document service backed by MinIO (self-hosted S3-compatible object storage).
 *
 * Upload flow:  browser → backend → MinIO (putObject)
 * Download flow: browser → backend (getPresignedUrl) → browser fetches directly from MinIO
 *
 * Configure via environment variables:
 *   MINIO_ENDPOINT, MINIO_BUCKET, MINIO_ACCESS_KEY, MINIO_SECRET_KEY
 */
@Service
@Slf4j
public class DocumentService {

    private final DocumentReferenceRepository documentRepository;
    private final AuditService auditService;
    private final MinioClient minioClient;

    @Value("${app.document.storage.minio-bucket:coop-documents}")
    private String bucket;

    @Value("${app.document.storage.presigned-url-expiry-minutes:30}")
    private int presignedExpiryMinutes;

    @Value("${app.document.storage.max-size-bytes:10485760}")
    private long maxFileSizeBytes;

    private static final Set<String> ALLOWED_MIME_TYPES = Set.of(
        "application/pdf",
        "image/jpeg", "image/png", "image/gif", "image/webp",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/plain"
    );

    public DocumentService(
            DocumentReferenceRepository documentRepository,
            AuditService auditService,
            @Value("${app.document.storage.minio-endpoint:http://localhost:9000}") String endpoint,
            @Value("${app.document.storage.minio-access-key:minioadmin}") String accessKey,
            @Value("${app.document.storage.minio-secret-key:minioadmin}") String secretKey) {
        this.documentRepository = documentRepository;
        this.auditService = auditService;
        this.minioClient = MinioClient.builder()
            .endpoint(endpoint)
            .credentials(accessKey, secretKey)
            .build();
    }

    // ── Startup: ensure bucket exists ────────────────────────────────────────

    @PostConstruct
    public void ensureBucketExists() {
        try {
            boolean exists = minioClient.bucketExists(
                BucketExistsArgs.builder().bucket(bucket).build());
            if (!exists) {
                minioClient.makeBucket(MakeBucketArgs.builder().bucket(bucket).build());
                log.info("MinIO bucket created: {}", bucket);
            } else {
                log.info("MinIO bucket ready: {}", bucket);
            }
        } catch (Exception e) {
            throw new IllegalStateException(
                "Cannot connect to MinIO or create bucket '" + bucket + "'. " +
                "Check MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY. Error: " + e.getMessage(), e);
        }
    }

    // ── Upload ────────────────────────────────────────────────────────────────

    @Transactional
    public DocumentDto uploadDocument(MultipartFile file, String documentType,
                                      String entityType, UUID entityId,
                                      String description, String uploadedBy) {
        log.info("Uploading document: {} for {} {}", file.getOriginalFilename(), entityType, entityId);

        // Validations
        if (file.isEmpty()) throw new ValidationException("File is empty");

        if (file.getSize() > maxFileSizeBytes) {
            throw new ValidationException(String.format(
                "File size (%.1f MB) exceeds the maximum of %.0f MB",
                file.getSize() / 1_048_576.0, maxFileSizeBytes / 1_048_576.0));
        }

        String contentType = file.getContentType();
        if (contentType == null || !ALLOWED_MIME_TYPES.contains(contentType.toLowerCase())) {
            throw new ValidationException(
                "File type '" + contentType + "' is not allowed. " +
                "Accepted: PDF, images (JPEG/PNG/GIF/WebP), Word, Excel, plain text.");
        }

        // Sanitize filename
        String originalFilename = file.getOriginalFilename();
        if (originalFilename != null) {
            originalFilename = java.nio.file.Paths.get(originalFilename).getFileName().toString();
            originalFilename = originalFilename.replaceAll("[^a-zA-Z0-9._\\-() ]", "_");
        }
        String extension = (originalFilename != null && originalFilename.contains("."))
            ? originalFilename.substring(originalFilename.lastIndexOf(".")).toLowerCase()
            : "";

        // Object key: ENTITY_TYPE/YYYY/MM/<uuid>.<ext>
        LocalDateTime now = LocalDateTime.now();
        String objectKey = String.format("%s/%d/%02d/%s%s",
            sanitize(entityType), now.getYear(), now.getMonthValue(),
            UUID.randomUUID(), extension);

        // Upload to MinIO
        try {
            minioClient.putObject(PutObjectArgs.builder()
                .bucket(bucket)
                .object(objectKey)
                .stream(file.getInputStream(), file.getSize(), -1)
                .contentType(contentType)
                .build());
        } catch (Exception e) {
            log.error("MinIO upload failed: {}", e.getMessage());
            throw new ValidationException("Failed to store document: " + e.getMessage());
        }

        // Save metadata to DB
        DocumentReference doc = new DocumentReference();
        doc.setDocumentName(originalFilename);
        doc.setDocumentType(documentType);
        doc.setFilePath(objectKey);   // stores MinIO object key
        doc.setFileSize(file.getSize());
        doc.setMimeType(contentType);
        doc.setEntityType(entityType);
        doc.setEntityId(entityId);
        doc.setUploadDate(now);
        doc.setUploadedBy(uploadedBy);
        doc.setDescription(description);
        doc.setStatus(DocumentReference.DocumentStatus.ACTIVE);

        DocumentReference saved = documentRepository.save(doc);
        log.info("Document saved: {} → MinIO key: {}", saved.getId(), objectKey);

        try {
            auditService.logAction(null, uploadedBy, "CREATE", "DOCUMENT", saved.getId(),
                "Uploaded: " + originalFilename + " (" + documentType + ") for " + entityType + " " + entityId);
        } catch (Exception ignored) {}

        return toDto(saved);
    }

    // ── Presigned URL ─────────────────────────────────────────────────────────

    /**
     * Generate a time-limited presigned URL for direct browser download from MinIO.
     * The URL expires after {@code presignedExpiryMinutes} minutes.
     */
    @Transactional(readOnly = true)
    public String generatePresignedUrl(UUID documentId) {
        DocumentReference doc = documentRepository.findById(documentId)
            .orElseThrow(() -> new ResourceNotFoundException("Document not found: " + documentId));

        if (doc.getStatus() == DocumentReference.DocumentStatus.DELETED) {
            throw new ValidationException("Document has been deleted");
        }

        try {
            return minioClient.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
                .method(Method.GET)
                .bucket(bucket)
                .object(doc.getFilePath())
                .expiry(presignedExpiryMinutes, TimeUnit.MINUTES)
                .build());
        } catch (Exception e) {
            log.error("Failed to generate presigned URL for {}: {}", documentId, e.getMessage());
            throw new ValidationException("Failed to generate download URL: " + e.getMessage());
        }
    }

    // ── Metadata ──────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public DocumentDto getDocumentMetadata(UUID documentId) {
        return toDto(documentRepository.findById(documentId)
            .orElseThrow(() -> new ResourceNotFoundException("Document not found: " + documentId)));
    }

    @Transactional(readOnly = true)
    public List<DocumentDto> listDocumentsByEntity(String entityType, UUID entityId) {
        return documentRepository.findByEntityTypeAndEntityId(entityType, entityId).stream()
            .filter(d -> d.getStatus() == DocumentReference.DocumentStatus.ACTIVE)
            .map(this::toDto)
            .collect(Collectors.toList());
    }
    
    @Transactional(readOnly = true)
    public org.springframework.data.domain.Page<DocumentDto> listDocumentsByEntityPaginated(
            String entityType, UUID entityId, int page, int size) {
        org.springframework.data.domain.Pageable pageable = 
            org.springframework.data.domain.PageRequest.of(page, size, 
                org.springframework.data.domain.Sort.by("uploadDate").descending());
        return documentRepository.findByEntityTypeAndEntityId(entityType, entityId, pageable)
            .map(this::toDto);
    }

    @Transactional(readOnly = true)
    public List<DocumentDto> listDocumentsByType(String documentType) {
        return documentRepository.findByDocumentType(documentType).stream()
            .filter(d -> d.getStatus() == DocumentReference.DocumentStatus.ACTIVE)
            .map(this::toDto)
            .collect(Collectors.toList());
    }
    
    @Transactional(readOnly = true)
    public org.springframework.data.domain.Page<DocumentDto> listDocumentsByTypePaginated(
            String documentType, int page, int size) {
        org.springframework.data.domain.Pageable pageable = 
            org.springframework.data.domain.PageRequest.of(page, size,
                org.springframework.data.domain.Sort.by("uploadDate").descending());
        return documentRepository.findByDocumentType(documentType, pageable)
            .map(this::toDto);
    }

    // ── Soft delete ───────────────────────────────────────────────────────────

    @Transactional
    public void deleteDocument(UUID documentId, String deletedBy) {
        DocumentReference doc = documentRepository.findById(documentId)
            .orElseThrow(() -> new ResourceNotFoundException("Document not found: " + documentId));

        // Soft-delete in DB
        doc.setStatus(DocumentReference.DocumentStatus.DELETED);
        documentRepository.save(doc);

        // Remove from MinIO immediately
        try {
            minioClient.removeObject(RemoveObjectArgs.builder()
                .bucket(bucket)
                .object(doc.getFilePath())
                .build());
            log.info("Document removed from MinIO: {}", doc.getFilePath());
        } catch (Exception e) {
            // Log but don't fail — DB record is already soft-deleted
            log.warn("Could not remove MinIO object {}: {}", doc.getFilePath(), e.getMessage());
        }

        log.info("Document deleted: {} by {}", documentId, deletedBy);
        try {
            auditService.logAction(null, deletedBy, "DELETE", "DOCUMENT", documentId,
                "Document deleted: " + doc.getDocumentName());
        } catch (Exception ignored) {}
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private String sanitize(String segment) {
        if (segment == null) return "UNKNOWN";
        return segment.replaceAll("[^a-zA-Z0-9_\\-]", "_").toUpperCase();
    }

    private DocumentDto toDto(DocumentReference doc) {
        DocumentDto dto = new DocumentDto();
        dto.setId(doc.getId());
        dto.setDocumentName(doc.getDocumentName());
        dto.setDocumentType(doc.getDocumentType());
        dto.setFilePath(null); // never expose internal object key
        dto.setFileSize(doc.getFileSize());
        dto.setMimeType(doc.getMimeType());
        dto.setEntityType(doc.getEntityType());
        dto.setEntityId(doc.getEntityId());
        dto.setUploadDate(doc.getUploadDate());
        dto.setUploadedBy(doc.getUploadedBy());
        dto.setDescription(doc.getDescription());
        dto.setStatus(doc.getStatus().name());
        return dto;
    }
}
