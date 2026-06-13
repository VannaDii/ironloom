#![forbid(unsafe_code)]

use std::env;
use std::path::PathBuf;

use ironloom_schemas::{SchemaError, check_schema_files, write_schema_files};

fn main() -> Result<(), SchemaError> {
    let args = Args::parse();
    if args.check {
        check_schema_files(&args.root)
    } else {
        write_schema_files(&args.root)
    }
}

struct Args {
    root: PathBuf,
    check: bool,
}

impl Args {
    fn parse() -> Self {
        let mut root = PathBuf::from(".");
        let mut check = false;
        let mut args = env::args().skip(1);
        while let Some(arg) = args.next() {
            match arg.as_str() {
                "--check" => check = true,
                "--root" => {
                    if let Some(value) = args.next() {
                        root = PathBuf::from(value);
                    }
                }
                value => root = PathBuf::from(value),
            }
        }
        Self { root, check }
    }
}
