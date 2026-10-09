# Sahara

A pixel-heart planner for one person juggling their own day, the kids, and work.

## What's in it

- **Missions**: to-dos with points. Assign each one to Me, Co-parent or Kids, tag it Job / Home / Self, and optionally give it a due date. Completing a mission fills a heart for the day and adds points.
- **Rewards**: set treats with a point cost and redeem them once you have the points.
- **Sleep**: log bedtime, wake time and how rested you felt. The last 7 nights are charted with an average.
- **Food**: log meals and track water (8 glasses a day).
- **Job**: log shifts and see this week's hours against your target.
- **Co-parent**: shared handoff notes, the missions waiting on your co-parent, and a plain-text weekly report you can copy into a message.

## Running it

There is no build step. Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
```

then visit http://localhost:8000.

The page loads the Press Start 2P font from Google Fonts. It still works without it, just with a plainer font.

## Where data lives

Everything is saved in the browser's localStorage under `sahara.v1`. It stays on that device and in that browser. Clearing site data erases it, and nothing syncs between phones yet. For now, share with a co-parent by copying the weekly report.
