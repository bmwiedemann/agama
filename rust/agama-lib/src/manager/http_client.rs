use crate::{base_http_client::BaseHTTPClient, error::ServiceError};

pub struct ManagerHTTPClient {
    client: BaseHTTPClient,
}

impl ManagerHTTPClient {
    pub fn new() -> Result<Self, ServiceError> {
        Ok(Self {
            client: BaseHTTPClient::new()?,
        })
    }

    pub fn new_with_base(base: BaseHTTPClient) -> Self {
        Self { client: base }
    }

    pub async fn probe(&self) -> Result<(), ServiceError> {
        // BaseHTTPClient did not anticipate POST without request body
        let empty_body: Vec<u8> = vec![];
        if let Ok(value) = std::env::var("PROBE_SYNC") {
            return if value == "1" {
                self.client
                    .post_void("/manager/probe_sync", &empty_body)
                    .await
            } else {
                Ok(())
            };
        }
        self.client.post_void("/manager/probe", &empty_body).await
    }
}
