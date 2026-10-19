//! Serve one directory on a free loopback port without building the site, printing the
//! port first: the Rust side of the serve_site differential harness.
fn main() -> std::io::Result<()> {
    let directory = std::env::args_os()
        .nth(1)
        .expect("usage: serve_dir DIRECTORY");
    let listener = site_tools::serve_site::create_server(0)?;
    println!("{}", listener.local_addr()?.port());
    site_tools::serve_site::serve(listener, std::path::Path::new(&directory))
}
