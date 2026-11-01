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

## Releases

Callers follow the `v1` tag. To release a change, tag it `v1.x.y` and move `v1`
to the same commit. When upgrading OCR, change `OCR_VERSION`, `OCR_SHA256` (the
release's `opencodereview-linux-amd64` digest) and `OCR_POSTER_SHA256` (the
`scripts/github-actions/post-review-comments.js` digest at that tag) together.
