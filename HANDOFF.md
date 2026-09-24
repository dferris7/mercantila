# The Merchant's Table — Build Handoff (v2.1, multiplayer)

**Purpose:** upload this with the two code files so Claude has full context. It describes the **v2 rebuild** (Sept 2026). v1 notes are superseded where they conflict.

**Repo layout:** `index.html` (the whole game) · `js/peerjs.min.js`, `js/qrcode.js` (vendored, MIT) · `manifest.webmanifest` + `icons/` (installable web app) · `tests/merchants-table.test.js` (harness) · `docs/HANDOFF.md` (this file) · `README.md`.

## 0. Multiplayer (v2.1)

**Model:** host-authoritative, peer-to-peer. One phone hosts; its page holds the real state in `NET.real`. Every phone, the host's included, renders a redacted **view** built by `makeView(real, seat)`. Transport is PeerJS (WebRTC data channels) using the free public signaling server `0.peerjs.com` and PeerJS's default STUN/TURN. Host peer id = `mercantila-v2-` + 4-letter room code. `?signal=host:port` points at a self-hosted peerjs-server (used by the tests).

**Views hide:** other seats' private dice (replaced with 0 but same count), unrevealed community dice, other seats' Silver previews, the event deck order, and the price trend regimes. At showdown, non-folded hands and the full board are revealed; on a fold-out rollout, the board only.

**Code sections (inside the one `<script>`):**
- `MULTIPLAYER CORE` (DOM-free, exported, tested): `makeView`, `hostInitLobby`, `hostJoin` (seat tokens let a dropped phone reclaim its seat), `hostStart`, `hostDeal`, `hostNext`, `hostFlow` (runs the board out when nobody can act, pausing via `S.window` for all-in merchants who still have a power), `hostHandle(seat, action)` (validates every action by seat and phase), `hostRematch`. Host-only secrets live in `HOST` (tokens, passes, sequence).
- `MULTIPLAYER TRANSPORT + SCREENS` (DOM): `hostCreate`/`hostOpenPeer`/`hostAccept`/`hostBroadcast`/`hostTick` (4 s ping, 15 s timeout marks a seat Away), `guestJoin`/`guestConnect` (auto-reconnect), `send(action)`, `applyView` (diffs the previous view to drive dice rolls, coin flights, toasts, vibration on your turn), screens `rJoin`, `rLobby`, `mpTrayHTML`, `mineHTML`, `readyRowHTML`.
- `withReal(fn)` swaps the global `S` to the real state for engine calls, then back to the view. The engine is unchanged and still only reads the global `S`.

**Actions** (`{type,...}` from any seat): `profile`, `settings` (host), `start` (host), `ready` (market → deal, result → next hand when every connected seat is ready), `force` (host: deal now / continue / decide for an away chooser / auto-check-or-fold an away actor / skip the all-in window), `choose`, `trade`, `power`, `pass`, `pledge`, `check`, `call`, `raise`, `fold`, `boast`, `challenge`, `rematch` (host).

**Phases:** `lobby → market → betting → result → (market … ) → over`. Clients route screens from `S.phase`.

**Persistence:** host saves `mt-host` (real state + tokens) every broadcast → title shows **Resume hosting CODE** for 12 h. Guests save `mt-guest` (code + token) → **Rejoin CODE**. Profile in `mt-profile`. Pass-and-play still saves separately.

**Known limits:** the host can technically inspect all state (friends-only trust model). If the host's page closes, play pauses until they resume. Some carrier networks block WebRTC even with TURN. The public PeerJS signaling server is a free community service with no uptime guarantee.

**Engine change in v2.1:** `apply()` now returns `"invalid"` for illegal moves (was `false`, same as a legal move that doesn't end the street), so the host can reject them.


---

## 1. What changed in v2

**Rules changes (balance fixes, all covered by the harness):**
- **Straight now beats Full House.** With 7 eight-sided dice a Full House appears in ~22% of hands and a Straight in ~11%, so v1 ranked the commoner hand higher. New order: High Die < Pair < Two Pair < Trips < Full House < **Straight** < Quads < Five of a Kind.
- **Boasts are odds-based and escrowed.** Tiers: Trips 1:1 (46% blind), Full House 3:2 (36%), Straight 4:1 (16%), Four of a Kind 15:1 (5%). Challenger pays stake × odds if the boast holds. Both sides' florins are locked in `p.escrow` at challenge time (v1 let an all-in boaster dodge payment). The "Pair" tier was dropped (98% to hit). Two Pair was also dropped (86%).
- Boasts close once the final die is out (v1 let you boast a hand you could already see). Challenges still allowed. A boaster must be able to cover the stake to be challenged.
- **Boasts settle even when everyone folds.** The unrevealed dice are rolled out for boast settlement only (`S.rollout`). v1 silently voided them.
- **Auto win target** scales with player count: 2p 475 · 3p 525 · 4p 575 · 5p 625 · 6p 700 (`autoTarget`). v1's 1000 was never reached in 800 simulated games. Custom target still available.
- **Pledge** is offered whenever you can't cover the call (v1: only at exactly 0 florins).
- **Nudges clamp at 1 and 8** (v1 wrapped 8→1 and 1→8). An invalid direction is refused and costs nothing.

**Bug fixes:**
- Unlimited trades: the market's "Open the market" could be reopened forever. Now `p.traded` enforces one trade per player per market phase, in the engine (`doTrade`).
- "Sell several" charged the 5%/10% fee even when only one kind was selected.
- Player names were injected as raw HTML (a name like `<b>x</b>` broke layout). All names are escaped.
- Ties for richest/poorest always picked seat 0 as the event target. Now random.
- Result screen called sat-out players "folded"; a hand where only one player could ante is handled; a hand where nobody could ante no longer shows a blank winner.
- A lone active player with everyone else all-in no longer has to click Check every street.
- Odd florins from a split pot go to the winner nearest the dealer's left (was always the lower seat index).
- Dormant rule-bender hooks (`anteMult`, `freeTrade`, `freePowers`, `noTrade`) and florin-card branches excised.

**UX / graphics (full rewrite of the UI layer):**
- Top-down baize table with brass rim; seats around the oval on desktop, a swipeable seat strip on phones.
- d8 dice drawn as shaded octahedra: bone (community), garnet (private), sapphire (Silver preview). Arabic or Roman numerals (setup toggle).
- New portraits (6 colour palettes × 4 looks; look 1 is long-haired, female-presenting). Commodity icons, event-card glyphs, wax seal, coin piles.
- **Hold "My dice"** to peek privately at any time on your turn (shows best hand now + Silver preview). Tap to lock open.
- Fold and all-in calls use two-tap arming instead of a modal; check/call are one tap; trades, raises, boasts, challenges and pledges show the exact outcome on the confirm button.
- Market: each merchant has their own Trade button. Event card flips in; price moves shown as chips.
- Raise sheet has Min / ½ pot / Pot / All-in shortcuts. Result screen shows each player's scoring five and net gain for the hand.
- In-game Rules sheet with hand odds and boast payouts. Holdings sheet. WebAudio sound (mute in the top bar). Ambient embers and coin bursts on a canvas. Coin flights from seat to pot.
- **Auto-save** to localStorage (per browser); Resume from the title screen.

---

## 2. How to work on it (READ FIRST)

Single HTML file, one `<script>`, no build step. Three sections inside the script, in order:
1. **ENGINE** (`/* THE MERCHANT'S TABLE · ENGINE */` … `END ENGINE`) — pure logic, no DOM.
2. **ART** — SVG generators (`charSVG`, `dieSVG`, `icon`, `glyphSVG`, `sparkSVG`, `coinsSVG`), `SFX` (WebAudio), `FX` (canvas).
3. **UI** — `render()`, screen functions `r*`, sheet functions `sh*`, flow (`dealHand`, `continueHand`, `step`, `toResult`), and a single delegated input layer: every button has `data-act="name" data-arg="…"` handled by the `ACT` map.

State: engine state in global `S`; UI state in `S.ui` (accessed through `U`). Transient UI keys (`sheet`, `armed`, …) are stripped on save. The bottom of the script exports the engine via a guarded `module.exports`.

Verify after every change:
```bash
node tests/merchants-table.test.js     # must print ✅ ALL CLEAN
```
The harness also runs 150 hosted multiplayer games and asserts after every action that no seat's view leaks hidden information.

## 3. Invariants — do not violate
1. All money is integer. Round explicitly (half-up via `Math.round`).
2. Nobody is eliminated. Broke players sit out or pledge.
3. Prices stay in [5, 15] (`clampPrice`).
4. Engine stays DOM-free and exported.
5. Conservation: Σ(florins + escrow) + pot is constant through a hand, except pledges (`S._injected`).
6. Events never create, destroy, or move florins.

## 4. Core spec (unchanged from v1 unless noted above)
- Start 100 florins + 5 of each good. Wealth = florins + escrow + Σ(qty × price).
- Hand: market (drift from hand 2, one event, one trade each) → ante 5 → 2 private d8 → community 3/1/1 with four betting rounds → showdown, best 5 of 7 (8 with Gold).
- Powers: Wheat re-roll community (2) · Wood nudge community (2) · Brick re-roll private (2) · Ore nudge private (2) · Silver preview next die (1) · Gold third private die (2). Each once per game; one per hand. All-in players get a power window at each new street.
- Trade: single kind free; several kinds 5% (10% at 0 florins). Pledge 50%.
- End: first to target (checked after each hand) or richest at the turn cap; a closing reprice (`applyFinalReprice`) only on a cap ending.
- Market model: `PMIN=5 PMAX=15 PERSIST=0.62`, regimes rising/falling/calm/swingy. 37 event cards.

## 5. Open items
- **Target calibration** is from bot simulations; tune `autoTarget` after real playtests. Harness random-bot games rarely hit it; a tighter, value-betting bot hits it ~50% of the time.
- Multiplayer remains parked (design in v1 notes: authoritative server, engine runs verbatim).
- Optional: computer opponents for solo play.

## 6. Function map
Engine: `newGame`, `startHand`, `postAntes`, `initBetting`, `legal`, `apply`, `afterAction`, `advanceStreet`, `streetDone`, `endHandByFold`, `doShowdown`, `buildPots`, `settlePots`, `settleBoasts`, `challengeTerms`, `boastCap`, `evalHand`, `cmp`, `bestOf`, `bestFull`, `abilityReady`, `doAbility`, `allinPending`, `doPledge`, `canPledge`, `tradeQuote`, `doTrade`, `evolveMarket`, `drawEvent`, `applyEvent`, `resolveEventChoice`, `richestIdx`, `poorestIdx`, `autoTarget`, `gameOverReason`, `applyFinalReprice`, `ranking`, `wealth`, `holdingsValue`.
Constants: `COMM/CKEYS/CMAP`, `RANK_NAMES`, `RK`, `HAND_TIERS`, `EVENTS`, `GROUPS`, `START_FL`, `ANTE`, `MINBET`, `SELL_FEE`, `BROKE_FEE`, `PLEDGE_RATE`, `BOAST_CAP`, `PMIN/PMAX/PERSIST`.
