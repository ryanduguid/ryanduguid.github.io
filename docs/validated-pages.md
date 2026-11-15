# Publish the validated Pages artifact

The proposed publisher uses the Jekyll tree checked by the main `checks` job.
It waits for `checks-gates` and `publication`, then rechecks main and the external results after
admission to `github-pages`. Deployment is serialised, and only the deploy job
holds Pages and identity-token write permissions. PR, scheduled and manual runs
cannot publish. The artifact name includes the source SHA and run attempt.

Deployment is held while `PAGES_VALIDATED_DEPLOYMENT` is absent or false. The
`CodeQL` results check from app 57789 exists only on pull requests; main gets
CodeQL default setup's `dynamic/github-code-scanning/codeql` run instead. So
`site-tools check_publication` accepts the check where there is one. Where there
is none, it accepts a successful default-setup run for the exact main commit
from this repository, once code scanning lists that commit's CodeQL analysis and
2 reads of main's open CodeQL alerts agree. Any open alert on main at GitHub's
default failure threshold for that check (error severity, or high or critical
security severity), however old, refuses publication; a repository setting that
changes the threshold is not read. It also refuses a failed analysis, and waits
while the analysis runs or the alerts settle. Only the main-only `publication`
job and the `deploy` job read the alerts with `security-events: read`, so pull
request code never gets that permission.

## Activation and hosted checks

After publication approval, verify the exact main result identity, the trusted
attribution audit job, token permissions and the `github-pages` branch rule.
Publish this workflow before switching Pages from legacy branch builds to
Actions. Disable the legacy path before enabling `PAGES_VALIDATED_DEPLOYMENT`;
two active publishers would bypass the ordering contract. Use 'Re-run all jobs'
on a push of the current main SHA after enabling it. Rerunning only failed jobs
cannot recreate the artifact named for the new run attempt.

Verify successful publication, a failed mandatory dependency, a cancelled
validation run, delayed external results, missing results and a run delayed
until main advances. Confirm that each browser and Lighthouse shard remains
mandatory, and that a new non-exempt job omitted from the aggregate fails.
`deploy` and `publication`, which run only on main pushes, are the only aggregate
exemptions besides the scheduled fuzzing job.

The package retains `.well-known`, which the native Pages upload action excludes.
Its deployment metadata supplies the published SHA for the smoke check. The
deploy job downloads and extracts that exact artifact, verifies its metadata and
page files before publication, and uses the extracted tree for the delivery
comparison. The deploy action reads artifacts from the same workflow run.
Verify the archive contents and production checker in a hosted run.

Main can change after the last API read. Serial deployment prevents an older
admitted run overwriting a newer deployment through this workflow, but the API
read and Pages write are not atomic. A failed smoke check reports a failure
after publication; it does not roll back automatically.

## Recovery

If an external check fails or remains missing, repair it and rerun the original
push with 'Re-run all jobs' while its SHA remains main. The guard requires all
CodeQL results to succeed; qualify the provider's rerun behaviour before activation,
because a retained failed result can still block publication. When main has advanced, validate the new main
commit instead. Do not force an old artifact through the freshness guard.

For a content regression, revert it through a reviewed PR. The new main commit
must pass the same validation and publication gates. Preserve the last successful
run, artifact identity and source SHA in the incident record. Changes to Pages
settings or emergency publication outside this workflow need separate approval.
