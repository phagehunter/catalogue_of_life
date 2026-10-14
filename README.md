# Catalogue of Life Explorer

An independent, fully static website for browsing, searching and comparing
every named species in the [Catalogue of Life](https://www.catalogueoflife.org/).
It runs on GitHub Pages with no server: a GitHub Action turns the Catalogue of
Life download into small JSON files and the browser fetches only what a page needs.

Live site: https://phagehunter.github.io/catalogue_of_life/

This project is not affiliated with or endorsed by the Catalogue of Life.
Code is MIT licensed (see `LICENSE`); the data is CC BY 4.0 by the Catalogue of Life.

| Where | What |
| --- | --- |
| `website/README.md` | architecture, local development, deploying your own copy |
| `website/scripts/` | `process_data.py`, the ColDP → static JSON processor, with tests |
| `website/frontend/` | the React + Vite site, with tests |
| `.github/workflows/deploy.yml` | Release-triggered build and deploy to `gh-pages` |
| `.github/workflows/ci.yml` | tests and build on every pull request |
