# IN-FORM

**Today is forming around...** IN-FORM is a small daily orientation tool. You choose
what forms your day, such as Technology, Science, News, Sport, Education, Religion, or
Relationships and wellbeing. You can also add your own topics, websites and feeds. IN-FORM reads
them and shows you up to three items in each of four channels, then stays out of your way.

It is free, it runs on your own computer, and it has no accounts and no ads.

## The four channels (RAKE)

| Channel | What it is for |
| --- | --- |
| **Relevant** | What is current and close to the things you chose (from the last 48 hours) |
| **Attention** | What may need your awareness or action |
| **Knowing** | What may deepen your understanding |
| **Experience** | What may be worth exploring or taking part in |

Press **PRESS** on the "Today is forming around" card for the next batch. Every item
is shown once, so you are never handed the same story twice. When there is nothing
new, it says so plainly instead of filling the space.

## What it does, and what it does not

- **It shows its reasoning.** Each item says why it was picked, for example that it
  matches Knowing cues, or that you opened similar items before.
- **It learns gently.** Opening an item, marking it **Useful**, or **Dismissing** it
  nudges similar items up or down. The nudge is bounded, and learning alone never
  hides anything. Only items you dismiss, or have already been shown, are left out.
- **It is keyword-based, not AI.** The channels are decided by wording cues, and
  recency and your past choices adjust the order. It will sometimes get a channel wrong.
- **It is honest when something breaks.** If a source can't be reached, the app says
  which one and why. It never shows placeholder or invented content.
- **Local or global.** For News, Sport and Education you can choose Local, Global or
  Both, by continent. Local uses English-language regional news editions, so coverage
  varies by country, and South America has none yet (the app says so).

## Download and run (Windows)

1. Download `in-form-<version>-win-x64.zip` from the
   [Releases page](https://github.com/GlyphTek/in-form/releases). It is about 34 MB and
   includes everything. If you already have Node.js 22.13 or newer installed, the
   `-lite.zip` is about 2 MB and works the same way.
2. Right-click the zip, choose **Properties**, tick **Unblock** if it is shown, then
   **Extract All**.
3. Open the folder and double-click **`start.bat`**. Your browser opens on IN-FORM.
   Keep the black window open while you use it, and close it to stop.

**Windows may warn you.** The app is not code-signed (signing costs money), so Windows
SmartScreen can say "Windows protected your PC". Choose **More info**, then **Run
anyway**, only for a file from the official Releases page. Each release lists a
SHA-256 checksum in `SHA256SUMS.txt` so you can check your download.

Mac and Linux builds are not made yet. They can run from source, below.

## Run from source (Windows, Mac, Linux)

You need [Node.js](https://nodejs.org) 22.13 or newer.

    npm install
    INFORM_AUTH=off npm start

On Windows cmd use two lines: `set INFORM_AUTH=off`, then `npm start`. Then open
http://127.0.0.1:3000. `INFORM_AUTH=off` means no password and is meant for running
on your own computer only; see the developer guide for password mode.

## Your data and privacy

- Your setup and history are stored on your computer only: in `%APPDATA%\IN-FORM` for the
  Windows download, or `data/` when run from source. There are no accounts and no analytics.
- The app contacts only the news sources you chose: Google News searches for topics
  and keywords, plus any websites or feeds you added. It sends them from your
  computer. The page fonts are bundled, so nothing is requested from other sites.
- It answers only your own computer (`127.0.0.1`), so other devices on your network
  cannot reach it.
- To move or back up your setup, use **Back up or move your setup** on the setup
  screen. It saves your topics, sites and region to a small file, with no history in it.

## Known limits

- English-language sources only for now.
- Windows download only for now; the app is unsigned.
- Topics use Google News' public RSS search. It is not an official interface and could
  change or stop working. If it does, the app will say the sources are unavailable.
- Learning needs a pattern before it moves anything much; one click barely changes the order.

## For developers

[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) covers the architecture, API, configuration, building
the Windows package, and releasing. [docs/STATE.md](docs/STATE.md) is the current state of the
work, including what has and has not been verified.
