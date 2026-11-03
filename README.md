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

## Use without a workflow file

`review-app.yml` reviews pull requests in any `Timpan4` repository where the
reviewer GitHub App is installed, with nothing added to that repository:

1. The App's `pull_request` webhook goes to
   [`Timpan4/ocr-dispatch`](https://github.com/Timpan4/ocr-dispatch) at
   `https://ocr.timpan.dev/hooks/github`.
2. ocr-dispatch dispatches `ocr-dispatch.yml` in `wall-e-infra` with the
   repository, pull request number, and head SHA.
3. That workflow calls `review-app.yml@v1` on the `wall-e-infra` runner set,
   passing the App's client ID and private key as secrets.
4. `review-app.yml` mints an App token for the one repository, with Contents
   read and Pull requests write. It reads the pull request again and skips it
   when it is closed, a draft, from a fork, a Kargo promotion, or no longer at
   the dispatched head. It also skips repositories whose
   `.github/workflows/code-review.yml` still calls `review.yml`, so no pull
   request is reviewed twice while callers are removed.
5. It runs the same OCR install, settings, and review steps as `review.yml`,
   and posts as the App.

The App posts as `<app-slug>[bot]`, and an installation token cannot read its
own login, so the post step reports that login to the poster. Without it,
`incremental` would match only `github-actions[bot]` comments and repeat the
App's own findings on every push.

## Posting

The workflow posts with OCR's own `post-review-comments.js` and sets two of its
options:

- `incremental`: a single-line finding is skipped when an earlier single-line
  comment sits on the same line. A multi-line finding is skipped when its
  intersection over union with an earlier multi-line comment's range is
  strictly greater than 0.6: the lines both ranges cover, divided by the lines
  either range covers. A single-line finding inside an earlier range still
  posts.
  Resolved threads count, so a later push does not raise a finding again after
  the author fixed or dismissed it. A comment on lines that only shifted keeps
  matching. A comment whose lines a later push changed becomes outdated
  (GitHub sets its `line` to null) and no longer matches, so a finding on
  rewritten code can repeat. Earlier comments are recognized by the poster's
  login only, so review comments from another tool that also posts as
  `github-actions[bot]` suppress findings too.
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
