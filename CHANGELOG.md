# What is new

Each release's notes are taken from here when a version is tagged (see `.github/workflows/release.yml`).

## 0.3.0

**New: a phone version.** Open https://in-form.onrender.com on your phone and add it to your home screen. It is free and has no accounts. Your topics and history stay on your phone; when you press, the server looks up the news for your topics and keeps nothing. It has the built-in topics only (no custom sites or feeds), and because it runs on a free host, the first press after a quiet spell can take about a minute.

**Also new**
- Headlines are larger, with a clear source line underneath. For Google News stories it shows the real publisher instead of `news.google.com`.
- A "Send feedback" link opens a short GitHub form with your version filled in.
- The Windows app now tells you when a newer version exists. Once a day it asks GitHub for the latest release; the request carries nothing about you. Turn it off with `INFORM_UPDATE_CHECK=off`. (Copies older than 0.3.0 cannot do this, so this is the last release you need to find by hand.)
- The download page shows the phone version, with install steps and an honest note on limits ("Built for $0").

**Updating from 0.2.0:** close IN-FORM first (Stop IN-FORM in the Start menu), run the new `IN-FORM-Setup` over the old one, and open it from the same icon. Your setup and history live in `%APPDATA%\IN-FORM` and are kept. Windows may warn once more, because the file is not code-signed.

## 0.2.0

A Windows installer: Start menu and desktop icon, no black window, Stop IN-FORM shortcut.

## 0.1.0

First public release: portable Windows zips, the four R.A.K.E channels, and PRESS becoming DONE when you are caught up.
