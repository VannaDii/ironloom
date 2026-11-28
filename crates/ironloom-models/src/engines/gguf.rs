//! Metadata-only guard for the initial single-file GGUF capability. It never reads tensor data.
use crate::providers::AdapterError;
use std::{
    fs::File,
    io::{BufReader, Read, Seek, SeekFrom},
    path::Path,
};
const MAGIC: [u8; 4] = *b"GGUF";
const MAX_METADATA_BYTES: u64 = 256 * 1024 * 1024;
const MAX_KEYS: u64 = 65536;
const MAX_KEY_BYTES: u64 = 4096;
const MAX_ARRAY_ELEMENTS: u64 = 10_000_000;
struct Metadata {
    reader: BufReader<File>,
    limit: u64,
}
impl Metadata {
    fn bytes<const N: usize>(&mut self) -> Result<[u8; N], AdapterError> {
        if self
            .reader
            .stream_position()
            .map_err(|_| AdapterError::Unavailable)?
            .checked_add(N as u64)
            .is_none_or(|end| end > self.limit)
        {
            return Err(AdapterError::Unsupported);
        }
        let mut value = [0; N];
        self.reader
            .read_exact(&mut value)
            .map_err(|_| AdapterError::Unsupported)?;
        Ok(value)
    }
    fn u32(&mut self) -> Result<u32, AdapterError> {
        Ok(u32::from_le_bytes(self.bytes()?))
    }
    fn u64(&mut self) -> Result<u64, AdapterError> {
        Ok(u64::from_le_bytes(self.bytes()?))
    }
    fn skip(&mut self, count: u64) -> Result<(), AdapterError> {
        if self
            .reader
            .stream_position()
            .map_err(|_| AdapterError::Unavailable)?
            .checked_add(count)
            .is_none_or(|end| end > self.limit)
        {
            return Err(AdapterError::Unsupported);
        }
        self.reader
            .seek(SeekFrom::Current(
                i64::try_from(count).map_err(|_| AdapterError::Unsupported)?,
            ))
            .map_err(|_| AdapterError::Unavailable)?;
        Ok(())
    }
    fn value(&mut self, kind: u32) -> Result<Option<u64>, AdapterError> {
        match kind {
            0 => Ok(Some(u64::from(self.bytes::<1>()?[0]))),
            2 => Ok(Some(u64::from(u16::from_le_bytes(self.bytes()?)))),
            4 => Ok(Some(u64::from(self.u32()?))),
            10 => Ok(Some(self.u64()?)),
            1 | 7 => {
                self.skip(1)?;
                Ok(None)
            }
            3 => {
                self.skip(2)?;
                Ok(None)
            }
            5 | 6 => {
                self.skip(4)?;
                Ok(None)
            }
            11 | 12 => {
                self.skip(8)?;
                Ok(None)
            }
            8 => {
                let length = self.u64()?;
                self.skip(length)?;
                Ok(None)
            }
            9 => {
                let element = self.u32()?;
                let count = self.u64()?;
                if count > MAX_ARRAY_ELEMENTS {
                    return Err(AdapterError::Unsupported);
                }
                let width = match element {
                    0 | 1 | 7 => Some(1u64),
                    2 | 3 => Some(2),
                    4..=6 => Some(4),
                    10..=12 => Some(8),
                    8 => None,
                    _ => return Err(AdapterError::Unsupported),
                };
                if let Some(width) = width {
                    self.skip(count.checked_mul(width).ok_or(AdapterError::Unsupported)?)?;
                } else {
                    for _ in 0..count {
                        let length = self.u64()?;
                        self.skip(length)?;
                    }
                }
                Ok(None)
            }
            _ => Err(AdapterError::Unsupported),
        }
    }
}
/// Rejects implicit sibling shards before spawning any helper. Initial support is little-endian
/// GGUF v2/v3; unknown/malformed metadata never permits a load or claims hardware qualification.
pub(super) fn single_file(path: &Path) -> Result<(), AdapterError> {
    let file = File::open(path).map_err(|_| AdapterError::Unavailable)?;
    let limit = file
        .metadata()
        .map_err(|_| AdapterError::Unavailable)?
        .len()
        .min(MAX_METADATA_BYTES);
    let mut metadata = Metadata {
        reader: BufReader::new(file),
        limit,
    };
    if metadata.bytes::<4>()? != MAGIC || !matches!(metadata.u32()?, 2 | 3) {
        return Err(AdapterError::Unsupported);
    }
    let _tensors = metadata.u64()?;
    let keys = metadata.u64()?;
    if keys > MAX_KEYS {
        return Err(AdapterError::Unsupported);
    }
    let mut count_seen = false;
    let mut number_seen = false;
    for _ in 0..keys {
        let length = metadata.u64()?;
        if length > MAX_KEY_BYTES {
            return Err(AdapterError::Unsupported);
        }
        let mut key = Vec::with_capacity(length as usize);
        for _ in 0..length {
            key.push(metadata.bytes::<1>()?[0]);
        }
        let kind = metadata.u32()?;
        let value = metadata.value(kind)?;
        match key.as_slice() {
            b"split.count" => {
                if count_seen || value != Some(1) {
                    return Err(AdapterError::Unsupported);
                }
                count_seen = true;
            }
            b"split.no" => {
                if number_seen || value != Some(0) {
                    return Err(AdapterError::Unsupported);
                }
                number_seen = true;
            }
            _ => {}
        }
    }
    Ok(())
}
