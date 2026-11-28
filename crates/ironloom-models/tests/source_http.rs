use ironloom_core::{Counter, validation::decode};
use ironloom_models::{
    factory::SourceQuery,
    sources::hubs::{Anonymous, Hub, HubHttp},
};
use serde_json::{Value, json};
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

async fn serve(responses: Vec<Value>) -> (String, tokio::task::JoinHandle<Vec<String>>) {
    serve_raw(
        responses
            .into_iter()
            .map(|value| value.to_string())
            .collect(),
    )
    .await
}
async fn serve_raw(responses: Vec<String>) -> (String, tokio::task::JoinHandle<Vec<String>>) {
    serve_status(responses.into_iter().map(|body| (200, body)).collect()).await
}
async fn serve_status(
    responses: Vec<(u16, String)>,
) -> (String, tokio::task::JoinHandle<Vec<String>>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let task = tokio::spawn(async move {
        let mut requests = Vec::new();
        for (status, value) in responses {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut bytes = vec![0; 8192];
            let n = socket.read(&mut bytes).await.unwrap();
            requests.push(String::from_utf8_lossy(&bytes[..n]).into_owned());
            let body = value;
            socket
                .write_all(
                    format!(
                        "HTTP/1.1 {status} Fixture\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                        body.len()
                    )
                    .as_bytes(),
                )
                .await
                .unwrap();
        }
        requests
    });
    (format!("http://{address}/"), task)
}
fn query(host: &str, limit: &str) -> SourceQuery {
    decode(
        &serde_json::to_vec(
            &json!({"query":"fixture", "host":host,"publisher":null,"after":null,"limit":limit}),
        )
        .unwrap(),
    )
    .unwrap()
}
#[tokio::test]
async fn kaggle_continuation_keeps_all_variations_and_rejects_changed_query() {
    let page = json!({"models":[{"ref":"publisher/model","instances":[
        {"framework":"gguf","slug":"first","versionNumber":1},
        {"framework":"gguf","slug":"second","versionNumber":2}]}]});
    let (base, task) = serve(vec![page.clone(), page]).await;
    let hub = HubHttp::new(Hub::Kaggle, base.parse().unwrap(), Arc::new(Anonymous)).unwrap();
    let first = hub.search(query("kaggle", "1")).await.unwrap();
    assert_eq!(first.models[0].source.revision.as_str(), "1");
    let mut data = (*query("kaggle", "1")).clone();
    data.after = first.next_after.clone();
    let second = hub
        .search(SourceQuery::new(data.clone()).unwrap())
        .await
        .unwrap();
    assert_eq!(second.models[0].source.revision.as_str(), "2");
    assert!(second.next_after.is_none());
    data.limit = Counter::new(2);
    assert!(hub.search(SourceQuery::new(data).unwrap()).await.is_err());
    let requests = task.await.unwrap();
    assert!(
        requests
            .iter()
            .all(|request| request.starts_with("POST /v1/models.ModelApiService/ListModels"))
    );
}
#[tokio::test]
async fn huggingface_keeps_publisher_access_and_immutable_revision_distinct() {
    let (base, task) = serve(vec![json!([{"id":"Qwen/fixture","sha":"pinned-sha","gated":"manual","cardData":{"license":"apache-2.0"},"config":{"model_type":"qwen3"},"siblings":[{"rfilename":"model.safetensors"}]}])]).await;
    let hub = HubHttp::new(Hub::HuggingFace, base.parse().unwrap(), Arc::new(Anonymous)).unwrap();
    let page = hub.search(query("huggingface", "10")).await.unwrap();
    let model = &page.models[0];
    assert_eq!(model.source.publisher.as_str(), "Qwen");
    assert_eq!(model.source.host.as_str(), "huggingface");
    assert_eq!(model.source.revision.as_str(), "pinned-sha");
    assert_eq!(
        model.source.access,
        ironloom_models::factory::SourceAccess::TermsRequired
    );
    assert_eq!(model.architecture.as_ref().unwrap().as_str(), "qwen3");
    assert!(model.weight_bytes.is_none());
    assert!(task.await.unwrap()[0].contains("search=fixture"));
}

#[tokio::test]
async fn gated_repository_rechecks_actual_pinned_weight_access_without_accepting_terms() {
    let metadata = json!({"id":"Qwen/fixture","sha":"pinned-sha","gated":"manual","siblings":[{"rfilename":"README.md"},{"rfilename":"weights.safetensors"}]});
    let (base, server) = serve(vec![metadata, json!({})]).await;
    let hub = HubHttp::new(Hub::HuggingFace, base.parse().unwrap(), Arc::new(Anonymous)).unwrap();
    let source = hub
        .metadata(ironloom_core::ActorId::new("huggingface:Qwen/fixture").unwrap())
        .await
        .unwrap();
    assert_eq!(
        source.access,
        ironloom_models::factory::SourceAccess::Accessible
    );
    let requests = server.await.unwrap();
    assert!(requests[1].starts_with("HEAD /Qwen/fixture/resolve/pinned-sha/weights.safetensors "));
    assert!(!requests.iter().any(|v| v.starts_with("POST")));
}

#[tokio::test]
async fn kaggle_download_descriptor_keeps_explicit_current_archive_and_pinned_version() {
    use ironloom_models::{
        factory::ModelSource,
        sources::downloads::{ARCHIVE_FILE, DownloadFormat, FileCatalog},
    };
    let hub = HubHttp::official(Hub::Kaggle, Arc::new(Anonymous)).unwrap();
    let source: ModelSource = decode(
        &serde_json::to_vec(&json!({
            "host":"kaggle", "publisher":"publisher", "revision":"7",
            "repository_url":"https://www.kaggle.com/models/publisher/model/gguf/variation/7",
            "access":"accessible"
        }))
        .unwrap(),
    )
    .unwrap();
    let files = hub.files(&source).await.unwrap();
    assert_eq!(files.len(), 1);
    assert_eq!(files[0].format, DownloadFormat::TarGzip);
    assert_eq!(files[0].path, ARCHIVE_FILE);
    assert_eq!(
        files[0].url.as_str(),
        "https://www.kaggle.com/api/v1/models/publisher/model/gguf/variation/7/download"
    );
    assert!(files[0].sha256.is_none());
    let mut wrong = (*source).clone();
    wrong.revision = ironloom_core::ActorId::new("8").unwrap();
    assert!(hub.files(&ModelSource::new(wrong).unwrap()).await.is_err());
}

fn advertised_head(hash: &str) -> String {
    let line = format!("{hash} HEAD\0multi_ack\n");
    format!("{:04x}{line}0000", line.len() + 4)
}
#[tokio::test]
async fn modelscope_current_openapi_ids_tags_and_bounded_pages_keep_pinned_git_revisions() {
    let hash = "1".repeat(40);
    let model = json!({"id":"Qwen/fixture","license":"apache-2.0","tags":["model_type:qwen3"],"file_size":42,"private":false,"gated":false});
    let response = json!({"success":true,"data":{"models":[model],"total_count":2}}).to_string();
    let (base, task) = serve_raw(vec![
        response.clone(),
        advertised_head(&hash),
        response,
        advertised_head(&hash),
    ])
    .await;
    let hub = HubHttp::new(Hub::ModelScope, base.parse().unwrap(), Arc::new(Anonymous)).unwrap();
    let first = hub.search(query("modelscope", "1")).await.unwrap();
    assert_eq!(
        first.models[0].repository_id.as_str(),
        "modelscope:Qwen/fixture"
    );
    assert_eq!(first.models[0].source.publisher.as_str(), "Qwen");
    assert_eq!(
        first.models[0].architecture.as_ref().unwrap().as_str(),
        "qwen3"
    );
    assert_eq!(first.models[0].source.revision.as_str(), hash);
    let mut next = (*query("modelscope", "1")).clone();
    next.after = first.next_after.clone();
    let second = hub.search(SourceQuery::new(next).unwrap()).await.unwrap();
    assert!(second.next_after.is_none());
    let requests = task.await.unwrap();
    assert!(requests[0].starts_with("GET /openapi/v1/models?"));
    assert!(requests[0].contains("page_number=1"));
    assert!(requests[2].contains("page_number=2"));
    assert!(requests[1].starts_with("GET /Qwen/fixture.git/info/refs?service=git-upload-pack "));
    let (base, task) = serve_raw(vec![
        json!({"data":{"models":[],"total_count":0}}).to_string(),
    ])
    .await;
    let hub = HubHttp::new(Hub::ModelScope, base.parse().unwrap(), Arc::new(Anonymous)).unwrap();
    hub.search(query("modelscope", "100")).await.unwrap();
    assert!(task.await.unwrap()[0].contains("page_size=50"));
}
#[tokio::test]
async fn modelscope_gated_detail_rechecks_actual_pinned_weight_without_accepting_terms() {
    for (status, expected) in [
        (200, ironloom_models::factory::SourceAccess::Accessible),
        (403, ironloom_models::factory::SourceAccess::TermsRequired),
        (
            401,
            ironloom_models::factory::SourceAccess::AuthenticationRequired,
        ),
    ] {
        let hash = "2".repeat(40);
        let (base,task) = serve_status(vec![
            (200,json!({"success":true,"data":{"id":"Qwen/fixture","private":false,"visibility":"gated","license":"apache-2.0"}}).to_string()),
            (200,advertised_head(&hash)),
            (200,json!({"Data":{"Files":[{"Path":"README.md","Type":"blob"},{"Path":"weights.safetensors","Type":"blob"}]}}).to_string()),
            (status,String::new())]).await;
        let hub =
            HubHttp::new(Hub::ModelScope, base.parse().unwrap(), Arc::new(Anonymous)).unwrap();
        let source = hub
            .metadata(ironloom_core::ActorId::new("modelscope:Qwen/fixture").unwrap())
            .await
            .unwrap();
        assert_eq!(source.access, expected);
        assert_eq!(source.revision.as_str(), hash);
        let requests = task.await.unwrap();
        assert!(requests[3].starts_with("HEAD /api/v1/models/Qwen/fixture/repo?"));
        assert!(requests[3].contains(&format!("Revision={hash}")));
        assert!(requests[3].contains("FilePath=weights.safetensors"));
        assert!(!requests.iter().any(|request| request.starts_with("POST ")));
    }
}
