# Contributing

The site is HTML with shared Jekyll includes, checked by standard-library
Python scripts and a small set of Node tests. Read [DESIGN.md](DESIGN.md)
before changing a page.

## Local checks

Use Ruby 3.3 with Bundler, Python 3.10 or newer and Node 22. Run `bundle install`
once for the locked Jekyll build. `.github/workflows/checks.yml` runs the
pinned linters first, then the site checks on Python 3.10, 3.12 and 3.13:

```bash
python -m pip install "ruff==0.16.6" "mypy==2.3.1"
python -m ruff check .
python -m mypy
python scripts/check_site.py
```

The browser and Lighthouse jobs need `npm ci` and Chromium; the README
describes them.

Install the git hooks once with `python -m pip install pre-commit && pre-commit install`; they run the pinned ruff check and ruff format on staged files.

## Pull requests

Suggested resources should support Australian accounting work, have clear
documentation and current maintenance where applicable, and be open-source
software, official public resources or free developer interfaces.

Keep every link to a live target, keep marketing vocabulary out of visible
text, and regenerate `llms-full.txt` with `python scripts/build_llms_full.py
--write` when a page's main text changes. For a potential security
vulnerability follow [SECURITY.md](SECURITY.md).
