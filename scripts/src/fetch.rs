//! `urllib.request.urlopen(Request(url, headers=...), timeout=...)` for the scripts that
//! read public URLs: a GET with the script's User-Agent, redirects followed, and an HTTP
//! error status reported as urllib's HTTPError.
use std::time::Duration;

pub fn get(url: &str, user_agent: &str, timeout: Duration) -> Result<Vec<u8>, String> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(timeout))
        .user_agent(user_agent)
        .build()
        .into();
    match agent.get(url).call() {
        Ok(mut response) => response
            .body_mut()
            .with_config()
            .limit(u64::MAX)
            .read_to_vec()
            .map_err(|e| format!("urllib.error.URLError: <urlopen error {e}>")),
        Err(ureq::Error::StatusCode(code)) => {
            let reason = ureq::http::StatusCode::from_u16(code)
                .ok()
                .and_then(|s| s.canonical_reason())
                .unwrap_or("");
            Err(format!(
                "urllib.error.HTTPError: HTTP Error {code}: {reason}"
            ))
        }
        Err(e) => Err(format!("urllib.error.URLError: <urlopen error {e}>")),
    }
}

/// The final HTTP status of a GET, redirects followed; an error status is a result here,
/// as urllib's HTTPError code is to the caller that catches it.
pub fn status(url: &str, user_agent: &str, timeout: Duration) -> Result<u16, String> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(timeout))
        .user_agent(user_agent)
        .http_status_as_error(false)
        .build()
        .into();
    agent
        .get(url)
        .call()
        .map(|response| response.status().as_u16())
        .map_err(|e| format!("<urlopen error {e}>"))
}
