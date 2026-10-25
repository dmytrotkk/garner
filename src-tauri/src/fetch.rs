use reqwest::Client;
use reqwest::header::{HeaderMap, RETRY_AFTER};
use serde::{Deserialize, Serialize};
use serde_json::Value as Json;
use std::time::Duration;
use tauri::State;

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Coingecko,
    Frankfurter,
    Llama,
    Publicnode,
}

impl Provider {
    fn endpoint(self, path: &str) -> Result<(&'static str, String), String> {
        let rest = path
            .strip_prefix('/')
            .ok_or(format!("invalid path: {path}"))?;
        Ok(match self {
            Provider::Coingecko => (
                "coingecko",
                format!("https://api.coingecko.com/api/v3{path}"),
            ),
            Provider::Frankfurter => (
                "frankfurter",
                format!("https://api.frankfurter.dev/v1{path}"),
            ),
            Provider::Llama => ("llama", format!("https://coins.llama.fi{path}")),
            Provider::Publicnode => {
                let chain =
                    |byte: u8| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-';
                if rest.is_empty() || !rest.bytes().all(chain) {
                    return Err(format!("invalid chain: {path}"));
                }
                ("publicnode", format!("https://{rest}-rpc.publicnode.com"))
            }
        })
    }
}

#[derive(Serialize)]
#[serde(
    tag = "type",
    rename_all = "lowercase",
    rename_all_fields = "camelCase"
)]
pub enum Reply {
    Body {
        body: Json,
    },
    Status {
        status: u16,
        retry_after: Option<String>,
    },
}

fn retry_after(headers: &HeaderMap) -> Option<String> {
    headers
        .get(RETRY_AFTER)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned)
}

pub fn client() -> reqwest::Result<Client> {
    Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent(concat!("garner/", env!("CARGO_PKG_VERSION")))
        .build()
}

fn failure(name: &str, error: &reqwest::Error) -> String {
    let reason = if error.is_timeout() {
        "timed out"
    } else if error.is_connect() {
        "offline"
    } else {
        "request failed"
    };
    format!("{name}: {reason}")
}

#[tauri::command]
pub async fn fetch(
    client: State<'_, Client>,
    provider: Provider,
    path: String,
    body: Option<Json>,
) -> Result<Reply, String> {
    let (name, url) = provider.endpoint(&path)?;
    let request = match &body {
        Some(body) => client.post(url).json(body),
        None => client.get(url),
    };
    let response = request
        .send()
        .await
        .map_err(|error| failure(name, &error))?;
    let status = response.status();
    if !status.is_success() {
        return Ok(Reply::Status {
            status: status.as_u16(),
            retry_after: retry_after(response.headers()),
        });
    }
    response
        .json()
        .await
        .map(|body| Reply::Body { body })
        .map_err(|error| failure(name, &error))
}

#[cfg(test)]
mod tests {
    use super::{Provider, Reply, retry_after};
    use reqwest::header::{HeaderMap, HeaderValue, RETRY_AFTER};
    use serde_json::json;

    #[test]
    fn providers_build_fixed_urls_and_refuse_anything_else() {
        assert_eq!(
            Provider::Llama
                .endpoint("/prices/current/coingecko:ethereum")
                .unwrap()
                .1,
            "https://coins.llama.fi/prices/current/coingecko:ethereum"
        );
        assert_eq!(
            Provider::Publicnode.endpoint("/arbitrum-one").unwrap().1,
            "https://arbitrum-one-rpc.publicnode.com"
        );
        assert_eq!(
            Provider::Publicnode.endpoint("/evil.com/x").unwrap_err(),
            "invalid chain: /evil.com/x"
        );
        assert_eq!(
            Provider::Coingecko.endpoint("coins").unwrap_err(),
            "invalid path: coins"
        );
    }

    #[test]
    fn a_refusal_reaches_the_page_as_a_status_with_its_raw_retry_after() {
        assert_eq!(
            serde_json::to_value(Reply::Status {
                status: 429,
                retry_after: Some("120".into())
            })
            .unwrap(),
            json!({ "type": "status", "status": 429, "retryAfter": "120" })
        );
        assert_eq!(
            serde_json::to_value(Reply::Body { body: json!([1]) }).unwrap(),
            json!({ "type": "body", "body": [1] })
        );
        let mut headers = HeaderMap::new();
        assert_eq!(retry_after(&headers), None);
        headers.insert(RETRY_AFTER, HeaderValue::from_static("120"));
        assert_eq!(retry_after(&headers).as_deref(), Some("120"));
        headers.insert(RETRY_AFTER, HeaderValue::from_bytes(b"\xff").unwrap());
        assert_eq!(retry_after(&headers), None);
    }
}
