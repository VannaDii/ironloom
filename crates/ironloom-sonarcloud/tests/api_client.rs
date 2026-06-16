use std::cell::RefCell;

use ironloom_sonarcloud::{
    QualityGateStatus, SonarCloudClient, SonarCloudHttpRequest, SonarCloudHttpResponse,
    SonarCloudIssueSeverity, SonarCloudTransport,
};

#[test]
fn sonarcloud_client_polls_quality_gate_with_bearer_auth() {
    let transport = RecordingTransport::new(vec![SonarCloudHttpResponse {
        status: 200,
        body: r#"{"projectStatus":{"status":"OK"}}"#.to_owned(),
    }]);
    let client = SonarCloudClient::new("sonar-token", "veritas", "ironloom", &transport);

    let status = client
        .poll_quality_gate()
        .expect("quality gate response should parse");

    assert_eq!(QualityGateStatus::Passed, status);
    let request = transport.request_at(0);
    assert_eq!("GET", request.method);
    assert_eq!(
        "/api/qualitygates/project_status?organization=veritas&projectKey=ironloom",
        request.path
    );
    assert!(
        request
            .headers
            .contains(&("Authorization".to_owned(), "Bearer sonar-token".to_owned()))
    );
}

#[test]
fn sonarcloud_client_normalizes_quality_gate_failure() {
    let transport = RecordingTransport::new(vec![SonarCloudHttpResponse {
        status: 200,
        body: r#"{"projectStatus":{"status":"ERROR"}}"#.to_owned(),
    }]);
    let client = SonarCloudClient::new("sonar-token", "veritas", "ironloom", &transport);

    let status = client
        .poll_quality_gate()
        .expect("quality gate response should parse");

    assert_eq!(QualityGateStatus::Failed, status);
}

#[test]
fn sonarcloud_client_normalizes_issue_search_results() {
    let transport = RecordingTransport::new(vec![SonarCloudHttpResponse {
        status: 200,
        body: r#"{"issues":[{"key":"issue-1","severity":"MAJOR","type":"BUG","message":"Fix it","status":"OPEN"}]}"#.to_owned(),
    }]);
    let client = SonarCloudClient::new("sonar-token", "veritas", "ironloom", &transport);

    let issues = client.search_open_issues().expect("issues should parse");

    assert_eq!(1, issues.len());
    assert_eq!("issue-1", issues[0].key);
    assert_eq!(SonarCloudIssueSeverity::Major, issues[0].severity);
    assert_eq!("BUG", issues[0].issue_type);
    assert_eq!("Fix it", issues[0].message);
    assert_eq!("OPEN", issues[0].status);
    assert_eq!(
        "/api/issues/search?organization=veritas&componentKeys=ironloom&resolved=false",
        transport.request_at(0).path
    );
}

struct RecordingTransport {
    responses: RefCell<Vec<SonarCloudHttpResponse>>,
    requests: RefCell<Vec<SonarCloudHttpRequest>>,
}

impl RecordingTransport {
    fn new(responses: Vec<SonarCloudHttpResponse>) -> Self {
        Self {
            responses: RefCell::new(responses),
            requests: RefCell::new(Vec::new()),
        }
    }

    fn request_at(&self, index: usize) -> SonarCloudHttpRequest {
        self.requests.borrow()[index].clone()
    }
}

impl SonarCloudTransport for &RecordingTransport {
    fn send(&self, request: SonarCloudHttpRequest) -> SonarCloudHttpResponse {
        self.requests.borrow_mut().push(request);
        self.responses.borrow_mut().remove(0)
    }
}
