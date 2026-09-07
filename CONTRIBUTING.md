# Contributing

The site is static HTML under version control, checked by standard-library
Python scripts and a small set of Node tests. Read [DESIGN.md](DESIGN.md)
before changing a page and [GATES.md](GATES.md) for the recorded gate
evidence.

## Local checks

Python 3.10 or newer and Node 22. `.github/workflows/checks.yml` runs the
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

Keep every link to a live target, keep marketing vocabulary out of visible
text, and regenerate `llms-full.txt` with `python scripts/build_llms_full.py
--write` when a page's main text changes. For a potential security
vulnerability follow [SECURITY.md](SECURITY.md).
