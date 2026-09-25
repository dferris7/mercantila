# The Merchant's Table

A dice hold'em and commodity-trading game for 2 to 6 players, set on the fictional continent of Mercantila. Play **on separate phones** over the internet, or **pass one phone** around the table.

**Play:** `https://<your-github-username>.github.io/<repo-name>/` (once GitHub Pages is on; see below)

## Playing on separate phones

1. One player opens the game and taps **Host a table**, picks a name and look, and taps **Open a table**. A 4-letter room code and a QR code appear.
2. Everyone else scans the QR code with their phone camera, or opens the game, taps **Join a table** and types the code.
3. When everyone is listed, the host taps **Open the table**.
4. Each phone shows only its owner's private dice. When the market opens, a prompt offers a trading tip. Your one trade per hand can mix buying and selling: set it all up, then execute. Tap **I'm ready** and the hand is dealt when everyone is ready.
5. Experienced players can switch **Trading tips** off (in the lobby, setup, or on the prompt itself) to skip the prompt.

Tips:
- **The host's phone runs the game.** Keep the host's page open with the screen on. If it closes, everyone pauses. The host can reopen the game and tap **Resume hosting** to bring the table back with the same code.
- If a phone drops out, reloads, or the browser discards the tab, reopening the game jumps straight back into the table, with no need to tap anything. This works for the host too (the table reopens with the same code). A banner shows while a phone is reconnecting.
- The host can auto-play for someone who's away, or deal/continue without waiting.
- Tap the gold chat bubble to message another player privately. Only the two of you can see the conversation. New messages pop up with a preview you can tap to reply.
- Same Wi-Fi is the most reliable. Mobile data usually works: PeerJS falls back to its free relay servers when phones can't connect directly. A few mobile networks block this anyway; if a phone won't connect, put it on Wi-Fi.
- Add it to your home screen (Share → **Add to Home Screen** on iPhone, ⋮ → **Install app** on Android) for a full-screen app.

## How it connects

There is no game server. The host's phone holds the game state and sends each phone a view with everyone else's dice hidden. Phones find each other through the free public [PeerJS](https://peerjs.com) signaling service, then talk directly over WebRTC. The PeerJS library and the fonts are included as files, so the game doesn't depend on a CDN (it falls back to one only if `peerjs.min.js` is missing).

This setup is meant for friends. The host's phone holds the full game state, so someone technical could inspect it.

To use your own signaling server instead (for example, if the public one is down), run [peerjs-server](https://github.com/peers/peerjs-server) and open the game with `?signal=your-host:port`.

## Publishing on GitHub Pages

1. Create a new **public** repository on GitHub (private repos need a paid plan for Pages).
2. On the new repo's page, click **uploading an existing file**, drag in every file from this folder (all files sit at the top level, no subfolders), and click **Commit changes**.
3. Go to **Settings → Pages**. Under **Build and deployment**, set Source to **Deploy from a branch**, choose **main** and **/ (root)**, and click **Save**.
4. After a minute or two, the game is live at `https://<username>.github.io/<repo-name>/`.

## Development

Everything is in `index.html`: a DOM-free engine, a multiplayer core, and the UI. Run the test harness before changing anything:

```bash
node merchants-table.test.js   # must print ✅ ALL CLEAN
```

The harness checks hand ranking, pots, boasts, trades, events, 800 simulated pass-and-play games, and 150 simulated hosted games, verifying after every move that no phone's view reveals hidden dice. See `HANDOFF.md` for the full rules, invariants and function map.

## Third-party code

- `peerjs.min.js` — PeerJS 1.5.5, MIT License, © Michelle Bu and Eric Zhang.
- `morphdom` 2.7.4 (inlined in `index.html`) — MIT License, © Patrick Steele-Idem.
- `qrcode.js` — QR Code Generator 2.0.4, MIT License, © Kazuhiko Arase. "QR Code" is a registered trademark of DENSO WAVE INCORPORATED.

- Fonts: Cinzel, Cinzel Decorative and Spectral, SIL Open Font License 1.1 (via Fontsource). See `FONTS-LICENSE.txt`.

See `THIRD-PARTY-LICENSES.txt`.
