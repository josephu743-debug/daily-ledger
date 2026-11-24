# Daily Ledger

Habit and task tracker. Reminders arrive as push notifications even when the app is closed.

## Run locally
    npm install
    npm start
Open http://localhost:3000 (localhost counts as secure, so push works for testing).

## Deploy
Push needs HTTPS. Any Node host works (Render, Railway, Fly.io).
- Start command: `npm start`
- Keep `data.json` between restarts: attach a persistent disk and set `DATA_FILE` to a path on it.
- Optional: set `VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_SUBJECT` (a `mailto:` address). Without them, keys are generated once and saved in the data file. If the keys change, people must re-enable reminders.

## How reminders work
When someone turns on "Daily reminder", their browser subscribes to push and the app sends the server their habits, tasks, reminder time and time zone. Every minute the server checks who has reached their reminder time and sends one notification per day, only if habits are undone or tasks are overdue.

## Notes
- iPhone/iPad (iOS 16.4+): open the site in Safari, Share, Add to Home Screen, then enable the reminder from the installed app.
- Habits and tasks still live in the browser's storage; the server only keeps a copy for reminders and doesn't have accounts.
- For a nicer iOS home-screen icon, add a 180x180 PNG and point `apple-touch-icon` at it.
