# Sahara

A pixel-heart planner for one person juggling their own day, the kids, and work. Open it, see how you are doing today, and do the next small thing.

## What's in it

- **Today**: a mascot heart that changes mood with your day, a level and XP bar, a streak, one gentle nudge for what to do next, and **five good-job hearts**. Each heart fills when you hit a goal: missions done, a full night's sleep, meals eaten, water drunk, and showing up (a kids or co-parent mission, a handoff note, or a work shift). Badges unlock as you go.
- **Missions**: to-dos with points. Assign each one to Me, Co-parent or Kids, tag it Job / Home / Self, and repeat it daily or weekly. Tap a mission to edit it. Deleting is always undoable.
- **Rewards**: set treats with a point cost and redeem them when you have the points. Points are never lost by deleting a finished mission.
- **Sleep**: bedtime, wake time and how rested you felt, with a 7-night chart against your goal.
- **Food**: four meal slots a day, a meal log, and a water tracker.
- **Work**: log shifts and see the week's hours against your target, day by day.
- **Co-parent**: the missions waiting on your co-parent, handoff notes, and a plain-text weekly report to copy or share into a message.
- **Settings & backup**: set your own daily goals, light/night theme (Night is the default), optional 8-bit sound effects (off by default), and export or import a backup file.

## Running it

There is no build step. Open `index.html` in a browser, or serve the folder:

```sh
npm start        # python3 -m http.server 8000, then visit http://localhost:8000
```

## Put it on your phone (GitHub Pages)

The app is a PWA: it works offline and can be added to your home screen. That needs it served over HTTPS, which GitHub Pages does for free. Setup is one setting plus a merge:

1. In the repo go to **Settings → Pages**, and under **Build and deployment** set **Source** to **GitHub Actions**.
2. Merge this work into `main`. The **Deploy to GitHub Pages** workflow runs the tests and publishes the site. You can also run it by hand from the **Actions** tab.
3. Open `https://<your-github-name>.github.io/Sahara/` on your phone, then **Share → Add to Home Screen** (iPhone) or **Install app** (Android/Chrome, or Settings in the app).

Every later change merged to `main` is published the same way. The app only uses relative paths, so it works from the `/Sahara/` subfolder.

## Where data lives

Everything is saved in the browser's localStorage under `sahara.v1`, on that device only. Nothing is sent anywhere and nothing syncs between phones yet. To move to a new phone, or just keep a copy, use **Today → Settings & backup → Export backup**, then **Import backup** on the other device. To keep a co-parent in the loop, share the weekly report.

If saved data ever gets damaged, the app keeps a copy of the unreadable text in `sahara.v1.damaged` instead of overwriting it.

## Development

```sh
npm test         # unit tests for the rules and the pixel art (Node 22, no dependencies)
```

| File | What it does |
| --- | --- |
| `js/core.js` | All the rules: state, validation, missions, points, levels, streaks, hearts, badges, reports. No DOM. |
| `js/pixel.js` | The pixel art: hearts, icons and the mascot, built from text bitmaps. |
| `js/ui.js` | Draws the state and handles taps. |
| `styles.css` | Look and feel, including the night theme. |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and installing to the home screen. |

The service worker is network-first, so a new version shows up as soon as you are online. Bump `CACHE` in `sw.js` if you ever need to force old copies out.

## Credits

The pixel font is [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) by CodeMan38, used under the SIL Open Font License (see `fonts/OFL.txt`).
