use super::AdapterError;

pub(super) const MAX_FRAME_BYTES: usize = 1024 * 1024;
/// Incremental bounded SSE decoding; a partial EOF never becomes a complete response.
#[derive(Default)]
pub(super) struct Decoder {
    pending: Vec<u8>,
    data: String,
    event: String,
    after_cr: bool,
}
impl Decoder {
    pub(super) fn push(&mut self, chunk: &[u8]) -> Result<Vec<(String, String)>, AdapterError> {
        let mut frames = Vec::new();
        for byte in chunk {
            if self.after_cr {
                self.after_cr = false;
                if *byte == b'\n' {
                    continue;
                }
            }
            if matches!(byte, b'\n' | b'\r') {
                self.after_cr = *byte == b'\r';
                let raw = std::mem::take(&mut self.pending);
                let line = std::str::from_utf8(&raw).map_err(|_| AdapterError::Interrupted)?;
                if line.is_empty() {
                    if !self.data.is_empty() {
                        if self.data.ends_with('\n') {
                            self.data.pop();
                        }
                        frames.push((
                            std::mem::take(&mut self.event),
                            std::mem::take(&mut self.data),
                        ));
                    } else {
                        self.event.clear();
                    }
                } else if !line.starts_with(':') {
                    let (key, value) = line.split_once(':').unwrap_or((line, ""));
                    let value = value.strip_prefix(' ').unwrap_or(value);
                    match key {
                        "data" => {
                            self.data.push_str(value);
                            self.data.push('\n');
                        }
                        "event" => {
                            self.event.clear();
                            self.event.push_str(value);
                        }
                        _ => {}
                    }
                }
            } else {
                self.pending.push(*byte);
            }
            if self.pending.len() + self.data.len() + self.event.len() > MAX_FRAME_BYTES {
                return Err(AdapterError::Interrupted);
            }
        }
        Ok(frames)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fragmented_utf8_and_crlf_do_not_duplicate_events() {
        let mut decoder = Decoder::default();
        let mut result = Vec::new();
        for byte in
            ": ping\r\nevent: text\r\ndata: café\r\ndata: next\r\n\r\ndata: incomplete".as_bytes()
        {
            result.extend(decoder.push(&[*byte]).unwrap());
        }
        assert_eq!(result, vec![("text".into(), "café\nnext".into())]);
    }
    #[test]
    fn unterminated_frame_has_a_hard_memory_bound() {
        assert!(
            Decoder::default()
                .push(&vec![b'x'; MAX_FRAME_BYTES + 1])
                .is_err()
        );
    }
}
