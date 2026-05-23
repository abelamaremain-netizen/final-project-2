package et.edu.woldia.coop.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Generates sequential short codes for business entities.
 * Each entity type has its own sequence prefix and independent counter.
 * PostgreSQL sequences are used for thread-safe code generation.
 */
@Service
public class CodeGenerator {

    private final JdbcTemplate jdbcTemplate;

    public CodeGenerator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * Generate the next code for a given prefix.
     * Format: {PREFIX}-{PADDED_NUMBER} e.g. MEM-00001, ACC-00042, LOA-00100
     */
    public String generateCode(String prefix) {
        String sequenceName = prefix.toLowerCase() + "_code_seq";
        Long nextVal = jdbcTemplate.queryForObject(
            "SELECT NEXTVAL('" + sequenceName + "')",
            Long.class
        );
        if (nextVal == null) nextVal = 1L;
        return prefix + "-" + String.format("%05d", nextVal);
    }

    /**
     * Generate the next member code: MEM-00001, MEM-00002, etc.
     */
    public String nextMemberCode() {
        return generateCode("MEM");
    }

    /**
     * Generate the next account code: ACC-00001, ACC-00002, etc.
     */
    public String nextAccountCode() {
        return generateCode("ACC");
    }

    /**
     * Generate the next loan code: LOA-00001, LOA-00002, etc.
     */
    public String nextLoanCode() {
        return generateCode("LOA");
    }
}