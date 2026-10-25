use reqwest::{Client, StatusCode};
use std::{fs, io};
use tauri::{AppHandle, Manager, State, ipc::Response};

fn word(text: &str) -> bool {
    !text.is_empty()
        && text
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

fn deployment(source: &str) -> bool {
    source.split_once("/0x").is_some_and(|(chain, address)| {
        !chain.is_empty()
            && chain.bytes().all(|byte| byte.is_ascii_digit())
            && address.len() == 40
            && address.bytes().all(|byte| byte.is_ascii_hexdigit())
    })
}

#[tauri::command]
pub async fn icon(
    app: AppHandle,
    client: State<'_, Client>,
    coin: String,
    source: Option<String>,
) -> tauri::Result<Response> {
    if !word(&coin) {
        return Err(io::Error::other(format!("invalid coin: {coin}")).into());
    }
    let folder = app.path().app_cache_dir()?.join("icons");
    let file = folder.join(format!("{coin}.webp"));
    if let Ok(cached) = fs::read(&file) {
        return Ok(Response::new(cached));
    }
    let Some(source) = source.filter(|source| deployment(source)) else {
        return Ok(Response::new(Vec::new()));
    };
    let url = format!("https://token-icons.llamao.fi/icons/tokens/{source}?h=96&w=96");
    let Ok(response) = client.get(url).send().await else {
        return Ok(Response::new(Vec::new()));
    };
    let status = response.status();
    let image = match response.bytes().await {
        Ok(bytes) if status.is_success() => bytes.to_vec(),
        Ok(_) if status == StatusCode::NOT_FOUND || status == StatusCode::GONE => Vec::new(),
        _ => return Ok(Response::new(Vec::new())),
    };
    fs::create_dir_all(&folder)?;
    fs::write(&file, &image)?;
    Ok(Response::new(image))
}

#[cfg(test)]
mod tests {
    use super::{deployment, word};

    #[test]
    fn only_coin_ids_and_chain_addresses_reach_the_url() {
        assert!(word("usd-coin"));
        assert!(!word("../x"));
        assert!(!word(""));
        assert!(deployment(
            "8453/0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
        ));
        assert!(!deployment("8453/0x833589"));
        assert!(!deployment(
            "evil.com/0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
        ));
        assert!(!deployment("1/0x833589fcd6edb6e08f4c7c32d4f71b54bda0291g"));
    }
}
