# Candidate Ballot Builder

A static, independent site for creating a personal ranking of Israeli Democrats primary candidates through pairwise comparisons.

This is a personal, unofficial tool. It is not affiliated with, approved by, or operated by the Israeli Democratic Party.

Candidate information and images come from a snapshot of the official public candidates page:
<https://democrats.org.il/candidates/>

## Run Locally

You can open `index.html` directly in a browser, or run a simple static server:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Refresh Candidate Data

```bash
node tools/scrape-candidates.mjs
```

This updates `candidates.js` from the official candidates page.

## How Ranking Works

Before ranking starts, choose which candidates should participate. The site then runs merge sort on a randomized order of only the selected participants.

Whenever the algorithm needs to compare two candidates, it asks the user to choose one. The site also remembers inferred preferences: if you already chose A over B and B over C, it knows A is preferred over C and skips that question.

The final list includes only the participants selected before ranking began.

The results page can generate a shareable PNG image containing only the top 8 ranked candidates.

## GitHub Pages

1. Push these files to a GitHub repository.
2. Open Settings -> Pages.
3. Choose Deploy from a branch.
4. Select the branch and the `/` folder.
5. Save and open the GitHub Pages URL once deployment finishes.
