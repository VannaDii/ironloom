use std::io::{Read, Write};
use std::net::TcpListener;
use std::thread;

use ironloom_github::{GitHubHttpRequest, GitHubHttpTransport, GitHubTransport};

#[test]
fn github_http_transport_sends_request_to_configured_base_url() {
    let server = LocalHttpServer::spawn(
        "HTTP/1.1 200 OK\r\ncontent-length: 25\r\n\r\n{\"default_branch\":\"main\"}",
    );
    let transport = GitHubHttpTransport::new(server.base_url());

    let response = transport.send(GitHubHttpRequest {
        method: "GET".to_owned(),
        path: "/repos/VannaDii/ironloom".to_owned(),
        headers: vec![("Authorization".to_owned(), "Bearer github-token".to_owned())],
        body: String::new(),
    });

    assert_eq!(200, response.status);
    assert_eq!(r#"{"default_branch":"main"}"#, response.body);
    let request = server.request();
    assert!(request.starts_with("GET /repos/VannaDii/ironloom HTTP/1.1"));
    assert!(request.contains("authorization: Bearer github-token"));
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
