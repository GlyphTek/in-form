# First public release: checklist

The release workflow (`.github/workflows/release.yml`) has **never run**. Treat the
first tag as a test, and expect to fix something.

## Before tagging

1. **Choose a licence.** There is no LICENSE file yet. Without one, people can download
   the app but have no stated right to reuse or share it. Decide (for example MIT, or
   "all rights reserved, free to use"), add `LICENSE`, and mention it in the README.
2. **Merge `phase1-backend` into `main`** (a pull request on GitHub is fine) so the
   repository front page shows the new README, not the old prototype.
3. On `main`, run `npm test` (all passing) and `npm run package:win`, then extract the zip
   somewhere else and double-click `start.bat` once more.
4. Check that the node.exe SHA-256 the build prints matches the `win-x64/node.exe` line at
   https://nodejs.org/dist/v22.23.4/SHASUMS256.txt (the CI does this too).
5. Update the version in `package.json` if you want something other than 0.1.0 (the zip
   name comes from it), and commit.

## Tag and watch

    git tag v0.1.0
    git push origin v0.1.0

Open the repository's **Actions** tab and watch the **Release** run:

- *Run tests* fails: a test is red on a clean machine. Read the log and tell me.
- *Check node.exe against nodejs.org* fails: **do not publish**. The npm copy of node.exe differs from the official one.
- *Publish the release* fails with a permission error: in Settings > Actions > General, set Workflow permissions to "Read and write".
- Otherwise a Release appears with two zips and `SHA256SUMS.txt`.

If it fails and you want to try again, delete the tag and re-push it:

    git push origin :refs/tags/v0.1.0
    git tag -d v0.1.0

then fix, commit, and tag again.

## After it publishes

1. Download the zip **from the Releases page** (not from your own build) and test it on a
   different Windows user or computer if you can. Note exactly what SmartScreen says.
2. Check the checksum: in cmd, `certutil -hashfile in-form-0.1.0-win-x64.zip SHA256` should
   equal the line in `SHA256SUMS.txt`.
3. Edit the release notes: one paragraph on what IN-FORM is, the SmartScreen note, and
   the video link once it exists.
4. Set the repository description and topics, and make sure the README's Releases link opens the new release.
5. Record the video (see `VIDEO_SCRIPT.md`) and add its link to the README.

## Known gaps worth telling people

English only; Windows only; unsigned; Google News regional coverage varies; South
America has no local English edition. These are listed in the README.
