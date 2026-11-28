//! Official hub HTTP APIs. No Python SDK, publisher-invented API or inference probe is used.
use super::{
    Sources,
    downloads::{ARCHIVE_FILE, DownloadExecutor, DownloadFile, DownloadFormat, FileCatalog},
};
use crate::{factory::*, providers::AdapterError};
use base64::Engine as _;
use ironloom_core::{ActorId, BoxFuture, Counter};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{sync::Arc, time::Duration};

const MAX_METADATA_BYTES: usize = 4 * 1024 * 1024;
const MODELSCOPE_PAGE_SIZE: u64 = 50;
const MODELSCOPE_WINDOW: u64 = 3000;
/// Official catalog transports; publishers remain separate provenance.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Hub {
    /// Hugging Face Hub REST and revision-pinned resolve URLs.
    HuggingFace,
    /// ModelScope OpenAPI metadata and revision-pinned repository files.
    ModelScope,
    /// Kaggle's model service API; framework/variation/version are retained.
    Kaggle,
}
impl Hub {
    /// Stable host identity used in the common source query/card.
    pub fn id(self) -> &'static str {
        match self {
            Self::HuggingFace => "huggingface",
            Self::ModelScope => "modelscope",
            Self::Kaggle => "kaggle",
        }
    }
    /// Official human catalog; no separate publisher download APIs are assumed.
    pub fn catalog(self) -> &'static str {
        match self {
            Self::HuggingFace => "https://huggingface.co/",
            Self::ModelScope => "https://modelscope.cn/",
            Self::Kaggle => "https://www.kaggle.com/models/",
        }
    }
}
/// Live trusted source credential use; implementations must recheck current grants.
pub trait SourceCredentials: Send + Sync {
    /// Stable selected source-account namespace; changing it invalidates continuation tokens.
    fn account(&self) -> ActorId;
    /// Applies only credentials authorized for this hub request. Never log headers.
    fn authorize(
        &self,
        hub: Hub,
        request: reqwest::RequestBuilder,
    ) -> BoxFuture<'_, Result<reqwest::RequestBuilder, AdapterError>>;
}
/// Public catalog access without pretending a failed configured account is anonymous.
pub struct Anonymous;
impl SourceCredentials for Anonymous {
    fn account(&self) -> ActorId {
        ActorId::new("anonymous").expect("static account")
    }
    fn authorize(
        &self,
        _: Hub,
        request: reqwest::RequestBuilder,
    ) -> BoxFuture<'_, Result<reqwest::RequestBuilder, AdapterError>> {
        Box::pin(async { Ok(request) })
    }
}
/// Official publisher distribution links, separate from the underlying host.
pub const OFFICIAL_PUBLISHERS: [(&str, &str); 3] = [
    ("Alibaba / Qwen", "https://huggingface.co/Qwen"),
    ("Mistral", "https://huggingface.co/mistralai"),
    ("DeepSeek", "https://huggingface.co/deepseek-ai"),
];
/// Source HTTP implementation; constructing it performs no network request.
pub struct HubHttp {
    hub: Hub,
    base: url::Url,
    client: reqwest::Client,
    credentials: Arc<dyn SourceCredentials>,
}
impl HubHttp {
    /// Creates an official source with explicitly selected credentials.
    pub fn official(
        hub: Hub,
        credentials: Arc<dyn SourceCredentials>,
    ) -> Result<Self, AdapterError> {
        let base = match hub {
            Hub::HuggingFace => "https://huggingface.co/",
            Hub::ModelScope => "https://modelscope.cn/",
            Hub::Kaggle => "https://api.kaggle.com/",
        };
        Self::new(
            hub,
            base.parse().map_err(|_| AdapterError::Unavailable)?,
            credentials,
        )
    }
    /// Allows a service-configured mirror or loopback fixture; credential use remains explicit.
    pub fn new(
        hub: Hub,
        base: url::Url,
        credentials: Arc<dyn SourceCredentials>,
    ) -> Result<Self, AdapterError> {
        let local = base.host_str().is_some_and(|h| {
            h == "localhost"
                || h.parse::<std::net::IpAddr>()
                    .is_ok_and(|ip| ip.is_loopback())
        });
        if !(base.scheme() == "https" || (local && base.scheme() == "http"))
            || !base.username().is_empty()
            || base.password().is_some()
        {
            return Err(AdapterError::Unsupported);
        }
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| AdapterError::Unavailable)?;
        Ok(Self {
            hub,
            base,
            client,
            credentials,
        })
    }
    async fn json(
        &self,
        request: reqwest::RequestBuilder,
    ) -> Result<(Value, reqwest::header::HeaderMap), AdapterError> {
        let request = self.credentials.authorize(self.hub, request).await?;
        let mut response = request
            .send()
            .await
            .map_err(|_| AdapterError::Unavailable)?;
        if !response.status().is_success() {
            return Err(AdapterError::Unavailable);
        }
        let headers = response.headers().clone();
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| AdapterError::Unavailable)?
        {
            if bytes.len() + chunk.len() > MAX_METADATA_BYTES {
                return Err(AdapterError::Unavailable);
            }
            bytes.extend(chunk);
        }
        let mut json: Value =
            serde_json::from_slice(&bytes).map_err(|_| AdapterError::Unavailable)?;
        if self.hub == Hub::ModelScope
            && let Some(data) = json.get("data").or(json.get("Data")).cloned()
        {
            json = data;
        }
        Ok((json, headers))
    }
    fn url(&self, path: &str) -> Result<url::Url, AdapterError> {
        self.base.join(path).map_err(|_| AdapterError::Unsupported)
    }
    /// Search the selected source with account/query-bound pagination.
    pub async fn search(&self, query: SourceQuery) -> Result<SourcePage, AdapterError> {
        if query
            .host
            .as_ref()
            .is_some_and(|h| h.as_str() != self.hub.id())
        {
            return SourcePage::new(SourcePageData {
                models: Vec::new(),
                next_after: None,
            })
            .map_err(|_| AdapterError::Unavailable);
        }
        let continuation = self.continuation(&query)?;
        let (models, next) = match self.hub {
            Hub::HuggingFace => {
                let url = if let Some(next) = continuation {
                    let url: url::Url = next.parse().map_err(|_| AdapterError::Unsupported)?;
                    if url.origin() != self.base.origin()
                        || url.path() != self.url("api/models")?.path()
                    {
                        return Err(AdapterError::Unsupported);
                    }
                    url
                } else {
                    let mut url = self.url("api/models")?;
                    {
                        let mut pairs = url.query_pairs_mut();
                        pairs
                            .append_pair("search", &query.query)
                            .append_pair("limit", &query.limit.get().to_string())
                            .append_pair("full", "true")
                            .append_pair("config", "true");
                        if let Some(publisher) = &query.publisher {
                            pairs.append_pair("author", publisher.as_str());
                        }
                    }
                    url
                };
                let (value, headers) = self.json(self.client.get(url)).await?;
                let mut cards = Vec::new();
                for model in value
                    .as_array()
                    .ok_or(AdapterError::Unavailable)?
                    .iter()
                    .take(query.limit.get() as usize)
                {
                    cards.push(self.hf_card(model)?);
                }
                let next = headers
                    .get("link")
                    .and_then(|h| h.to_str().ok())
                    .and_then(next_link);
                (cards, next)
            }
            Hub::ModelScope => {
                let page = continuation
                    .as_deref()
                    .unwrap_or("1")
                    .parse::<u64>()
                    .map_err(|_| AdapterError::Unsupported)?;
                let size = query.limit.get().min(MODELSCOPE_PAGE_SIZE);
                if page == 0 || page.saturating_mul(size) > MODELSCOPE_WINDOW {
                    return Err(AdapterError::Unsupported);
                }
                let mut url = self.url("openapi/v1/models")?;
                {
                    let mut pairs = url.query_pairs_mut();
                    pairs
                        .append_pair("search", &query.query)
                        .append_pair("page_number", &page.to_string())
                        .append_pair("page_size", &size.to_string());
                    if let Some(owner) = &query.publisher {
                        pairs.append_pair("owner", owner.as_str());
                    }
                }
                let (value, _) = self.json(self.client.get(url)).await?;
                let list = value["models"]
                    .as_array()
                    .or(value["items"].as_array())
                    .ok_or(AdapterError::Unavailable)?;
                let mut cards = Vec::new();
                for model in list.iter().take(query.limit.get() as usize) {
                    // Current OpenAPI Model exposes the canonical repository in id, not separate
                    // owner/name fields. Retain the publisher from that validated repository.
                    let repo = model["id"].as_str().ok_or(AdapterError::Unavailable)?;
                    repository(repo, 2)?;
                    let revision = self.git_head(repo).await?;
                    cards.push(self.ms_card(model, repo, &revision)?);
                }
                let total = value["total_count"].as_u64().unwrap_or(0);
                (
                    cards,
                    if page.saturating_mul(size) < total
                        && (page + 1).saturating_mul(size) <= MODELSCOPE_WINDOW
                    {
                        Some((page + 1).to_string())
                    } else {
                        None
                    },
                )
            }
            Hub::Kaggle => {
                // A hub page contains models, each with several versions/variations.
                // Retain an offset within that page so no instance disappears at our card limit.
                let (token, offset) = match continuation {
                    Some(value) => {
                        let value: (String, usize) =
                            serde_json::from_str(&value).map_err(|_| AdapterError::Unsupported)?;
                        value
                    }
                    None => (String::new(), 0),
                };
                let body = json!({"search":query.query,"owner":query.publisher.as_ref().map(ActorId::as_str).unwrap_or(""),"pageSize":query.limit.get(),"pageToken":token});
                let (value, _) = self
                    .json(
                        self.client
                            .post(self.url("v1/models.ModelApiService/ListModels")?)
                            .json(&body),
                    )
                    .await?;
                let mut all = Vec::new();
                for model in value["models"]
                    .as_array()
                    .ok_or(AdapterError::Unavailable)?
                {
                    for instance in model["instances"].as_array().into_iter().flatten() {
                        all.push(self.kaggle_card(model, instance)?);
                    }
                }
                if offset > all.len() {
                    return Err(AdapterError::Unsupported);
                }
                let end = offset
                    .saturating_add(query.limit.get() as usize)
                    .min(all.len());
                let next = if end < all.len() {
                    Some((token, end))
                } else {
                    value["nextPageToken"]
                        .as_str()
                        .filter(|s| !s.is_empty())
                        .map(|s| (s.to_owned(), 0))
                };
                (
                    all[offset..end].to_vec(),
                    next.map(|v| serde_json::to_string(&v).map_err(|_| AdapterError::Unavailable))
                        .transpose()?,
                )
            }
        };
        let next_after = next.map(|next| self.cursor(&query, next)).transpose()?;
        SourcePage::new(SourcePageData { models, next_after })
            .map_err(|_| AdapterError::Unavailable)
    }
    fn cursor(&self, query: &SourceQuery, next: String) -> Result<ActorId, AdapterError> {
        let value = Cursor {
            account: self.credentials.account().as_str().to_owned(),
            hub: self.hub.id().into(),
            query: query.query.clone(),
            publisher: query.publisher.as_ref().map(|p| p.as_str().to_owned()),
            limit: query.limit.get(),
            next,
        };
        let encoded = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .encode(serde_json::to_vec(&value).map_err(|_| AdapterError::Unavailable)?);
        ActorId::new(encoded).map_err(|_| AdapterError::Unavailable)
    }
    fn continuation(&self, query: &SourceQuery) -> Result<Option<String>, AdapterError> {
        let Some(after) = &query.after else {
            return Ok(None);
        };
        if after.as_str().len() > 16384 {
            return Err(AdapterError::Unsupported);
        }
        let decoded = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .decode(after.as_str())
            .map_err(|_| AdapterError::Unsupported)?;
        let cursor: Cursor =
            serde_json::from_slice(&decoded).map_err(|_| AdapterError::Unsupported)?;
        if cursor.account != self.credentials.account().as_str()
            || cursor.hub != self.hub.id()
            || cursor.query != query.query
            || cursor.publisher != query.publisher.as_ref().map(|p| p.as_str().to_owned())
            || cursor.limit != query.limit.get()
        {
            return Err(AdapterError::Unsupported);
        }
        Ok(Some(cursor.next))
    }
    fn hf_card(&self, value: &Value) -> Result<ModelCard, AdapterError> {
        let repo = value["id"].as_str().ok_or(AdapterError::Unavailable)?;
        repository(repo, 2)?;
        let revision = value["sha"].as_str().ok_or(AdapterError::Unavailable)?;
        let source = self.source(
            repo,
            revision,
            value["cardData"]["license"].as_str(),
            access(value),
            format!("https://huggingface.co/{repo}"),
        )?;
        card(
            format!("huggingface:{repo}"),
            repo.into(),
            source,
            value["config"]["model_type"].as_str(),
            weight_format(value),
            value["config"]["quantization_config"]["quant_method"].as_str(),
            value["safetensors"]["total"]
                .as_u64()
                .and_then(|_| value["usedStorage"].as_u64()),
        )
    }
    fn ms_card(
        &self,
        value: &Value,
        repo: &str,
        revision: &str,
    ) -> Result<ModelCard, AdapterError> {
        repository(repo, 2)?;
        if value["id"].as_str() != Some(repo) {
            return Err(AdapterError::Unavailable);
        }
        let source = self.source(
            repo,
            revision,
            value["license"].as_str(),
            access(value),
            format!("https://modelscope.cn/models/{repo}"),
        )?;
        card(
            format!("modelscope:{repo}"),
            repo.into(),
            source,
            value["tags"].as_array().and_then(|tags| {
                tags.iter().filter_map(Value::as_str).find_map(|tag| {
                    tag.strip_prefix("model_type:")
                        .filter(|name| !name.is_empty())
                })
            }),
            None,
            None,
            value["file_size"].as_u64(),
        )
    }
    fn kaggle_card(&self, model: &Value, instance: &Value) -> Result<ModelCard, AdapterError> {
        let repo = model["ref"].as_str().ok_or(AdapterError::Unavailable)?;
        repository(repo, 2)?;
        let framework = instance["framework"]
            .as_str()
            .ok_or(AdapterError::Unavailable)?;
        let variation = instance["slug"].as_str().ok_or(AdapterError::Unavailable)?;
        let version = instance["versionNumber"]
            .as_u64()
            .filter(|v| *v > 0)
            .ok_or(AdapterError::Unavailable)?
            .to_string();
        let full = format!("{repo}/{framework}/{variation}");
        repository(&full, 4)?;
        let source = self.source(
            repo,
            &version,
            instance["licenseName"].as_str(),
            SourceAccess::Accessible,
            format!("https://www.kaggle.com/models/{full}/{version}"),
        )?;
        card(
            format!("kaggle:{full}"),
            full.clone(),
            source,
            None,
            None,
            None,
            instance["totalUncompressedBytes"].as_u64(),
        )
    }
    fn source(
        &self,
        repo: &str,
        revision: &str,
        license: Option<&str>,
        access: SourceAccess,
        url: String,
    ) -> Result<ModelSource, AdapterError> {
        ModelSource::new(ModelSourceData {
            publisher: id(repo.split('/').next().ok_or(AdapterError::Unavailable)?)?,
            host: id(self.hub.id())?,
            repository_url: url,
            revision: id(revision)?,
            checksum: None,
            access,
            license: license
                .filter(|s| !s.trim().is_empty())
                .map(id)
                .transpose()?,
        })
        .map_err(|_| AdapterError::Unavailable)
    }
    /// Resolves current repository metadata; download paths still use their separately pinned revision.
    pub async fn metadata(&self, handle: ActorId) -> Result<ModelSource, AdapterError> {
        let repo = self.repo(&handle)?;
        match self.hub {
            Hub::HuggingFace => {
                let (value, _) = self
                    .json(self.client.get(self.url(&format!("api/models/{repo}"))?))
                    .await?;
                let card = self.hf_card(&value)?;
                let mut source = (*card.source).clone();
                source.access = self
                    .hf_access(&value, repo, source.revision.as_str())
                    .await?;
                ModelSource::new(source).map_err(|_| AdapterError::Unavailable)
            }
            Hub::ModelScope => {
                let (value, _) = self
                    .json(
                        self.client
                            .get(self.url(&format!("openapi/v1/models/{repo}"))?),
                    )
                    .await?;
                let revision = self.git_head(repo).await?;
                let mut source = (*self.ms_card(&value, repo, &revision)?.source).clone();
                if source.access != SourceAccess::Accessible {
                    let files = self.ms_files(repo, &revision).await?;
                    source.access = self
                        .ms_access(&files, repo, &revision, source.access)
                        .await?;
                }
                ModelSource::new(source).map_err(|_| AdapterError::Unavailable)
            }
            Hub::Kaggle => {
                let parts = repository(repo, 4)?;
                let (value, _) = self
                    .json(
                        self.client
                            .post(self.url("v1/models.ModelApiService/GetModel")?)
                            .json(&json!({"ownerSlug":parts[0],"modelSlug":parts[1]})),
                    )
                    .await?;
                let instance = value["instances"]
                    .as_array()
                    .and_then(|all| {
                        all.iter()
                            .find(|i| i["framework"] == parts[2] && i["slug"] == parts[3])
                    })
                    .ok_or(AdapterError::Unavailable)?;
                Ok(self.kaggle_card(&value, instance)?.source.clone())
            }
        }
    }
    async fn hf_access(
        &self,
        value: &Value,
        repo: &str,
        revision: &str,
    ) -> Result<SourceAccess, AdapterError> {
        let declared = access(value);
        let Some(file) = value["siblings"].as_array().and_then(|files| {
            files
                .iter()
                .filter_map(|v| v["rfilename"].as_str())
                .find(|name| {
                    name.ends_with(".safetensors")
                        || name.ends_with(".gguf")
                        || name.ends_with(".bin")
                })
        }) else {
            return Ok(declared);
        };
        let mut url = self.url("")?;
        url.path_segments_mut()
            .map_err(|_| AdapterError::Unsupported)?
            .pop_if_empty()
            .extend(repo.split('/'))
            .push("resolve")
            .push(revision)
            .extend(file.split('/'));
        // A metadata-only HEAD checks this selected account's actual file grant. A public README
        // cannot establish weight access, and no terms are accepted by the adapter.
        let response = self
            .credentials
            .authorize(self.hub, self.client.head(url))
            .await?
            .send()
            .await
            .map_err(|_| AdapterError::Unavailable)?;
        match response.status().as_u16() {
            200 => Ok(SourceAccess::Accessible),
            302 | 307
                if response
                    .headers()
                    .get("x-repo-commit")
                    .and_then(|v| v.to_str().ok())
                    == Some(revision)
                    && response.headers().contains_key("x-linked-etag") =>
            {
                Ok(SourceAccess::Accessible)
            }
            401 => Ok(SourceAccess::AuthenticationRequired),
            403 if matches!(
                declared,
                SourceAccess::TermsRequired | SourceAccess::AwaitingApproval
            ) =>
            {
                Ok(SourceAccess::TermsRequired)
            }
            403 => Ok(SourceAccess::Denied),
            _ => Err(AdapterError::Unavailable),
        }
    }
    fn repo<'a>(&self, handle: &'a ActorId) -> Result<&'a str, AdapterError> {
        let (prefix, repo) = handle
            .as_str()
            .split_once(':')
            .ok_or(AdapterError::Unsupported)?;
        if prefix != self.hub.id() {
            return Err(AdapterError::Unsupported);
        }
        repository(repo, if self.hub == Hub::Kaggle { 4 } else { 2 })?;
        Ok(repo)
    }
    async fn ms_files(&self, repo: &str, revision: &str) -> Result<Value, AdapterError> {
        let mut metadata = self.url(&format!("api/v1/models/{repo}/repo/files"))?;
        metadata
            .query_pairs_mut()
            .append_pair("Revision", revision)
            .append_pair("Recursive", "true");
        self.json(self.client.get(metadata))
            .await
            .map(|(value, _)| value)
    }
    async fn ms_access(
        &self,
        files: &Value,
        repo: &str,
        revision: &str,
        declared: SourceAccess,
    ) -> Result<SourceAccess, AdapterError> {
        let Some(file) = files["Files"].as_array().and_then(|files| {
            files
                .iter()
                .filter(|file| file["Type"] != "tree")
                .filter_map(|file| file["Path"].as_str())
                .find(|name| {
                    name.ends_with(".safetensors")
                        || name.ends_with(".gguf")
                        || name.ends_with(".bin")
                })
        }) else {
            return Ok(declared);
        };
        let mut url = self.url(&format!("api/v1/models/{repo}/repo"))?;
        url.query_pairs_mut()
            .append_pair("Revision", revision)
            .append_pair("FilePath", file);
        let response = self
            .credentials
            .authorize(self.hub, self.client.head(url))
            .await?
            .send()
            .await
            .map_err(|_| AdapterError::Unavailable)?;
        match response.status().as_u16() {
            200 => Ok(SourceAccess::Accessible),
            401 => Ok(SourceAccess::AuthenticationRequired),
            403 if matches!(
                declared,
                SourceAccess::TermsRequired | SourceAccess::AwaitingApproval
            ) =>
            {
                Ok(SourceAccess::TermsRequired)
            }
            403 => Ok(SourceAccess::Denied),
            _ => Err(AdapterError::Unavailable),
        }
    }
    async fn git_head(&self, repo: &str) -> Result<String, AdapterError> {
        repository(repo, 2)?;
        let mut url = self.url(&format!("{repo}.git/info/refs"))?;
        url.query_pairs_mut()
            .append_pair("service", "git-upload-pack");
        let mut response = self
            .credentials
            .authorize(self.hub, self.client.get(url))
            .await?
            .send()
            .await
            .map_err(|_| AdapterError::Unavailable)?;
        if !response.status().is_success() {
            return Err(AdapterError::Unavailable);
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| AdapterError::Unavailable)?
        {
            if bytes.len() + chunk.len() > MAX_METADATA_BYTES {
                return Err(AdapterError::Unavailable);
            }
            bytes.extend(chunk);
        }
        let mut position = 0;
        while position + 4 <= bytes.len() {
            let header = std::str::from_utf8(&bytes[position..position + 4])
                .map_err(|_| AdapterError::Unavailable)?;
            let length =
                usize::from_str_radix(header, 16).map_err(|_| AdapterError::Unavailable)?;
            if length == 0 {
                position += 4;
                continue;
            }
            if length < 4 || position + length > bytes.len() {
                return Err(AdapterError::Unavailable);
            }
            let raw = &bytes[position + 4..position + length];
            position += length;
            let raw = raw.strip_suffix(b"\n").unwrap_or(raw);
            let field = raw.split(|b| *b == 0).next().unwrap_or(raw);
            if let Some(space) = field.iter().position(|b| *b == b' ') {
                let hash = &field[..space];
                if matches!(hash.len(), 40 | 64)
                    && hash.iter().all(u8::is_ascii_hexdigit)
                    && field.get(space + 1..) == Some(b"HEAD")
                {
                    return String::from_utf8(hash.to_vec()).map_err(|_| AdapterError::Unavailable);
                }
            }
        }
        Err(AdapterError::Unavailable)
    }
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Cursor {
    account: String,
    hub: String,
    query: String,
    publisher: Option<String>,
    limit: u64,
    next: String,
}
fn id(value: &str) -> Result<ActorId, AdapterError> {
    ActorId::new(value).map_err(|_| AdapterError::Unavailable)
}

fn repository(value: &str, segments: usize) -> Result<Vec<&str>, AdapterError> {
    let parts = value.split('/').collect::<Vec<_>>();
    if parts.len() != segments
        || parts.iter().any(|p| {
            p.is_empty()
                || *p == "."
                || *p == ".."
                || p.chars()
                    .any(|c| !(c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.')))
        })
    {
        return Err(AdapterError::Unsupported);
    }
    Ok(parts)
}
fn next_link(link: &str) -> Option<String> {
    link.split(',')
        .find(|p| p.contains("rel=\"next\""))
        .and_then(|p| p.trim().strip_prefix('<'))
        .and_then(|p| p.split_once('>'))
        .map(|(url, _)| url.to_owned())
}
fn access(value: &Value) -> SourceAccess {
    if value["gated"] == true
        || value["gated"] == "manual"
        || value["gated"] == "auto"
        || value["visibility"] == "gated"
    {
        SourceAccess::TermsRequired
    } else if value["private"] == true
        || value["login_required"] == true
        || value["visibility"] == "private"
    {
        SourceAccess::AuthenticationRequired
    } else {
        SourceAccess::Accessible
    }
}
fn weight_format(value: &Value) -> Option<&'static str> {
    let files = value["siblings"].as_array()?;
    if files.iter().any(|f| {
        f["rfilename"]
            .as_str()
            .is_some_and(|p| p.ends_with(".gguf"))
    }) {
        Some("gguf")
    } else if files.iter().any(|f| {
        f["rfilename"]
            .as_str()
            .is_some_and(|p| p.ends_with(".safetensors"))
    }) {
        Some("safetensors")
    } else {
        None
    }
}
fn card(
    repository: String,
    model: String,
    source: ModelSource,
    architecture: Option<&str>,
    format: Option<&str>,
    quantization: Option<&str>,
    bytes: Option<u64>,
) -> Result<ModelCard, AdapterError> {
    ModelCard::new(ModelCardData {
        repository_id: id(&repository)?,
        model_id: id(&model)?,
        source,
        architecture: architecture.map(id).transpose()?,
        format: format.map(id).transpose()?,
        quantization: quantization.map(id).transpose()?,
        weight_bytes: bytes.map(Counter::new),
        context_tokens: None,
    })
    .map_err(|_| AdapterError::Unavailable)
}
/// Combines official metadata access with a service-owned download executor.
pub struct HubSources {
    /// Metadata source; its account namespace scopes pagination and access checks.
    pub catalog: Arc<HubHttp>,
    /// Transfer implementation wired to the shared model root and durable progress sink.
    pub downloads: Arc<dyn DownloadExecutor>,
}
impl Sources for HubSources {
    fn search(&self, query: SourceQuery) -> BoxFuture<'_, Result<SourcePage, AdapterError>> {
        Box::pin(self.catalog.search(query))
    }
    fn metadata(&self, repo: ActorId) -> BoxFuture<'_, Result<ModelSource, AdapterError>> {
        Box::pin(self.catalog.metadata(repo))
    }
    fn download(
        &self,
        progress: DownloadProgress,
    ) -> BoxFuture<'_, Result<DownloadProgress, AdapterError>> {
        self.downloads.transfer(progress)
    }
    fn cancel(&self, download: ActorId) -> BoxFuture<'_, Result<DownloadProgress, AdapterError>> {
        self.downloads.cancel(download)
    }
}
impl FileCatalog for HubHttp {
    fn files<'a>(
        &'a self,
        source: &'a ModelSource,
    ) -> BoxFuture<'a, Result<Vec<DownloadFile>, AdapterError>> {
        Box::pin(async move {
            if source.host.as_str() != self.hub.id() {
                return Err(AdapterError::Unsupported);
            }
            let url: url::Url = source
                .repository_url
                .parse()
                .map_err(|_| AdapterError::Unsupported)?;
            let expected: url::Url = self
                .hub
                .catalog()
                .parse()
                .map_err(|_| AdapterError::Unsupported)?;
            if url.host_str() != expected.host_str() {
                return Err(AdapterError::Unsupported);
            }
            let repo = match self.hub {
                Hub::HuggingFace => url.path().trim_start_matches('/'),
                Hub::ModelScope => url
                    .path()
                    .strip_prefix("/models/")
                    .ok_or(AdapterError::Unsupported)?,
                Hub::Kaggle => url
                    .path()
                    .strip_prefix("/models/")
                    .ok_or(AdapterError::Unsupported)?,
            };
            let revision = source.revision.as_str();
            match self.hub {
                Hub::HuggingFace => {
                    repository(repo, 2)?;
                    let mut metadata =
                        self.url(&format!("api/models/{repo}/revision/{revision}"))?;
                    metadata.query_pairs_mut().append_pair("blobs", "true");
                    let (value, _) = self.json(self.client.get(metadata)).await?;
                    if value["sha"].as_str() != Some(revision) {
                        return Err(AdapterError::Unsupported);
                    }
                    if self.hf_access(&value, repo, revision).await? != SourceAccess::Accessible {
                        return Err(AdapterError::Unsupported);
                    }
                    let mut files = Vec::new();
                    for file in value["siblings"]
                        .as_array()
                        .ok_or(AdapterError::Unavailable)?
                    {
                        let name = file["rfilename"]
                            .as_str()
                            .ok_or(AdapterError::Unavailable)?;
                        let mut download = self.url("")?;
                        download
                            .path_segments_mut()
                            .map_err(|_| AdapterError::Unsupported)?
                            .pop_if_empty()
                            .extend(repo.split('/'))
                            .push("resolve")
                            .push(revision)
                            .extend(name.split('/'));
                        let length = file["size"].as_u64().or(file["lfs"]["size"].as_u64());
                        let hash = file["lfs"]["sha256"].as_str().map(str::to_owned);
                        files.push(DownloadFile {
                            format: DownloadFormat::File,
                            path: name.into(),
                            url: download,
                            bytes: length,
                            sha256: hash,
                        });
                    }
                    Ok(files)
                }
                Hub::ModelScope => {
                    repository(repo, 2)?;
                    let value = self.ms_files(repo, revision).await?;
                    if self
                        .ms_access(&value, repo, revision, source.access.clone())
                        .await?
                        != SourceAccess::Accessible
                    {
                        return Err(AdapterError::Unsupported);
                    }
                    let mut files = Vec::new();
                    for file in value["Files"].as_array().ok_or(AdapterError::Unavailable)? {
                        if file["Type"] == "tree" {
                            continue;
                        }
                        let name = file["Path"].as_str().ok_or(AdapterError::Unavailable)?;
                        let mut download = self.url(&format!("api/v1/models/{repo}/repo"))?;
                        download
                            .query_pairs_mut()
                            .append_pair("Revision", revision)
                            .append_pair("FilePath", name);
                        files.push(DownloadFile {
                            format: DownloadFormat::File,
                            path: name.into(),
                            url: download,
                            bytes: file["Size"].as_u64(),
                            sha256: file["Sha256"].as_str().map(str::to_owned),
                        });
                    }
                    Ok(files)
                }
                Hub::Kaggle => {
                    let (repo, pinned) = repo
                        .trim_end_matches('/')
                        .rsplit_once('/')
                        .ok_or(AdapterError::Unsupported)?;
                    repository(repo, 4)?;
                    if pinned != revision
                        || revision.parse::<u64>().ok().filter(|n| *n > 0).is_none()
                    {
                        return Err(AdapterError::Unsupported);
                    }
                    // Current documented REST download route, not a publisher-invented API.
                    let base = if self.base.as_str() == "https://api.kaggle.com/" {
                        url::Url::parse("https://www.kaggle.com/")
                            .map_err(|_| AdapterError::Unavailable)?
                    } else {
                        self.base.clone()
                    };
                    let download = base
                        .join(&format!("api/v1/models/{repo}/{revision}/download"))
                        .map_err(|_| AdapterError::Unsupported)?;
                    // Resolve current source-account use even when a complete local archive is resumed.
                    let _ = self
                        .credentials
                        .authorize(self.hub, self.client.get(download.clone()))
                        .await?;
                    Ok(vec![DownloadFile {
                        format: DownloadFormat::TarGzip,
                        path: ARCHIVE_FILE.into(),
                        url: download,
                        bytes: None,
                        sha256: None,
                    }])
                }
            }
        })
    }
    fn authorize(
        &self,
        request: reqwest::RequestBuilder,
    ) -> BoxFuture<'_, Result<reqwest::RequestBuilder, AdapterError>> {
        self.credentials.authorize(self.hub, request)
    }
}
