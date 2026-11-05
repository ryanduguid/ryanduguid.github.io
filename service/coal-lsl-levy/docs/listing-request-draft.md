# Listing request draft

Unsent. Complete the base URL, published source revision and live check result
before sending. No listing or external conformance approval is claimed.

To: andrew@lodgeit.net.au
Subject: Coal LSL levy API for the LodgeiT constellation

Andrew,

Thanks for the invitation. I have prepared the Coal LSL levy calculator for the
surface described on your publishing page.

Base URL: [insert verified deployed URL]
Source and fixtures: [insert published source revision]
Live conformance check: [insert date and result]

The API includes calculator and module discovery, OpenAPI 3.1, health routes,
field-specific validation, factual refusals, and manifests with SHA-256 hashes
of the rate and method records. Money and rates are decimal strings. It uses
the same deterministic engine as my browser calculator.

There are 23 synthetic cases, including 8 calculations with expected figures
and derivations. The checker verifies their values, served evidence hashes and
byte-identical repeated responses.

The calculator is `urn:sbrm:calculator:coal-lsl:levy`, under
`urn:sbrm:module:coal-lsl`. Periods use reporting months, for example
`urn:sbrm:period:coal-lsl-levy:2026-06`. Current evidence supports January 2024
to August 2026. Later months are refused until the register supports them.

The endpoint needs no key. It accepts requests up to 16 KiB and allows 60 per
minute per IP per Cloudflare location. The platform's counters are eventually
consistent. Results are review aids based on supplied eligibility and pay
facts, without a coverage determination or lodgement function.

Please run your conformance pass and let me know whether anything needs to
change for an external listing.

Ryan
