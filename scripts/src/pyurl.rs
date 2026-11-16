//! `urllib.parse.urlsplit`, `urljoin` and `unquote` of CPython 3.15 for `str` URLs, with `.hostname`.
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

/// `_urlsplit`: components absent from the URL are `None`, as CPython 3.15 keeps them.
struct Parts {
    scheme: Option<String>,
    netloc: Option<String>,
    path: String,
    query: Option<String>,
    fragment: Option<String>,
}

fn split_parts(url: &str) -> Result<Parts, String> {
    let mut url: String = url
        .trim_start_matches(c0_or_space)
        .chars()
        .filter(|c| !matches!(c, '\t' | '\r' | '\n'))
        .collect();
    let mut scheme = None;
    if let Some(i) = url.find(':')
        && i > 0
        && url.as_bytes()[0].is_ascii_alphabetic()
        && url[..i]
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.'))
    {
        scheme = Some(url[..i].to_ascii_lowercase());
        url = url[i + 1..].to_owned();
    }
    let mut netloc = None;
    if url.starts_with("//") {
        let rest = &url[2..];
        let end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
        let found = rest[..end].to_owned();
        url = rest[end..].to_owned();
        if found.contains('[') != found.contains(']') {
            return Err("Invalid IPv6 URL".into());
        }
        if found.contains('[') && found.contains(']') {
            check_bracketed_netloc(&found)?;
        }
        netloc = Some(found);
    }
    let mut fragment = None;
    if let Some((before, after)) = url.split_once('#') {
        fragment = Some(after.to_owned());
        url = before.to_owned();
    }
    let mut query = None;
    if let Some((before, after)) = url.split_once('?') {
        query = Some(after.to_owned());
        url = before.to_owned();
    }
    check_netloc(netloc.as_deref().unwrap_or(""))?;
    Ok(Parts {
        scheme,
        netloc,
        path: url,
        query,
        fragment,
    })
}

pub fn urlsplit(url: &str) -> Result<Split, String> {
    let parts = split_parts(url)?;
    Ok(Split {
        scheme: parts.scheme.unwrap_or_default(),
        netloc: parts.netloc.unwrap_or_default(),
        path: parts.path,
        query: parts.query.unwrap_or_default(),
        fragment: parts.fragment.unwrap_or_default(),
    })
}

/// Whether `url` opens a `//` authority, even an empty one: `_urlsplit`'s netloc is not
/// `None`. `urlsplit` gives `''` either way.
pub fn has_authority(url: &str) -> Result<bool, String> {
    Ok(split_parts(url)?.netloc.is_some())
}

const USES_RELATIVE: [&str; 20] = [
    "", "ftp", "http", "gopher", "nntp", "imap", "wais", "file", "https", "shttp", "mms",
    "prospero", "rtsp", "rtsps", "rtspu", "sftp", "svn", "svn+ssh", "ws", "wss",
];

const USES_NETLOC: [&str; 27] = [
    "",
    "ftp",
    "http",
    "gopher",
    "nntp",
    "telnet",
    "imap",
    "wais",
    "file",
    "mms",
    "https",
    "shttp",
    "snews",
    "prospero",
    "rtsp",
    "rtsps",
    "rtspu",
    "rsync",
    "svn",
    "svn+ssh",
    "sftp",
    "nfs",
    "git",
    "git+ssh",
    "ws",
    "wss",
    "itms-services",
];

fn unsplit(
    scheme: Option<&str>,
    netloc: Option<&str>,
    path: &str,
    query: Option<&str>,
    fragment: Option<&str>,
) -> String {
    let mut url = path.to_owned();
    if let Some(netloc) = netloc {
        if !url.is_empty() && !url.starts_with('/') {
            url.insert(0, '/');
        }
        url = format!("//{netloc}{url}");
    } else if url.starts_with("//") {
        url = format!("//{url}");
    }
    if let Some(scheme) = scheme.filter(|s| !s.is_empty()) {
        url = format!("{scheme}:{url}");
    }
    if let Some(query) = query {
        url = format!("{url}?{query}");
    }
    if let Some(fragment) = fragment {
        url = format!("{url}#{fragment}");
    }
    url
}

/// `urllib.parse.urlunsplit(parts)` for a `urlsplit` result: empty components are dropped,
/// except the empty netloc a netloc scheme keeps before an absolute path.
pub fn urlunsplit(parts: &Split) -> String {
    let some = |s: &str| (!s.is_empty()).then_some(s.to_owned());
    let netloc = if parts.netloc.is_empty() {
        (USES_NETLOC.contains(&parts.scheme.as_str())
            && !parts.scheme.is_empty()
            && (parts.path.is_empty() || parts.path.starts_with('/')))
        .then(String::new)
    } else {
        Some(parts.netloc.clone())
    };
    unsplit(
        some(&parts.scheme).as_deref(),
        netloc.as_deref(),
        &parts.path,
        some(&parts.query).as_deref(),
        some(&parts.fragment).as_deref(),
    )
}

/// `urllib.parse.urljoin(base, url)` of CPython 3.15.
pub fn urljoin(base: &str, url: &str) -> Result<String, String> {
    if base.is_empty() {
        return Ok(url.to_owned());
    }
    if url.is_empty() {
        return Ok(base.to_owned());
    }
    let b = split_parts(base)?;
    let Parts {
        scheme,
        mut netloc,
        mut path,
        mut query,
        mut fragment,
    } = split_parts(url)?;
    let scheme = scheme.or(b.scheme.clone());
    let named = scheme.as_deref().filter(|s| !s.is_empty());
    if scheme != b.scheme || named.is_some_and(|s| !USES_RELATIVE.contains(&s)) {
        return Ok(url.to_owned());
    }
    if named.is_none_or(|s| USES_NETLOC.contains(&s)) {
        if netloc.as_deref().is_some_and(|n| !n.is_empty()) {
            return Ok(unsplit(
                scheme.as_deref(),
                netloc.as_deref(),
                &path,
                query.as_deref(),
                fragment.as_deref(),
            ));
        }
        netloc = b.netloc.clone();
    }
    if path.is_empty() {
        path = b.path.clone();
        if query.is_none() {
            query = b.query.clone();
            if fragment.is_none() {
                fragment = b.fragment.clone();
            }
        }
        return Ok(unsplit(
            scheme.as_deref(),
            netloc.as_deref(),
            &path,
            query.as_deref(),
            fragment.as_deref(),
        ));
    }
    let mut base_parts: Vec<&str> = b.path.split('/').collect();
    if base_parts.last() != Some(&"") {
        base_parts.pop();
    }
    let segments: Vec<&str> = if path.starts_with('/') {
        path.split('/').collect()
    } else {
        let mut all = base_parts;
        all.extend(path.split('/'));
        // segments[1:-1] = filter(None, segments[1:-1])
        if all.len() > 2 {
            let last = all.len() - 1;
            let mut kept = vec![all[0]];
            kept.extend(all[1..last].iter().filter(|s| !s.is_empty()));
            kept.push(all[last]);
            kept
        } else {
            all
        }
    };
    let mut resolved: Vec<&str> = Vec::new();
    for seg in &segments {
        match *seg {
            ".." => {
                resolved.pop();
            }
            "." => {}
            _ => resolved.push(seg),
        }
    }
    if matches!(segments.last(), Some(&".") | Some(&"..")) {
        resolved.push("");
    }
    let joined = resolved.join("/");
    Ok(unsplit(
        scheme.as_deref(),
        netloc.as_deref(),
        if joined.is_empty() { "/" } else { &joined },
        query.as_deref(),
        fragment.as_deref(),
    ))
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
    // Port ipaddress's grammar if an address is found that the two treat differently.
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

/// `.port` of a split URL: None when absent or empty, else its value, or CPython's
/// `ValueError` text for a port that is not all ASCII digits or exceeds 65535.
pub fn port(netloc: &str) -> Result<Option<u16>, String> {
    let hostinfo = netloc.rsplit_once('@').map_or(netloc, |(_, h)| h);
    let port = match hostinfo.split_once('[') {
        Some((_, bracketed)) => bracketed
            .split_once(']')
            .map_or("", |(_, rest)| rest.split_once(':').map_or("", |(_, p)| p)),
        None => hostinfo.split_once(':').map_or("", |(_, p)| p),
    };
    if port.is_empty() {
        return Ok(None);
    }
    if !port.bytes().all(|b| b.is_ascii_digit()) {
        return Err(format!(
            "Port could not be cast to integer value as {}",
            crate::py::repr_str(port)
        ));
    }
    // A string pattern: Lizard 1.18 to 1.25.0 (Codacy) misread the char literal and ran
    // this function on to the end of the file.
    let digits = port.trim_start_matches("0");
    match digits.len() {
        0 => Ok(Some(0)),
        1..=5 => digits
            .parse::<u16>()
            .map(Some)
            .map_err(|_| "Port out of range 0-65535".to_owned()),
        _ => Err("Port out of range 0-65535".to_owned()),
    }
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

/// `urllib.parse.unquote(text, errors=...)`: only ASCII runs are percent-decoded.
/// `strict` stands in for `surrogatepass`: Rust strings cannot hold the lone surrogates
/// that error handler admits, so such paths take the `replace` fallback.
pub fn unquote(text: &str, strict: bool) -> Option<String> {
    if !text.contains('%') {
        return Some(text.to_owned());
    }
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while !rest.is_empty() {
        let ascii = rest.find(|c: char| !c.is_ascii()).unwrap_or(rest.len());
        let (run, tail) = rest.split_at(ascii);
        let mut bytes = Vec::with_capacity(run.len());
        let mut bits = run.as_bytes().split(|b| *b == b'%');
        bytes.extend_from_slice(bits.next().unwrap_or_default());
        for item in bits {
            let hex = item.get(..2).and_then(|h| std::str::from_utf8(h).ok());
            match hex.and_then(|h| {
                u8::from_str_radix(h, 16)
                    .ok()
                    .filter(|_| h.bytes().all(|b| b.is_ascii_hexdigit()))
            }) {
                Some(byte) => {
                    bytes.push(byte);
                    bytes.extend_from_slice(&item[2..]);
                }
                None => {
                    bytes.push(b'%');
                    bytes.extend_from_slice(item);
                }
            }
        }
        match String::from_utf8(bytes) {
            Ok(decoded) => out.push_str(&decoded),
            Err(_) if strict => return None,
            Err(e) => out.push_str(&String::from_utf8_lossy(e.as_bytes())),
        }
        let non_ascii = tail.find(|c: char| c.is_ascii()).unwrap_or(tail.len());
        out.push_str(&tail[..non_ascii]);
        rest = &tail[non_ascii..];
    }
    Some(out)
}

#[cfg(test)]
mod tests;
