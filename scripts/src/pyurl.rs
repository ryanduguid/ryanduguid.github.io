//! `urllib.parse.urlsplit` of CPython 3.15 for `str` URLs, with `.hostname`.
//!
//! The checks use the scheme, netloc, path and hostname; the `ValueError`s
//! urlsplit raises for malformed brackets or NFKC tricks are returned as
//! errors, which the callers report as Python reported the traceback.
use unicode_normalization::UnicodeNormalization;

#[derive(Debug, Clone, PartialEq)]
pub struct Split {
    pub scheme: String,
    pub netloc: String,
    pub path: String,
    pub query: String,
    pub fragment: String,
}

fn c0_or_space(c: char) -> bool {
    (c as u32) <= 0x20
}

pub fn urlsplit(url: &str) -> Result<Split, String> {
    let mut url: String = url
        .trim_start_matches(c0_or_space)
        .chars()
        .filter(|c| !matches!(c, '\t' | '\r' | '\n'))
        .collect();
    let mut scheme = String::new();
    if let Some(i) = url.find(':')
        && i > 0
        && url.as_bytes()[0].is_ascii_alphabetic()
        && url[..i]
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.'))
    {
        scheme = url[..i].to_ascii_lowercase();
        url = url[i + 1..].to_owned();
    }
    let mut netloc = String::new();
    if url.starts_with("//") {
        let rest = &url[2..];
        let end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
        netloc = rest[..end].to_owned();
        url = rest[end..].to_owned();
        if netloc.contains('[') != netloc.contains(']') {
            return Err("Invalid IPv6 URL".into());
        }
        if netloc.contains('[') && netloc.contains(']') {
            check_bracketed_netloc(&netloc)?;
        }
    }
    let mut fragment = String::new();
    if let Some((before, after)) = url.split_once('#') {
        fragment = after.to_owned();
        url = before.to_owned();
    }
    let mut query = String::new();
    if let Some((before, after)) = url.split_once('?') {
        query = after.to_owned();
        url = before.to_owned();
    }
    check_netloc(&netloc)?;
    Ok(Split {
        scheme,
        netloc,
        path: url,
        query,
        fragment,
    })
}

fn check_netloc(netloc: &str) -> Result<(), String> {
    if netloc.is_empty() || netloc.is_ascii() {
        return Ok(());
    }
    let n: String = netloc
        .chars()
        .filter(|c| !matches!(c, '@' | ':' | '#' | '?'))
        .collect();
    let normalised: String = n.nfkc().collect();
    if n == normalised {
        return Ok(());
    }
    if normalised.contains(['/', '?', '#', '@', ':']) {
        return Err(format!(
            "netloc '{netloc}' contains invalid characters under NFKC normalization"
        ));
    }
    Ok(())
}

fn check_bracketed_netloc(netloc: &str) -> Result<(), String> {
    let host_and_port = netloc.rsplit_once('@').map_or(netloc, |(_, h)| h);
    let hostname = match host_and_port.split_once('[') {
        Some((before, bracketed)) => {
            if !before.is_empty() {
                return Err("Invalid IPv6 URL".into());
            }
            let (hostname, port) = bracketed.split_once(']').unwrap_or((bracketed, ""));
            if !port.is_empty() && !port.starts_with(':') {
                return Err("Invalid IPv6 URL".into());
            }
            hostname
        }
        None => host_and_port
            .split_once(':')
            .map_or(host_and_port, |(h, _)| h),
    };
    if hostname.starts_with(['v', 'V']) {
        let valid = hostname[1..].split_once('.').is_some_and(|(hex, rest)| {
            !hex.is_empty()
                && hex.chars().all(|c| c.is_ascii_hexdigit())
                && !rest.is_empty()
                && !rest.contains('\n')
        });
        return if valid {
            Ok(())
        } else {
            Err("IPvFuture address is invalid".into())
        };
    }
    // ipaddress.ip_address: an IPv6 address may carry a %zone; IPv4 is refused in brackets.
    // shortcut: Rust's address grammar stands in for ipaddress's; both refuse leading-zero
    // IPv4 octets and accept embedded IPv4 in IPv6.
    let address = hostname.split_once('%').map_or(hostname, |(a, _)| a);
    if address.parse::<std::net::Ipv4Addr>().is_ok() {
        return Err("An IPv4 address cannot be in brackets".into());
    }
    if address.parse::<std::net::Ipv6Addr>().is_err() {
        return Err(format!(
            "{} does not appear to be an IPv4 or IPv6 address",
            crate::py::repr_str(hostname)
        ));
    }
    Ok(())
}

/// `.hostname` of a split URL: lower-cased, without user information, port or brackets.
pub fn hostname(netloc: &str) -> Option<String> {
    if netloc.is_empty() {
        return None;
    }
    let hostinfo = netloc.rsplit_once('@').map_or(netloc, |(_, h)| h);
    let host = match hostinfo.split_once('[') {
        Some((_, bracketed)) => bracketed.split_once(']').map_or(bracketed, |(h, _)| h),
        None => hostinfo.split_once(':').map_or(hostinfo, |(h, _)| h),
    };
    if host.is_empty() {
        return None;
    }
    let (address, zone) = host
        .split_once('%')
        .map_or((host, None), |(a, z)| (a, Some(z)));
    Some(match zone {
        Some(zone) => format!("{}%{zone}", address.to_lowercase()),
        None => address.to_lowercase(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_like_urllib() {
        let s = urlsplit(" \tMAILTO:ryan@example.test?subject=x").unwrap();
        assert_eq!(
            (s.scheme.as_str(), s.path.as_str(), s.query.as_str()),
            ("mailto", "ryan@example.test", "subject=x")
        );
        let s = urlsplit("https://User@WWW.LinkedIn.com:443/in/x/#f").unwrap();
        assert_eq!(hostname(&s.netloc).as_deref(), Some("www.linkedin.com"));
        assert_eq!(s.path, "/in/x/");
        assert!(urlsplit("https://[::1/x").is_err());
        assert!(urlsplit("https://[1.2.3.4]/").is_err());
        assert!(urlsplit("https://[fe80::1%25eth0]/").is_ok());
        assert_eq!(urlsplit("1http:x").unwrap().scheme, "");
        assert!(urlsplit("https://ex\u{2100}ample/").is_err());
    }
}
