# MMBS Web App — One-Time Setup

## What you get

A free browser-based app that works on any phone or laptop.  
URL: `https://<your-github-username>.github.io/mmbs-web/`

---

## Step 1 — Google Cloud (one-time, ~10 minutes)

### 1.1 Create / select a project

1. Go to https://console.cloud.google.com/
2. Create a new project or select the existing one you used for the Android app.

### 1.2 Enable APIs

Enable these two (click each link → *Enable*):
- https://console.cloud.google.com/apis/library/sheets.googleapis.com
- https://console.cloud.google.com/apis/library/drive.googleapis.com

### 1.3 Create an OAuth 2.0 Client ID

1. Go to https://console.cloud.google.com/apis/credentials
2. *Create Credentials → OAuth client ID*
3. Application type: **Web application**
4. Name: `MMBS Web App`
5. Under **Authorised redirect URIs**, add **both**:
   ```
   http://localhost:5173/#/auth/callback
   https://<your-github-username>.github.io/mmbs-web/#/auth/callback
   ```
   (Replace `<your-github-username>` with your actual GitHub username.)
6. Click *Create*.  A dialog shows your **Client ID** — copy it (looks like `123456789-abc…apps.googleusercontent.com`).

### 1.4 Configure the OAuth consent screen

1. Go to https://console.cloud.google.com/apis/credentials/consent
2. User type: **External** (free)
3. Fill in App name (`MMBS Tracker`), support email.
4. Scopes page — click *Add or remove scopes*, add:
   - `.../auth/spreadsheets`
   - `.../auth/drive.readonly`
5. **Test users** — add every committee member's Gmail address here.  
   (Until the app is published, only test users can sign in — no Google review needed.)
6. Save.

### 1.5 Paste the Client ID into the app

Open `mmbs-web/src/auth/oauth.ts` and replace the placeholder:

```ts
export const GOOGLE_CLIENT_ID =
  'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
```

with your actual Client ID from step 1.3.

---

## Step 2 — GitHub Pages (one-time, ~5 minutes)

### 2.1 Create a GitHub repository

1. Go to https://github.com/new
2. Repository name: `mmbs-web`
3. Set to **Public** (required for free GitHub Pages)
4. Do **not** initialise with any files
5. Click *Create repository*
6. Copy the HTTPS URL shown

### 2.2 Push this folder

From the `mmbs-web/` folder:

```bash
git init
git add .
git commit -m "Phase A: web app foundation"
git branch -M main
git remote add origin <URL from above>
git push -u origin main
```

### 2.3 Enable GitHub Pages

1. Open your repository → *Settings → Pages*
2. Source: **Deploy from a branch**
3. Branch: **gh-pages** / root
4. Click *Save*

The first deployment happens automatically when you push (see the *Actions* tab).  
After ~2 minutes your app is live at `https://<username>.github.io/mmbs-web/`.

---

## Step 3 — First sign-in on any device

1. Open the URL in any browser (Chrome works best on Android)
2. Tap **Sign in with Google** — pick your committee Gmail
3. Paste the MMBS Google Spreadsheet URL when prompted
4. The app syncs all members and transactions from the sheet
5. Share the URL with other committee members — they sign in with their own Google accounts

---

## Local development (optional)

```bash
cd mmbs-web
npm install
npm run dev
```

Opens at `http://localhost:5173/`

---

## Every push auto-deploys

Push any change to `main` → GitHub Actions builds → GitHub Pages updates within ~2 minutes.  
No manual steps needed after the initial setup.
