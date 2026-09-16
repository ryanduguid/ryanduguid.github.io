# Credential document and badge sources

These files support the Xero entry in the
[evidence register](https://duguid.com.au/evidence/#xero-certification). They are
Ryan Duguid's own credential records and Xero's own artwork. They are **not**
covered by this repository's MIT licence, which applies to the site's code and
its own text.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `ryan-duguid-xero-certified-specialist-level-3.pdf` | 221361 | `d486397756a28c626237566d6a11b66b02ab2afa0bf7ee08c297b9775765ae00` |
| `xero-certified-specialist-level-3-badge.png` | 23276 | `7d109c04cc66251b2d584f30817e0357d71ed121fcd91cd310661f5d6ed64447` |

## Certificate

`ryan-duguid-xero-certified-specialist-level-3.pdf` is the certificate Xero
issued to Ryan Duguid, copied byte for byte from the supplied original. Its text
layer reads "Ryan Duguid", "This certifies that the above person has
successfully completed and passed their Xero specialist certification",
"Certification date: 01/07/2026", "Valid until: 01/07/2027" and the signature
block "Vikki Bean, GM - Education & Content Delivery, Xero". The level appears in
the certificate artwork as "XERO CERTIFIED SPECIALIST LEVEL 3". The document
carries no certificate number, email address, member number or other personal
detail beyond the recipient's name, so it is published in full. Copyright in the
document remains with Xero.

## Badge

`xero-certified-specialist-level-3-badge.png` is the individual certification
badge Xero placed in that certificate: the 318 by 318 pixel image XObject
`5 0 R`, recombined with its `4 0 R` soft mask so the rounded corners stay
transparent. No pixel came from any other source, and no colour, proportion or
wording was changed. Reproduce it with `python scripts/extract_xero_badge.py`
against the source PDF; the script records the same hash as the table above.

The site is not a Xero partner, so no partner-tier artwork is used. The badge is
Xero's trademark, published here only as a factual record of Ryan Duguid's own
certification.

Usage requirements carried into the page:

- Shown at its native square aspect ratio, with `width` and `height` set so the
  box is reserved before the image loads.
- Given clear space on every side, at least a quarter of its displayed width, by
  the grid gap and padding in `.credential-card` in `assets/site.css`.
- Never recoloured, cropped, rotated, outlined or redrawn, and never placed on a
  background that fills its transparent corners with a competing colour.
- Never used as a link target on its own, and never presented as Xero's
  endorsement of this site, its tools or its author. The qualification name,
  holder and dates stay beside it as selectable text, so the badge carries no
  information on its own.

## Renewal

The certification runs from 1 July 2026 to 1 July 2027. Nothing computes that
state at build time, and no page claims a "current" status that would quietly
become false. On renewal, replace both files above, refresh this note's hashes,
and update the explicit dates in:

1. `evidence/index.html`, the `#xero-certification` entry.
2. `about/index.html`, the Certifications row in "The short facts".
3. `index.html`, the Practice software entry in the Verify section.
4. `README.md` in `ryanduguid/ryanduguid`, the Background section.
5. Replace the profile repository's local Xero badge, refresh its source hash,
   and update both `README.md` and `llms.txt` with the renewed dates.

Then regenerate the text indexes with
`python scripts/build_llms_full.py --write`.

## Payroll and Migration specialist badges

Xero's Payroll Specialist and Migration Specialist badges are partner-practice
badges, published in the Brandfolder collections
`brandfolder.com/s/vnkscb8sjx4njmjctg4xvqc3` and
`brandfolder.com/s/jzbtrvwf7m5xkr88r9tcn9w`. Access to those shared collections
is not evidence that anyone holds the status they mark. The certificate above
establishes Level 3 only, and no Xero record appears in either public credential
wallet linked from the GitHub profile, checked on 16 September 2026. Neither
badge is published here.

To add one later, this directory needs the Xero-issued completion certificate or
an issuer-hosted verification page naming Ryan Duguid and the specialist status,
plus confirmation that the badge may be used by an individual rather than a
partner practice. A partner badge would also need the site to be a Xero partner,
which it is not.
