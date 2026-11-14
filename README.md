# ShowUp

**Crypto gift cards anyone can claim, and events where showing up pays. A mobile app on NEAR.**

- **Gift cards:** lock NEAR or USDC in a card and send it as a link or QR. The person who opens it gets the money with **no wallet setup and no gas**. The link holds a one-use NEAR key that can only call `claim`.
- **Events:** guests lock a small deposit to RSVP. At the door the host scans a QR that the guest's phone re-signs every 10 seconds. After the event, everyone who came gets their deposit back **plus a share of what the no-shows forfeited**.
- **Attendance record:** every event updates a public "shows up X% of the time" record. Hosts can give reliable people a **lower deposit**.
- **Social, through NEAR Social (SocialDB):** names and photos instead of hex addresses, events posted to the public **#showup** feed (a **Discover** section in the app), and a one-tap "thank attendees" post that tags everyone who came.
- **A real wallet:** **Send** NEAR or USDC to any NEAR address (type it or scan their QR), and **Back up / export** the private key to use the same wallet in HOT, Meteor or MyNearWallet.

The two features feed each other. A gift card is the easiest way to get someone their first deposit, and the app creates a wallet on the phone the first time it opens.

Built at NEAR HACKATHON (Nov 2026). Tracks: Social Money, Real-World Money.
Also by this author at NEAR HACKATHON: **Proof of Delivery**, escrow that pays freelancers when an OutLayer TEE verifies the work. It's an independent project with its own repository.

---

## The problem

- **No-shows kill free events.** Organisers in Lagos and everywhere else plan for 100 people and get 40. Food, venue and travel are wasted. Charging a fee keeps students and new people out.
- **Sending crypto to a friend is still hard.** They need a wallet, a seed phrase, gas and an exchange first. Gift-card products fix this but charge a percentage (one on Base takes 3% per card).

## How it works

### Gift cards (NEAR function-call keys)
1. The app makes the card's key from two halves: a random secret that goes in the link, and a **redeem code** (10 characters like `K7QM9-XRT4P`) that the sender passes on separately. The key is `ed25519(PBKDF2-SHA256(code, link secret, 100k rounds))`. `create_card(public_key, asset, amount)` locks the money and adds that public key to the **contract's own account** as a function-call key that can only call `claim`. Its gas allowance is 0.03 NEAR for NEAR cards and 0.05 NEAR for USDC cards. That's a spending cap, not a charge: NEAR checks it at about 0.001 NEAR per Tgas attached, and a claim into a brand-new wallet needs about 20 Tgas (creating the account alone costs 7.2 Tgas). A claim actually burns about 0.004 NEAR.
2. The link is `showup://claim?c=<link secret>&p=<card public key>`. Someone who has the link but not the code can't claim. The code is generated, never chosen, and the slow derivation makes guessing it impractical even though anything stored on-chain is public. Older `?k=` links (no code) still work.
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
| **Implicit accounts** | The app makes a wallet on first launch (key in the phone's secure storage). It activates when it first receives NEAR, for example from a gift card. |
| **`ed25519_verify`** | Rotating check-in QRs are verified in the contract. No server and no ticketing company. |
| **NEP-141 / NEP-145** | USDC cards and deposits via `ft_transfer_call`. Payouts register the receiver, then `ft_transfer`. |
| **NEAR Social (SocialDB)** | Profiles (`<account>/profile`) for names and photos, edited in the app: the photo uploads to NEAR Social's IPFS gateway and the profile is one `set` call. Event posts and shout-outs go to `post/main` with `#showup` hashtag and `@mention` notify indexes, the same format near.social uses. Each shared event is also written to `<host>/showup/event/<id>`, so Discover reads it straight from the contract (`*/showup/event/*`) on testnet and mainnet with no indexer. Contract: `social.near` on mainnet, `v1.social08.testnet` on testnet. |

## Repository layout
```
contract/   Rust contract (near-sdk 5.30) + 25 unit tests
app/        Expo (SDK 58) React Native app: iOS, Android, and web for demos
scripts/    deploy-testnet.sh
```

---

## Try it

**Live contract (testnet):** [`showup.testnet`](https://testnet.nearblocks.io/address/showup.testnet). The app uses it when `app/.env` has `EXPO_PUBLIC_CONTRACT_ID=showup.testnet`, so you can skip deploying your own.

Requirements: Rust, Node 22+. For the phone, install **Expo Go** (iOS/Android).

**1. Run the contract tests.** Do: `cd contract && cargo test`. You should see `25 passed`. They cover gift card claim, double-claim, claiming without the card's key, cancel, USDC funding, failed-payout recovery, the full event with pot split, host policy, forged and expired QRs, guests checking themselves in, door helpers, the reliability discount, cancellation refunds and USDC RSVPs. One test checks a ticket **signed by the app's own code** (`app/test/make-fixture.ts`), proving the phone and the contract agree on the exact message.

**2. Run the app logic tests.** Do: `cd app && npm install && npm test`. You should see `pass 8`: amounts, the on-phone wallet, the card link round trip, check-in QR signing, the NEAR Social post format (hashtags and mentions), shout-out tagging, profile images and address parsing for Send.

**3. Open the app on your phone.** Do: `cd app && cp .env.example .env` (it already points at `showup.testnet`), then `npx expo start`, and scan the QR with Expo Go. You should see the ShowUp splash, then onboarding:
   - **Create a new wallet**, then add your name and photo (**Who's showing up?**), then **Add NEAR to get started** with your address, a QR and the testnet faucet. Tap **I'll do this later** to reach the three tabs: **Events**, **Gift cards**, **Me**.
   - Or **I already have a NEAR wallet**: paste a private key (`ed25519:…`) and tap **Find my account**. The app looks up which account the key belongs to, so you don't type the account name.
   - No phone? `npx expo start --web` runs the same app in a browser.

**4. Send a gift card.** Do: fund the wallet (testnet faucet link on **Me**), then **Gift cards → Create**, enter 1 NEAR and tap **Create card**. You should see a QR, a share link and a **redeem code** like `K7QM9-XRT4P`. Open the link on a second phone, or paste it under **Got a card?**. Type a wrong code and tap **Claim to my wallet**: you should see *That redeem code doesn't match this card* and nothing is sent. Type the right code and claim: the second wallet shows the NEAR, and it paid no gas. On a phone with no wallet the button reads **Create my wallet and claim**.

**5. Send money on.** Do: **Me → Send**, then paste a NEAR address or **Scan their QR** (another phone's **Me** tab), enter an amount and tap **Send**. You should see `Sent ✓`, and the other phone's balance goes up. **Me → Back up / export** shows the private key behind a warning.

**6. Run an event.**
   - Host: **Events → Host an event** with a start time 10+ minutes out.
   - Guests (other phones): **RSVP**. When check-in opens, each sees **Your ticket** with a QR that changes every 10 s.
   - Host: **Scan guests at the door**. You should see `✓ … checked in` for each one.
   - After check-in closes: **Settle the event**. Attendees then see **Collect X NEAR**, their deposit plus their share of the no-show pot. **Me → Do I show up?** updates.
   - Host: **Thank attendees on NEAR Social**. You should see a post on the #showup feed tagging the attendees who have named accounts.

**7. Profile, without leaving the app.** Do: **Me → Edit** (or **Set up**), pick a photo and type your name, then **Save profile**. You should see your name and photo on **Me**, on events you host or join, and on gift cards you send. It's saved to your NEAR Social profile (`<account>/profile`), so other NEAR apps show it too. A wallet with no NEAR yet keeps the profile on the phone; **Me** then shows **Publish profile** once the wallet is funded.

**8. Share and discover.** Creating an event with **Share on NEAR Social** on posts it to #showup. You should see it under **Discover on NEAR Social** on the Events tab, and on near.social. Guests and hosts with a NEAR Social profile appear with their name and photo.

## Deploy your own
You need:
- Rust with the wasm target: `rustup target add wasm32-unknown-unknown`
- [cargo-near](https://github.com/near/cargo-near) and [near-cli-rs](https://github.com/near/near-cli-rs) (`near`)
- A testnet account with about 7 NEAR, its key in `~/.near-credentials/testnet/` (create one with `near account create-account sponsor-by-faucet-service you.testnet autogenerate-new-keypair save-to-legacy-keychain network-config testnet create`, or import one with `near account import-account`)

```bash
OWNER=you.testnet ./scripts/deploy.sh
```
The script runs the contract tests, builds the wasm and creates `showup.you.testnet` funded with 6 NEAR. It then deploys and calls `new` with the USDC token, checks `get_accepted_tokens` and writes `app/.env`. Running it again redeploys the code and keeps existing cards and events. Options: `CONTRACT=…`, `FUND='8 NEAR'`, `USDC_TOKEN_ID=…`, `NETWORK=mainnet` (asks you to type "yes" first). Keep a few NEAR on the contract account: it pays claim gas, which each card's fee covers.

## Limits and what's next
- **Screenshots:** a QR shared live in real time (under 90 s) could still check in someone who isn't there. Next step: a host-side photo check or a short code spoken at the door.
- **Cross-chain deposits** via NEAR Intents (RSVP from Solana or Base USDC) are not built yet.
- **Fiat:** naira on and off ramps are out of scope for the hackathon.
- **Scale:** settlement updates every guest in one call, so events are capped at 150 guests. Larger events would settle in batches.

## Disclosure
- All code was written during the hackathon window (Nov 2026). The app was scaffolded with `create-expo-app`.
- NEAR Social writes use the same data format as near-social-js, called directly with near-api-js.
- Libraries: near-sdk, near-api-js, Expo (router, camera, image-picker, secure-store, clipboard, font, @expo/vector-icons), Bricolage Grotesque, DM Sans and JetBrains Mono (@expo-google-fonts), @noble/hashes, @noble/curves, @scure/base, react-native-qrcode-svg, react-native-svg, react-native-get-random-values, buffer, util (polyfill for near-api-js on React Native); ed25519-dalek and tsx for tests.
- The gift-card idea is inspired by existing crypto gift-card apps. No code or branding was used.
- Much of the code was written with AI assistance (Claude) and reviewed and tested by the author.

## License
MIT
