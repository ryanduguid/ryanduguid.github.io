# Maintaining the Lumbridge sample

The workbook and sample ZIP in `assets/examples/lumbridge/` let a reader use
the synthetic forecast without a development environment. The adjacent
`README.txt` records its source commit, workbook SHA-256, verification and limits.

The sample uses the existing `au-fpa-pack` example. Its model and 6 input
files match the pinned source after line-ending normalisation. The workbook
is the exact file from the recorded native Excel check. It contains no macros
or external links. The website does not execute it.

When updating the sample:

1. Choose a reviewed source commit and run the locked example command in
   `README.txt`, plus the source repository's required checks.
2. Verify the workbook formulas and the 0-to-45-to-0 scenario in desktop Excel.
   Record the version, results and hash of the file being distributed.
3. Package the workbook, 6 input files, model notes, trial guide, fixed
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

## Human follow-through for the independent review

The public page `/evaluate/#independent-review` and the blank
`assets/examples/lumbridge/trial-response-template.txt` were added on
18 September 2026. Preparing them is not a trial. Before any claim about
external evaluation, a person needs to:

1. Recruit reviewers who have not seen the answers, record any prior exposure,
   and send them the sample pack and template only.
2. Let each trial run without coaching. Answer no questions during the trial;
   log every request for help as an observation.
3. Read each response against the expected figures, record differences and
   defects as issues, and separate usability findings from accounting findings.
4. Obtain the quotation permission the template asks for before quoting or
   naming anyone, and keep responses out of the repository.
5. Update the "independent accountant trial" sentences on the homepage,
   `/evaluate/` and `/contact/` only after at least one completed, uncoached
   response exists, and say how many were run and what changed as a result.

Until then the site states that external evaluation is pending.
