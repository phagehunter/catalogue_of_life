# Final Setup Guide

Three sections, all click-through-the-browser. **No command line. No coding.**
Publishing the GitHub Release does *everything* — it kicks off the build,
processes the 2.6 GB of TSVs, and deploys the site automatically.

---

## 1 · Connect this folder to a new GitHub repository

1. Go to **https://github.com/new** (sign in if you haven't already).
2. **Repository name**: `catalogue-of-life-explorer` (or anything you like).
3. **Visibility**: choose **Public** — required for free GitHub Pages.
4. Leave every "Initialize this repository with…" checkbox **unticked**
   (we already have a README and `.gitignore`).
5. Click **Create repository**.

You'll land on an empty repo page. Look for the line that says:

> **…or upload an existing file**

Click it. You're now on the upload screen.

6. Open the `website/` folder on your Desktop in Finder.
7. Press **Cmd + Shift + .** in Finder so hidden folders are visible
   (you need this to see `.github` and `.gitignore`).
8. Select **everything inside** the `website/` folder (the contents — *not*
   the folder itself) and drag onto the GitHub upload area:
   - `frontend/`
   - `scripts/`
   - `.github/`
   - `.gitignore`
   - `GUIDE.md`
   - `README.md`
9. Scroll down. Commit message: *Initial site*. Click **Commit changes**.

Then turn on Pages so the site has somewhere to live:

10. **Settings** tab → **Pages** (left sidebar).
11. Under **Build and deployment** → **Source**, choose **Deploy from a branch**.
12. **Branch** dropdown → choose `gh-pages` → folder `/ (root)` → **Save**.
13. The branch doesn't exist yet — that's fine. The first run of the
    workflow will create it.

> *If `gh-pages` isn't in the dropdown,* it just means the workflow has
> never run yet. Skip step 12 for now and come back to it after the first
> successful Action run (Section 3).

---

## 2 · Upload the TSV files to a Release

GitHub Releases cap each file at **2 GB**, but the full `NameUsage.tsv` is
~2.4 GB — over the limit. You've already split it into two pieces on your
Desktop:

- `NameUsage_part_aa` (~1.5 GB)
- `NameUsage_part_ab` (~989 MB)

The workflow re-joins them automatically (`cat` of the two parts is
byte-identical to the original). You only need to upload the parts.

1. In your repo, click **Releases** (right sidebar) → **Draft a new release**.
2. **Choose a tag** dropdown → type `data-v1` → click **Create new tag: data-v1 on publish**.
3. **Release title**: `Catalogue of Life raw data v1`
4. Scroll to the **Attach binaries** drop-zone near the bottom.
5. Drag these **four** files from your Desktop into the drop-zone:
   - `NameUsage_part_aa`
   - `NameUsage_part_ab`
   - `VernacularName.tsv`
   - `Distribution.tsv`
6. **Wait** until each file shows a green check ✅. Don't close the tab.
   - On a typical home fibre line, allow 15–30 minutes total.
   - If the connection drops, edit the release and re-upload only the
     missing file. The tag stays `data-v1`.
7. Click **Publish release**.

> ⚠️ The names matter. The workflow expects the parts to be called
> `NameUsage_part_aa` and `NameUsage_part_ab` (no extension). If you
> renamed them, rename them back before uploading — or upload more than
> two parts named `NameUsage_part_aa`, `NameUsage_part_ab`, `NameUsage_part_ac`,
> etc. The workflow joins anything matching `NameUsage_part_*` in
> alphabetical order.

🚀 **Publishing the release automatically triggers the build.** You don't
need to push any other button. Move on to Section 3.

---

## 3 · Watch the Actions tab to see the site build

1. In your repo, click the **Actions** tab.
2. You'll see a run named **Build & Deploy Catalogue of Life Site** with a
   yellow "in progress" dot. Click it to watch live logs.

Expected timeline for the first run:

| Step | Time |
| --- | --- |
| Free disk + install Python/Node | ~30 s |
| Download TSVs from your Release | 1–3 min |
| Process TSVs into sharded JSON | 10–30 min |
| Install npm deps + Vite build | 1–2 min |
| Push to `gh-pages` branch | < 1 min |

When all five steps go green ✅:

3. Go back to **Settings → Pages** and make sure the source is
   `gh-pages` / root (this only matters on the *very first* run, since
   the branch didn't exist before).
4. Your site is live at:

   ```
   https://<your-username>.github.io/<your-repo>/
   ```

   The Pages page in Settings shows the exact URL with a "Visit site"
   button once Pages picks up the gh-pages branch (≤ 60 s after the
   workflow finishes).

---

## Re-running later

| Want to… | Do this |
| --- | --- |
| Tweak the React frontend only | Push your changes to `main`. Then go to **Actions** → the workflow → **Run workflow** → leave `release_tag` as `data-v1`. The cache reuses the processed data; the run finishes in ~2 min. |
| Test with a small subset (fast) | **Actions** → **Run workflow** → set **Row limit** to `50000`. Useful while iterating on the UI. |
| Update to a fresh CoL dump | Repeat Section 2 with a new tag (e.g. `data-v2`). Publishing it triggers a full rebuild. |

---

## When something goes wrong

| Symptom | Fix |
| --- | --- |
| **Workflow fails on "Download TSVs"** or "Reassemble NameUsage.tsv" | Open the release. File names must match exactly (case sensitive): `NameUsage_part_aa`, `NameUsage_part_ab`, `VernacularName.tsv`, `Distribution.tsv`. Re-upload anything that's missing or misspelled, then re-run the workflow from the **Actions** tab. |
| **The 2.4 GB upload keeps failing in Safari** | Use Chrome — its uploader is more forgiving on multi-GB transfers. |
| **Site loads but every page shows "Could not load dataset"** | The data step probably failed silently. Open the Actions log and look for red. The most common cause is the TSV file names not matching. |
| **Page is blank after deploy** | Hard-refresh with Cmd + Shift + R. If still blank, confirm **Settings → Pages → Source** is set to `gh-pages` branch. |
| **Total cost** | Free. Public repos get unlimited Pages bandwidth and 2 000 Action minutes/month — well above what this project uses. |
