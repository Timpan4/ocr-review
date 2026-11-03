# ocr-review

A reusable GitHub Actions workflow that reviews pull requests with
[OpenCodeReview](https://github.com/alibaba/open-code-review) (OCR) on the
`wall-e-review` self-hosted runners. The runners, their limits, and the ChatGPT
session they use are managed in the private `wall-e-infra` repository.

It lives in its own public repository because GitHub lets public repositories
call reusable workflows only from public repositories. It contains no secrets.

## Use

Only repositories owned by `Timpan4` that have a `wall-e-review` runner set can
run it. In such a repository, add `.github/workflows/code-review.yml`:

```yaml
name: code-review
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
permissions:
  contents: read
  pull-requests: write
jobs:
  review:
    uses: Timpan4/ocr-review/.github/workflows/review.yml@v1
```

The job skips drafts, Kargo promotion branches, and pull requests from forks.
On a public repository, also require approval for fork pull request workflows
from all outside contributors: a fork pull request can edit the caller workflow
itself.

## Posting

The workflow posts with OCR's own `post-review-comments.js` and sets two of its
options:

- `incremental`: a finding is skipped when an earlier OCR comment on the pull
  request sits on the same line, or, for a multi-line finding, on a range whose
  overlap is more than 60% of the two ranges combined. Resolved threads count. A later push therefore does not raise
  a finding again after the author fixed or dismissed it. A comment whose code
  has since moved is no longer matched, so a finding on moved code can repeat.
- `routeCategories: 'performance'`: performance findings go to the summary
  comment instead of inline threads. In a measured sample of 30 KubeCove pull
  requests, none of 10 inline performance findings led to a change, and none
  came with a measurement.

## Settings

`settings.json` on `main` holds the settings shared by every repository. The
workflow reads it from `main` at the start of each review, so a change applies
to the next review without a release. The settings page at
https://ocr.timpan.dev/settings edits it and commits to `main`; editing it by
hand works the same way.

| Key | Meaning | Default |
| --- | --- | --- |
| `model` | ChatGPT model for the `chatgpt` provider. | `gpt-6.1-sol` |
| `effort` | `ocr review --effort`: `low`, `medium` or `high`. `""` uses OCR's default. | `""` |
| `noFilter` | `--no-filter`: keep every comment, skip OCR's LLM post-filtering. | `false` |
| `exclude` | `--exclude`: gitignore-style patterns to skip, merged with each repository's `rule.json` excludes. | `[]` |
| `maxTokensBudget` | `--max-tokens-budget`: token budget per review, checked before each LLM round. It is a soft limit: a group already over it gets one final round, and groups in flight finish. `0` sets no budget. | `0` |
| `timeoutMinutes` | `--timeout`: time limit in minutes for each review group, multiplied by the template's review rounds. It does not limit the whole review. `0` sets no limit; the job still stops at 60 minutes. At most `60`, the job timeout. | `15` (OCR's default) |

The workflow rejects unknown keys, missing keys and invalid values and fails
the job, so a bad edit cannot silently fall back to defaults. `--timeout` is
always passed, because OCR treats a missing flag as 15 minutes. The other flags
are passed only for non-default values.

## Releases

Callers follow the `v1` tag. To release a change, tag it `v1.x.y` and move `v1`
to the same commit. When upgrading OCR, change `OCR_VERSION`, `OCR_SHA256` (the
release's `opencodereview-linux-amd64` digest) and `OCR_POSTER_SHA256` (the
`scripts/github-actions/post-review-comments.js` digest at that tag) together.
