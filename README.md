# ShowUp

**Crypto gift cards anyone can claim, and events where showing up pays. A mobile app on NEAR (testnet).**

- **Gift cards:** lock NEAR or USDC in a card and send it as a link or QR, plus a **redeem code** sent separately. Whoever has both gets the money with **no wallet setup and no gas**. The card is a one-use NEAR key that can only call `claim`.
- **Events:** guests lock a small deposit to RSVP. At the door the host scans a QR that the guest's phone re-signs every 10 seconds. After check-in closes, everyone who came gets their deposit back **plus a share of what the no-shows forfeited**.
- **Attendance record:** every event updates a public "shows up X% of the time" record. Hosts can give reliable people a **lower deposit**.
- **Social, through NEAR Social (SocialDB):** names and photos set in the app, event cover photos, events posted to the public **#showup** feed (a **Discover** section in the app), and a one-tap "thank attendees" post.
- **A real wallet:** create or import one in onboarding, **Send** NEAR or USDC, and **Back up / export** the key to use the same wallet in HOT, Meteor or MyNearWallet.

The two features feed each other: a gift card is the easiest way to get someone their first deposit.

**Live contract (testnet):** [`showup.testnet`](https://testnet.nearblocks.io/address/showup.testnet)
**Live web app:** _add the Vercel link here after deploying (see [Deploy the web app](#deploy-the-web-app))_

Built at NEAR HACKATHON (Nov 2026). Tracks: Real-World Money, Social Money.
My other NEAR HACKATHON project (my first): **Proof of Delivery**, escrow that pays freelancers when an OutLayer TEE verifies the work. It's independent of ShowUp, with its own [repository](https://github.com/ussyalfaks/proof-of-delivery) and [live demo](https://proof-of-delivery-two.vercel.app/).

---

## Run it: quick reference

Every command below runs from the repository root unless it starts with `cd`. None of them needs a NEAR account or any NEAR tokens.

| # | Command | What it proves | Expected output |
|---|---|---|---|
| 1 | `cd contract && cargo test` | The smart contract's logic | `test result: ok. 25 passed; 0 failed` |
| 2 | `cd app && npm install && npm test` | The app's wallet, link, code, signing and RPC logic | `ℹ tests 17` · `ℹ pass 17` · `ℹ fail 0` |
| 3 | `cd app && npm run typecheck` | The whole app compiles | no output, exit code 0 |
| 4 | `cd app && npx expo export --platform web` | A production build of the web app | `Exported: dist` |
| 5 | the `curl` call in [Check the live contract](#check-the-live-contract) | The deployed contract answers | `["usdc.fakes.testnet"]` |
| 6 | `cd app && cp .env.example .env && npm run web` | The app runs in a browser | `Waiting on http://localhost:8081`, then the page loads there |

Steps 1–5 are fully non-interactive. Step 6 starts a dev server that keeps running (stop it with Ctrl+C).

## Run it: step by step

### 1. Prerequisites

| Tool | Version | Check | Needed for |
|---|---|---|---|
| Node.js | 22 or newer (tested on 24) | `node --version` | the app, its tests, the web build |
| npm | comes with Node | `npm --version` | installing app dependencies |
| Rust + cargo | stable (tested on 1.99) | `cargo --version` | contract tests only |
| Expo Go | latest, on a phone | App Store / Google Play | running on a real phone (optional) |

Deploying your own contract needs more tools; see [Deploy your own contract](#deploy-your-own-contract). You don't need them to run the app: it uses the live `showup.testnet` contract.

### 2. Install

```bash
git clone <this repository>
cd showup/app
npm install
```

### 3. Configure

```bash
cd app
cp .env.example .env
```

`.env.example` already points at the live testnet contract, so no edits are needed. The variables:

| Variable | Default in `.env.example` | Meaning |
|---|---|---|
| `EXPO_PUBLIC_NETWORK` | `testnet` | `testnet` or `mainnet` |
| `EXPO_PUBLIC_CONTRACT_ID` | `showup.testnet` | the ShowUp contract to use |
| `EXPO_PUBLIC_USDC_ID` | `usdc.fakes.testnet` | the USDC token for USDC cards and deposits |
| `EXPO_PUBLIC_WEB_URL` | not set | your deployed website, e.g. `https://showup.vercel.app`. When set, the phone app shares gift card and event links that open in a browser. On the website itself, links always use the site's own address. |

These are read at build time: restart `npm run web` / `npx expo start` after changing them. `.env` is git-ignored; never put private keys in it.

### 4. Check without a screen

```bash
cd contract && cargo test                 # 25 passed
cd ../app && npm test                     # pass 17
npm run typecheck                         # exit code 0
```

What they cover:
- **Contract (25 tests):** gift card claim, double-claim, claiming without the card's key, cancel, USDC funding, failed-payout recovery, a full event with the pot split, the host policy, forged and expired QRs, guests trying to check themselves in, door helpers, the reliability discount, cancellation refunds and USDC RSVPs. One test checks a ticket **signed by the app's own code** (`app/test/make-fixture.ts`), proving the phone and the contract agree on the exact message.
- **App (17 tests):** amounts, the on-phone wallet, card links (app and website form), check-in QR signing, NEAR Social post and profile formats, importing a wallet from a private key, redeem codes (generation, key rebuilding, wrong codes, older links), the event start time rules, and the RPC fallback for reads and transactions.

#### Check the live contract

No NEAR tools needed, only `curl` and `python3`:

```bash
curl -s https://rpc.testnet.near.org -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"call_function","finality":"final","account_id":"showup.testnet","method_name":"get_accepted_tokens","args_base64":"e30="}}' \
  | python3 -c "import json,sys; print(bytes(json.load(sys.stdin)['result']['result']).decode())"
```

Expected: `["usdc.fakes.testnet"]`. Change `get_accepted_tokens` to `list_events` to see the events on testnet.

### 5. Run in a browser

```bash
cd app
npm run web          # dev server; opens http://localhost:8081
```

You should see the ShowUp splash (purple, about 2 seconds), then onboarding: **Create a new wallet** or **I already have a NEAR wallet**.

Production build, the same as what Vercel serves:

```bash
cd app
npx expo export --platform web     # writes app/dist
npx serve -s dist                  # any static server that sends unknown paths to index.html
```

### 6. Run on a phone

```bash
cd app
npx expo start
```

Scan the QR it prints with **Expo Go** (Android) or the Camera app (iPhone). Phone and computer must be on the same Wi-Fi; if they aren't, use `npx expo start --tunnel`. Press `i` for the iOS Simulator or `a` for an Android emulator.

### Notes for automated runs (agents, CI)

- **No prompts:** prefix Expo commands with `CI=1` (e.g. `CI=1 npx expo start --web --port 8081`). The dev server keeps running until stopped, so run it in the background and wait for `Waiting on http://localhost:<port>`.
- **Port in use:** with `CI=1`, Expo stops with `Port 8081 is unavailable` instead of asking. Pick a free port, e.g. `CI=1 npx expo start --web --port 8093`.
- **Stale bundle:** after editing files while a dev server is running, restart it with `-c` (clears Metro's cache) if the page doesn't reflect the change.
- **Fresh state:** the web app keeps the wallet in the browser's `localStorage` (`showup.account.v1`, `showup.onboarded.v1`). Clear it to see onboarding again.
- **No camera:** the scanner shows **Paste the code** when no camera is available (headless browsers, the iOS Simulator). Paste a gift card link, a NEAR address, or a guest's ticket code (the ticket has **Copy ticket code**). It goes through the same checks as a scan.
- **Test money:** actions that send transactions (creating cards, RSVPs, events) need testnet NEAR in the wallet. Copy the address from **Me** and use the testnet faucet (**Me → Faucet**, or https://near-faucet.io). Reads and the tests above need nothing.
- **Rate limits:** the public FastNEAR RPC limits busy clients. The app falls back to `rpc.testnet.near.org` automatically for reads and transactions (resending the same signed transaction, which NEAR can execute at most once), so heavy automated runs are slower but keep working.
- **Time:** an event's start must be at least 10 minutes away, and check-in opens 2 hours before the start.

---

## Try it: what to do and what you should see

Run the app (browser or phone) as above, then:

**1. Onboarding.** Do: **Create a new wallet**. You should see **Who's showing up?** (add a name and photo, or **Skip for now**), then **Add NEAR to get started** with your address, a QR and **Get free testnet NEAR**. Tap **I'll do this later** to reach the tabs **Events**, **Gift cards**, **Me**. Or choose **I already have a NEAR wallet**, paste a private key (`ed25519:…`) and tap **Find my account**: the app finds the account for that key.

**2. Fund the wallet.** Do: **Me → Faucet**, and send testnet NEAR to the address shown under **Your address**. You should see the balance on **Me** and in the chip at the top of **Events** within about 30 seconds.

**3. Send a gift card.** Do: **Gift cards → Create a gift card**, enter 1 NEAR and tap **Create card**. You should see **Your card is ready**: a card with a QR, **Share** / **Copy link**, and a **REDEEM CODE** like `K7QM9-XRT4P`. On the website the link looks like `https://<site>/claim?c=…&p=…`; in the phone app it's `showup://claim?c=…&p=…` unless `EXPO_PUBLIC_WEB_URL` is set. Share and the code never travel together.

**4. Claim it.** Do: open the link on a second phone or browser (or paste it under **Gift cards → Got a link instead? → Open**). Type a wrong code and tap the claim button: you should see *That redeem code doesn't match this card*, and nothing is sent. Type the right code: you should see **It's yours 🎉**, the NEAR arrives, and the recipient paid no gas. With no wallet yet, the button reads **Create my wallet and claim**. The sender can **Take back** an unclaimed card from **Cards you sent**.

**5. Send money on.** Do: **Me → Send**, paste a NEAR address (or **Scan their QR** from another phone's **Me → Receive**), enter an amount, tap **Send**. You should see `Sent ✓`, and the other balance goes up. **Me → Back up / export key** shows the private key behind a warning.

**6. Run an event.**
- Host: **Events → Host**. Pick a date, hour and minutes at least 10 minutes ahead, optionally **Add a cover photo**, set the deposit, and tap **Create event**. You should land on the event page with **You're hosting**.
- Guest (another phone or browser): open the event and tap **Lock deposit & RSVP**. When check-in opens (2 hours before the start), the guest sees an **ADMIT ONE** ticket whose QR changes every 10 s.
- Host: **Scan guests at the door** (or **Paste the code** with the guest's **Copy ticket code**). You should see `✓ … checked in`, and the guest shows **Checked in** in the host's guest list.
- After check-in closes: anyone taps **Settle the event**. Attendees then see **Collect X NEAR**: their deposit plus their share of the no-show pot. **Me → Do I show up?** updates.
- Host: **Host tools → Thank attendees on NEAR Social** posts to the #showup feed.

**7. Profile.** Do: **Me → Set up** (or **Edit**), pick a photo, type a name, **Save profile**. You should see your name and photo on **Me**, on events, and on cards you send. It's saved to your NEAR Social profile (`<account>/profile`), so other NEAR apps show it too. A wallet with no NEAR yet keeps the profile on the phone, and **Me** shows **Publish profile** once it's funded.

**8. Share and discover.** With **List on NEAR Social** on, a new event is posted to #showup. You should see it under **Discover on NEAR Social** on the Events tab and on near.social. The share button on an event page shares a link to it (or copies it, in browsers without a share sheet).

---

## The problem

- **No-shows kill free events.** Organisers in Lagos and everywhere else plan for 100 people and get 40. Food, venue and travel are wasted. Charging a fee keeps students and new people out.
- **Sending crypto to a friend is still hard.** They need a wallet, a seed phrase, gas and an exchange first. Gift-card products fix this but charge a percentage (one on Base takes 3% per card).

## How it works

### Gift cards (NEAR function-call keys)
1. The app makes the card's key from two halves: a random secret that goes in the link, and a **redeem code** (10 characters like `K7QM9-XRT4P`) that the sender passes on separately. The key is `ed25519(PBKDF2-SHA256(code, link secret, 100k rounds))`. `create_card(public_key, asset, amount)` locks the money and adds that public key to the **contract's own account** as a function-call key that can only call `claim`. Its gas allowance is 0.03 NEAR for NEAR cards and 0.05 NEAR for USDC cards. That's a spending cap, not a charge: NEAR checks it at about 0.001 NEAR per Tgas attached, and a claim into a brand-new wallet needs about 20 Tgas (creating the account alone costs 7.2 Tgas). A claim actually burns about 0.004 NEAR.
2. The link is `<website or showup://>/claim?c=<link secret>&p=<card public key>`. Someone who has the link but not the code can't claim. The code is generated, never chosen, and the slow derivation makes guessing it impractical even though anything stored on-chain is public. Older `?k=` links (no code) still work.
3. The recipient opens the link and types the code. The app rebuilds the key, checks it matches the card before sending anything (a wrong code costs nothing), then signs `claim(receiver_id)` **with the card's key**, so the recipient pays no gas and needs no funded account. The contract checks `signer_account_pk` is an unclaimed card, deletes the key and pays out. Paying to a new implicit account (64-hex, the app's default) creates the account.
4. The flat fee is 0.025 NEAR per card, which covers the claim gas. The creator can take back an unclaimed card at any time (**Gift cards → Take back**).

### Events (on-chain signature check)
1. The host creates an event with a deposit, capacity, check-in window, where no-show money goes (`split_attendees` or `host`), and an optional reliability discount.
2. A guest RSVPs by locking the deposit, which is `deposit_for(guest)` after any discount, and registers their phone's public key as the **ticket key**.
3. At the door the guest's phone shows a QR: `{event, guest, ts, signature}`, signed over `showup-checkin:<contract>:<event>:<guest>:<ts>` and **re-signed every 10 s**. The host (or a door helper) scans it. `check_in` verifies the ed25519 signature on-chain (`env::ed25519_verify`) and rejects codes older than 90 s, so a screenshot sent to a friend goes stale.
4. After check-in closes, **anyone** can call `settle`. No-show deposits form the pot, and every guest's attendance record is updated. Attendees `withdraw` their deposit plus their share. A cancelled event refunds everyone in full.

### NEAR technology used
| Piece | How it's used |
|---|---|
| **Function-call access keys** | Each gift card is a limited key on the contract that can only call `claim`. Claiming is gasless and wallet-free. |
| **Implicit accounts** | **Create a new wallet** makes a key on the phone (secure storage; browser storage on the web). The account activates when it first receives NEAR, for example from a gift card. |
| **`ed25519_verify`** | Rotating check-in QRs are verified in the contract. No server and no ticketing company. |
| **NEP-141 / NEP-145** | USDC cards and deposits via `ft_transfer_call`. Payouts register the receiver, then `ft_transfer`. |
| **NEAR Social (SocialDB)** | Profiles (`<account>/profile`) for names and photos, edited in the app: the photo uploads to NEAR Social's IPFS gateway and the profile is one `set` call. Event cover photos are saved at `<host>/showup/cover/<id>`. Event posts and shout-outs go to `post/main` with the `#showup` hashtag and `@mention` notify indexes, the same format near.social uses. Each shared event is also written to `<host>/showup/event/<id>`, so Discover reads it straight from SocialDB (`*/showup/event/*`) with no indexer. Contract: `social.near` on mainnet, `v1.social08.testnet` on testnet. |
| **Public RPC with fallback** | FastNEAR first, `rpc.testnet.near.org` when rate-limited or down. Transactions are resent as the same signed transaction, which NEAR executes at most once. |

## Repository layout
```
contract/        Rust contract (near-sdk 5.30) + 25 unit tests
app/             Expo (SDK 58) React Native app: iOS, Android and web
app/test/        App logic tests (node:test + tsx), 17 tests
app/vercel.json  Web deployment settings for Vercel
scripts/         deploy.sh (contract), deploy-testnet.sh
```

## Deploy your own contract
You need:
- Rust with the wasm target: `rustup target add wasm32-unknown-unknown`
- [cargo-near](https://github.com/near/cargo-near) and [near-cli-rs](https://github.com/near/near-cli-rs) (`near`)
- A testnet account with about 7 NEAR, its key in the system keychain or `~/.near-credentials/testnet/` (create one with `near account create-account sponsor-by-faucet-service you.testnet autogenerate-new-keypair save-to-keychain network-config testnet create`, or import one with `near account import-account`)

```bash
OWNER=you.testnet ./scripts/deploy.sh
```
The script runs the contract tests, builds the wasm and creates `showup.you.testnet` funded with 6 NEAR. It then deploys and calls `new` with the USDC token, checks `get_accepted_tokens` and writes `app/.env`. Running it again redeploys the code and keeps existing cards and events. Options: `CONTRACT=…` (use `CONTRACT=$OWNER` to deploy onto your own account), `FUND='8 NEAR'`, `USDC_TOKEN_ID=…`, `NETWORK=mainnet` (asks you to type "yes" first). Keep a few NEAR on the contract account: it pays claim gas, which each card's fee covers.

## Deploy the web app
`app/vercel.json` holds the settings. On Vercel:
1. Import the repository and set **Root Directory** to `app`.
2. Add the environment variables `EXPO_PUBLIC_NETWORK=testnet`, `EXPO_PUBLIC_CONTRACT_ID=showup.testnet`, `EXPO_PUBLIC_USDC_ID=usdc.fakes.testnet`.
3. Deploy. Then set `EXPO_PUBLIC_WEB_URL` to the site's address, on Vercel and in your local `app/.env`, so the phone app shares website links too.

Any static host works if it sends unknown paths (e.g. `/event/5`, `/claim?c=…`) to `index.html`. On the web the wallet key lives in the browser's storage, which is fine for testnet but not for real money.

## Limits and what's next
- **Screenshots:** a QR shared live in real time (under 90 s) could still check in someone who isn't there. Next step: a host-side photo check or a short code spoken at the door.
- **Deposits come back after check-in closes,** not at the door, because the no-show share is only known then. Paying the deposit back at check-in is a planned contract change.
- **Cross-chain deposits** via NEAR Intents (RSVP from Solana or Base USDC) are not built yet.
- **Fiat:** naira on and off ramps are out of scope for the hackathon.
- **Scale:** settlement updates every guest in one call, so events are capped at 150 guests. Larger events would settle in batches.

## Disclosure
- All code was written during the hackathon window (Nov 2026). The app was scaffolded with `create-expo-app`.
- NEAR Social writes use the same data format as near-social-js, called directly with near-api-js.
- Libraries: near-sdk, near-api-js, Expo (router, camera, image-picker, secure-store, clipboard, font, @expo/vector-icons), @react-native-community/datetimepicker, Bricolage Grotesque, DM Sans and JetBrains Mono (@expo-google-fonts), @noble/hashes, @noble/curves, @scure/base, react-native-qrcode-svg, react-native-svg, react-native-get-random-values, buffer, util (polyfill for near-api-js on React Native); ed25519-dalek and tsx for tests.
- The gift-card idea is inspired by existing crypto gift-card apps. No code or branding was used.
- Much of the code was written with AI assistance (Claude) and reviewed and tested by the author.

## License
MIT
