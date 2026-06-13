#![forbid(unsafe_code)]

use ironloom_schemas::{check_schema_files, write_schema_files};

#[test]
fn generated_schema_files_are_stable_after_write() {
    let temp = tempfile::tempdir().expect("temporary schema directory should be created");
    write_schema_files(temp.path()).expect("schema files should be written");

    check_schema_files(temp.path()).expect("freshly written schema files should pass drift check");
}

#[test]
fn generated_domain_string_schemas_reject_empty_values() {
    let temp = tempfile::tempdir().expect("temporary schema directory should be created");
    write_schema_files(temp.path()).expect("schema files should be written");

    let branch_schema = std::fs::read_to_string(
        temp.path()
            .join("crates/ironloom-core/schemas/branch-name.schema.json"),
    )
    .expect("branch name schema should be readable");

    assert!(
        branch_schema.contains("\"minLength\": 1"),
        "branch name schema should preserve the non-empty domain invariant"
    );
}
