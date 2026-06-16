use std::io::{Read, Write};
use std::net::TcpListener;
use std::thread;

use ironloom_sonarcloud::{SonarCloudHttpRequest, SonarCloudHttpTransport, SonarCloudTransport};

#[test]
fn sonarcloud_http_transport_sends_request_to_configured_base_url() {
    let server = LocalHttpServer::spawn(
        "HTTP/1.1 200 OK\r\ncontent-length: 33\r\n\r\n{\"projectStatus\":{\"status\":\"OK\"}}",
    );
    let transport = SonarCloudHttpTransport::new(server.base_url());

    let response = transport.send(SonarCloudHttpRequest {
        method: "GET".to_owned(),
        path: "/api/qualitygates/project_status?organization=veritas&projectKey=ironloom"
            .to_owned(),
        headers: vec![("Authorization".to_owned(), "Bearer sonar-token".to_owned())],
        body: String::new(),
    });

    assert_eq!(200, response.status);
    assert_eq!(r#"{"projectStatus":{"status":"OK"}}"#, response.body);
    let request = server.request();
    assert!(request.starts_with(
        "GET /api/qualitygates/project_status?organization=veritas&projectKey=ironloom HTTP/1.1"
    ));
    assert!(request.contains("authorization: Bearer sonar-token"));
}

struct LocalHttpServer {
    address: String,
    handle: thread::JoinHandle<String>,
}

impl LocalHttpServer {
    fn spawn(response: &'static str) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("listener should bind");
        let address = listener
            .local_addr()
            .expect("address should exist")
            .to_string();
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("request should connect");
            let mut buffer = [0_u8; 4096];
            let bytes = stream.read(&mut buffer).expect("request should read");
            stream
                .write_all(response.as_bytes())
                .expect("response should write");
            String::from_utf8_lossy(&buffer[..bytes]).into_owned()
        });
        Self { address, handle }
    }

    fn base_url(&self) -> String {
        format!("http://{}", self.address)
    }

    fn request(self) -> String {
        self.handle.join().expect("server thread should finish")
    }
}
