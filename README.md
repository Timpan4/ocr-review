# ocr-review

A reusable GitHub Actions workflow, `review-app.yml`, that reviews pull
requests with [OpenCodeReview](https://github.com/alibaba/open-code-review)
(OCR) on the `wall-e-review` self-hosted runners. The runners, their limits,
and the ChatGPT session they use are managed in the private `wall-e-infra`
repository.

The repository stays public because the workflow reads `settings.json` with
the calling repository's token, which cannot read another private repository.
It contains no secrets.

## How it runs

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
   the dispatched head.
5. It installs OCR, loads the settings, reviews the diff, and posts as the
   App.

The App posts as `<app-slug>[bot]`, and an installation token cannot read its
own login, so the post step reports that login to the poster. Without it,
`incremental` would match only `github-actions[bot]` comments and repeat the
App's own findings on every push. The poster also always counts
`github-actions[bot]` comments, so findings that the retired `review.yml`
posted on an open pull request are not repeated.

A fork pull request never runs here: no workflow runs in the reviewed
repository, the receiver drops fork pull requests, and the workflow checks the
head repository again before checking out any code.

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
  rewritten code can repeat. Earlier comments count when they come from the
  App's login or from `github-actions[bot]`, so review comments from another
  Actions workflow on the same lines suppress findings too.
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
| `include` | Gitignore-style patterns to review even when OCR would skip them for their extension or a built-in path such as a nested `**/vendor/**`, for example `**/*.md`. Provider directories at the repository root, such as `vendor/`, `node_modules/` and `target/`, stay excluded. Written as `include` in `~/.opencodereview/rule.json` on the runner. Same pattern rules as `exclude`. `exclude` still wins over `include`. | `[]` |
| `maxTokensBudget` | `--max-tokens-budget`: token budget per review, checked before each LLM round. It is a soft limit: a group already over it gets one final round, and groups in flight finish. `0` sets no budget. | `0` |
| `timeoutMinutes` | `--timeout`: time limit in minutes for each review group, multiplied by the template's review rounds. It does not limit the whole review. `0` sets no limit; the job still stops at 60 minutes. At most `60`, the job timeout. | `15` (OCR's default) |

The workflow rejects unknown keys, missing keys and invalid values and fails
the job, so a bad edit cannot silently fall back to defaults. The one
exception is `include`: a file without it reads as `[]`, so the workflow could
ship before `settings.json` gained the key. `--timeout` is always passed,
because OCR treats a missing flag as 15 minutes. The other flags are passed
only for non-default values.

OCR has no flag for `include`, so the workflow writes the patterns to
`~/.opencodereview/rule.json`, OCR's global rule layer, when the list is not
empty. A repository's own `.opencodereview/rule.json` replaces that layer
completely when it sets a non-empty `include` or `exclude`, even when it sets
only `exclude` or different `include` patterns. Such a repository must repeat
the shared `include` patterns in its own file to keep them. A repository file
with neither list, such as `{}`, leaves the global layer in effect.

## Releases

wall-e-infra's `ocr-dispatch.yml` follows the `v1` tag. To release a change,
tag it `v1.x.y` and move `v1` to the same commit. A new `settings.json` key
needs the workflow release first, because the released workflow rejects keys
it does not know; then the settings page release, which validates the same
keys; then the value in `settings.json`.

When upgrading OCR, change `OCR_VERSION`, `OCR_SHA256` (the release's
`opencodereview-linux-amd64` digest) and `OCR_POSTER_SHA256` (the
`scripts/github-actions/post-review-comments.js` digest at that tag) together.
