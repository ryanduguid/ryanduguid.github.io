use super::*;

/// Expected values from CPython 3.15's urljoin, for links on one of this site's pages.
#[test]
fn joins_page_links_like_urllib() {
    for (base, url, expected) in [
        (
            "https://duguid.com.au/rates/example/",
            "rates.csv",
            "https://duguid.com.au/rates/example/rates.csv",
        ),
        (
            "https://duguid.com.au/rates/example/",
            "../",
            "https://duguid.com.au/rates/",
        ),
        (
            "https://duguid.com.au/rates/example/",
            "../../../../x",
            "https://duguid.com.au/x",
        ),
        (
            "https://duguid.com.au/rates/example/",
            "//cdn.example.test/x",
            "https://cdn.example.test/x",
        ),
        (
            "https://duguid.com.au/rates/example/",
            "?q=1",
            "https://duguid.com.au/rates/example/?q=1",
        ),
        (
            "https://duguid.com.au/rates/example/",
            "#f",
            "https://duguid.com.au/rates/example/#f",
        ),
        (
            "https://duguid.com.au/rates/example/",
            "mailto:x@y",
            "mailto:x@y",
        ),
        (
            "https://duguid.com.au/rates/example/",
            "HTTP://Example.TEST/A",
            "HTTP://Example.TEST/A",
        ),
    ] {
        assert_eq!(urljoin(base, url).unwrap(), expected, "{base} + {url}");
    }
}

/// Expected values from CPython 3.15's urljoin.
#[test]
fn joins_like_urllib() {
    for (base, url, expected) in [
        ("https://a.test/b/c", "./", "https://a.test/b/"),
        ("https://a.test/b/c", "..", "https://a.test/"),
        ("https://a.test/b/c?x#y", "", "https://a.test/b/c?x#y"),
        ("https://a.test/b/c?x#y", "#z", "https://a.test/b/c?x#z"),
        ("https://a.test/b/c?x#y", "?", "https://a.test/b/c?"),
        ("https://a.test", "x", "https://a.test/x"),
        ("https://a.test/b/", "a//b/./c/..", "https://a.test/b/a/b/"),
        ("http://a/b/c/d;p?q", "g;x?y#s", "http://a/b/c/g;x?y#s"),
        ("http://a/b/c/d;p?q", "../../../g", "http://a/g"),
        ("http://a/b/c/d;p?q", "/./g", "http://a/g"),
        ("", "x", "x"),
        ("foo:bar", "x", "x"),
        ("https://a.test/b", "ftp://h/x", "ftp://h/x"),
        ("https://a.test/b", "https:x", "https://a.test/x"),
        ("https://a.test/b", "tel:1", "tel:1"),
    ] {
        assert_eq!(urljoin(base, url).unwrap(), expected, "{base} + {url}");
    }
    assert!(urljoin("https://a.test/", "http://[::1").is_err());
}

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

/// Expected values from CPython 3.15's `urlsplit(url).port`.
#[test]
fn ports_like_urllib() {
    let zeros = format!("duguid.com.au:{}443", "0".repeat(25));
    let cast = |p: &str| Err(format!("Port could not be cast to integer value as '{p}'"));
    let range = || Err("Port out of range 0-65535".to_owned());
    for (netloc, expected) in [
        ("duguid.com.au", Ok(None)),
        ("duguid.com.au:", Ok(None)),
        ("duguid.com.au:443", Ok(Some(443))),
        ("duguid.com.au:0443", Ok(Some(443))),
        (zeros.as_str(), Ok(Some(443))),
        ("duguid.com.au:0", Ok(Some(0))),
        ("duguid.com.au:65535", Ok(Some(65535))),
        ("duguid.com.au:65536", range()),
        ("duguid.com.au:99999999999999999999999", range()),
        ("duguid.com.au:4a3", cast("4a3")),
        ("duguid.com.au:+443", cast("+443")),
        ("duguid.com.au: 443", cast(" 443")),
        (
            "duguid.com.au:\u{664}\u{664}\u{663}",
            cast("\u{664}\u{664}\u{663}"),
        ),
        ("user:pw@duguid.com.au:8443", Ok(Some(8443))),
        ("[::1]:8080", Ok(Some(8080))),
        ("[::1]", Ok(None)),
    ] {
        assert_eq!(port(netloc), expected, "{netloc}");
    }
}

#[test]
fn urlunsplit_keeps_a_double_slash_path_and_an_empty_file_netloc() {
    let round = |url: &str| urlunsplit(&urlsplit(url).unwrap());
    assert_eq!(round("////x"), "////x");
    assert_eq!(round("file:///etc/hosts"), "file:///etc/hosts");
    assert_eq!(round("mailto:a@b"), "mailto:a@b");
}

#[test]
fn urljoin_takes_the_base_parts_a_reference_leaves_out() {
    assert_eq!(urljoin("http://a/b?q#f", "#g"), Ok("http://a/b?q#g".into()));
    assert_eq!(urljoin("http://a/b?q#f", "?r"), Ok("http://a/b?r".into()));
    assert_eq!(
        urljoin("http://a/b?q#f", "http:"),
        Ok("http://a/b?q#f".into())
    );
}

#[test]
fn brackets_in_the_userinfo_leave_the_host_to_be_checked() {
    assert_eq!(
        urlsplit("http://[x]@host:80/").map(|s| s.netloc),
        Err("'host' does not appear to be an IPv4 or IPv6 address".into())
    );
}
