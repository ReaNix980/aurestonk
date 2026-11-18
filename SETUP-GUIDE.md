# Putting Aurestonk online (free) — step by step

Plan for about 20 minutes, once. After that the site updates itself every weekday.

**How it fits together**

- **GitHub** stores the website files. A free scheduled job there collects PSX data every weekday at 4:15 pm Pakistan time.
- **Vercel** publishes the website. It republishes automatically whenever the data changes.

---

## 0. Preview it on your laptop first (optional)

Double-click **`preview-locally-windows.bat`**. Your browser opens at http://localhost:8800 showing **sample data**, with a yellow banner saying so. Close the black window to stop.

## 1. Put the project on GitHub

1. Create a free account at https://github.com.
2. Install **GitHub Desktop** from https://desktop.github.com and sign in.
3. In GitHub Desktop, go to **File → New repository**:
   - **Name:** `aurestonk`
   - **Local path:** e.g. `Documents\GitHub`
   - Click **Create repository**.
4. Copy **everything inside this folder** into the new `Documents\GitHub\aurestonk` folder. That's `site`, `scripts`, `.github`, `vercel.json` and the other files.
   - **Note:** `.github` is a hidden folder. In File Explorer, turn on **View → Show → Hidden items** so it gets copied.
5. Back in GitHub Desktop:
   - Type a summary like "First version".
   - Click **Commit to main**, then **Publish repository**.
   - Public or private both work. Public repositories get unlimited free scheduled-job minutes.

## 2. Allow the data job to save its updates

1. On github.com, open your `aurestonk` repository.
2. Go to **Settings → Actions → General**.
3. Under **Workflow permissions**, choose **Read and write permissions**.
4. Click **Save**.

## 3. Run the first data download

1. In your repository, open the **Actions** tab. If asked, click **"I understand my workflows, go ahead and enable them"**.
2. Click **Update PSX data** on the left.
3. Click **Run workflow**, type `backfill` in the **mode** box, and press the green **Run workflow** button.
4. Wait about 10–25 minutes. A green tick means real PSX data has replaced the sample data.

**If it shows a red ✗ or the yellow "sample data" banner stays:**

1. Run it again with mode `diagnose`.
2. Open the run, click the **update** step, and copy everything in the log.
3. Paste it to Claude. It shows exactly what PSX's website returned, so the collector can be fixed quickly.

## 4. Publish on Vercel

1. Go to https://vercel.com and **Sign up with GitHub**. Choose the free **Hobby** plan.
2. Click **Add New… → Project**, find `aurestonk`, and click **Import**.
3. Leave **Framework Preset** as **Other**.
   - Don't add a build command. The included `vercel.json` already tells Vercel to publish the `site` folder.
4. Click **Deploy**. In about a minute you get a link like `https://aurestonk.vercel.app` (or similar).
5. Done. Every weekday after the data job runs, Vercel republishes automatically.

**Custom domain (later):** in Vercel, open the project and go to **Settings → Domains**, then follow the steps for the domain you buy.

## 5. Things you'll change by hand

All of these files can be edited directly on github.com: open the file, click the ✏️ pencil, then **Commit changes**. Vercel updates the site within a minute.

| What | File |
|---|---|
| Your name, email, phone, Instagram / X / LinkedIn links | `site/config/settings.json` |
| Tax rates (after each budget) | `site/config/taxes.json` |
| SBP policy rate & latest inflation (when they change) | `site/config/economy-manual.json` |

Social links: put the full address, e.g. `"instagram": "https://instagram.com/yourname"`. While a link is empty, its button shows "coming soon".

## Good to know

- **Hourly charts** build up from the first day the data job runs. Older periods show daily candles.
- **If a day's update fails** (for example, PSX's site was down), the site keeps the previous data. The **About** page shows when the last update ran.
- **Market holidays:** the job finds no trades and simply saves nothing.
- **Portfolios are stored in each visitor's own browser.** Nobody else, including you, can see them. Remind friends to use **Portfolio → ⋯ More → Download full backup**.
- **Not for commercial use yet.** The data comes from PSX's public pages, and PSX doesn't allow commercial use without a licence. If you ever add ads or paid plans, switch to a licensed data vendor first.
