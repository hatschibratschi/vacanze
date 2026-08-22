# Links

- https://hatschibratschi.github.io/vacanze
- [shared iCloud album](https://www.icloud.com/sharedalbum/#B2FG4TcsmGKVIyF)

# Workflow

1. Write .md, push to diary/ on GitHub.
2. Reload the page — entries are fetched live from the GitHub API, so a push usually shows up within a few minutes.


# Running locally

This is a static site with no build step. Serve the folder with any static file server, e.g.:

``` shell
python3 -m http.server 8000
```

Then open http://localhost:8000 in your browser.

Note: the diary listing is fetched live from the GitHub API (`api.github.com/repos/hatschibratschi/vacanze/contents/diary`), which reads from the `main` branch — so entries added to `diary/` only show up locally or on GitHub Pages after they're pushed.

# Adding a diary entry

Add a markdown file to `diary/` named `YYYYMMDD.md`, with front matter like:

``` md
---
tags:
  - Italy
  - Food
vacationName: Italy 2026 II
---

# Title of the entry

Text and ![alt text](image-url) go here.
```

Files sharing the same `vacationName` are grouped into one trip; `tags` become the filter chips for that trip.


