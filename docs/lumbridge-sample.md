# Maintaining the Lumbridge sample

The workbook and sample ZIP in `assets/examples/lumbridge/` let a reader use
the synthetic forecast without a development environment. The adjacent
`README.txt` records its source commit, workbook SHA-256, verification and limits.

The sample uses the existing `au-fpa-pack` example. Its model and six input
files match the pinned source after line-ending normalisation. The workbook
is the exact file from the recorded native Excel check. It contains no macros
or external links. The website does not execute it.

When updating the sample:

1. Choose a reviewed source commit and run the locked example command in
   `README.txt`, plus the source repository's required checks.
2. Verify the workbook formulas and the 0-to-45-to-0 scenario in desktop Excel.
   Record the version, results and hash of the file being distributed.
3. Package the workbook, six input files, model notes, trial guide, fixed
   briefing and CSV/JSON exports, and the source MIT licence. Adapt relative
   documentation links to the archive layout. Keep the answer key separate.
4. Update the public sample record and the figures, source link and limits
   on `/evaluate/#profit-and-cash`. Keep trial feedback distinct from technical
   verification and client outcomes.
5. Regenerate the machine indexes and run the website checks in CONTRIBUTING.md.
   Open both downloads from the built page and compare their bytes with the
   source assets.

The public sample includes expected results. A separate review kit can omit
those exports for an unaided trial, with any prior exposure recorded. No
independent accountant trial has been completed as at 11 September 2026.
