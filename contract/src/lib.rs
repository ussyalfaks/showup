//! ShowUp — claim-link gift cards and no-show-proof event deposits on NEAR.
//!
//! **Cards.** A creator locks NEAR or USDC under a fresh public key. The contract adds
//! that key to *itself* as a function-call key that can only call `claim`, with a small
//! gas allowance. The private key travels in a link or QR. Whoever opens it calls
//! `claim(receiver_id)` signed with that key: no wallet and no gas needed, and the key
//! is deleted on use.
//!
//! **Events.** Guests RSVP by locking a deposit and registering a ticket key (their
//! app's public key). At the door the host scans a QR the guest's phone signs every few
//! seconds; the contract verifies the ed25519 signature. After check-in closes, attendees
//! withdraw their deposit plus a share of the no-shows' deposits (or the host keeps them).
//! Every event updates each guest's public attendance record, and hosts can lower the
//! deposit for people who reliably show up.

use near_sdk::json_types::{Base64VecU8, U128, U64};
use near_sdk::serde_json::{self, json, Value};
use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{
    env, near, require, AccountId, Allowance, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise,
    PromiseError, PromiseOrValue, PublicKey,
};

pub const NATIVE: &str = "near";
const NS: u64 = 1_000_000_000;
/// Per card: gas allowance for the claim key + key storage + token registration on payout.
pub const CARD_FEE: u128 = 25_000_000_000_000_000_000_000; // 0.025 NEAR
const CLAIM_ALLOWANCE: u128 = 20_000_000_000_000_000_000_000; // 0.02 NEAR
/// Per event, paid by the host: storage for the guest list and records.
pub const EVENT_FEE: u128 = 50_000_000_000_000_000_000_000; // 0.05 NEAR
const PAYOUT_RESERVE: u128 = 1_250_000_000_000_000_000_000; // 0.00125 NEAR
const MAX_CAPACITY: u32 = 150;
/// A check-in QR is valid for this long after the guest's phone signed it.
const QR_WINDOW_NS: u64 = 90 * NS;
/// Check-in opens this long before the start.
const EARLY_CHECKIN_NS: u64 = 2 * 3_600 * NS;
const GAS_FT: Gas = Gas::from_tgas(15);
const GAS_STORAGE: Gas = Gas::from_tgas(10);
const GAS_CALLBACK: Gas = Gas::from_tgas(15);

#[derive(BorshStorageKey)]
#[near(serializers = [borsh])]
enum Key {
    Cards,
    CardsBy,
    Events,
    Rsvps,
    Records,
    Pending,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Card {
    pub public_key: PublicKey,
    pub creator: AccountId,
    pub asset: String,
    pub amount: U128,
    pub message: String,
    pub funded: bool,
    pub claimed_by: Option<AccountId>,
    pub cancelled: bool,
    pub created_at: U64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum NoShowPolicy {
    /// No-show deposits are shared equally by everyone who came.
    SplitAttendees,
    /// No-show deposits go to the host.
    Host,
}

/// Hosts can reward people who reliably show up with a smaller deposit.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct ReliableRule {
    pub min_events: u32,
    pub min_rate_pct: u8,
    pub discount_pct: u8,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Event {
    pub host: AccountId,
    pub title: String,
    pub location: String,
    pub starts_at: U64,
    pub checkin_until: U64,
    pub asset: String,
    pub deposit: U128,
    pub capacity: u32,
    pub policy: NoShowPolicy,
    pub reliable: Option<ReliableRule>,
    pub checkers: Vec<AccountId>,
    pub guests: Vec<AccountId>,
    pub attended: u32,
    pub cancelled: bool,
    pub settled: bool,
    /// Sum of no-show deposits (after settle).
    pub pot: U128,
    /// Extra each attendee gets (after settle, split policy).
    pub share: U128,
    /// What the host can withdraw (after settle).
    pub host_take: U128,
    pub host_withdrawn: bool,
}

#[near(serializers = [json])]
pub struct EventView {
    pub id: U64,
    #[serde(flatten)]
    pub event: Event,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Rsvp {
    pub paid: U128,
    pub ticket_key: PublicKey,
    pub checked_in: bool,
    pub withdrawn: bool,
    pub at: U64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, Default)]
pub struct Attendance {
    pub rsvps: u32,
    pub attended: u32,
    pub no_shows: u32,
    pub hosted: u32,
}

/// Where a failed payout's money goes back to.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub enum Refund {
    Card { public_key: PublicKey },
    Withdrawal { event_id: U64, account: AccountId, host: bool },
    Cancelled,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct ShowUp {
    accepted_tokens: Vec<AccountId>,
    cards: LookupMap<PublicKey, Card>,
    cards_by: LookupMap<AccountId, Vec<PublicKey>>,
    events: IterableMap<u64, Event>,
    next_event: u64,
    rsvps: LookupMap<String, Rsvp>,
    records: LookupMap<AccountId, Attendance>,
    /// Token RSVPs/cards waiting for their ft_transfer_call: key -> expected sender
    pending: LookupMap<String, AccountId>,
}

fn emit(event: &str, data: Value) {
    env::log_str(&format!("EVENT_JSON:{}", json!({"standard": "showup", "version": "1.0.0", "event": event, "data": [data]})));
}

fn rsvp_key(event_id: u64, account: &AccountId) -> String {
    format!("{}:{}", event_id, account)
}

fn pk_string(pk: &PublicKey) -> String {
    String::from(pk)
}

/// The exact bytes a guest's phone signs for a check-in QR.
pub fn checkin_message(contract: &AccountId, event_id: u64, guest: &AccountId, ts_ms: u64) -> String {
    format!("showup-checkin:{}:{}:{}:{}", contract, event_id, guest, ts_ms)
}

#[near]
impl ShowUp {
    #[init]
    pub fn new(accepted_tokens: Vec<AccountId>) -> Self {
        Self {
            accepted_tokens,
            cards: LookupMap::new(Key::Cards),
            cards_by: LookupMap::new(Key::CardsBy),
            events: IterableMap::new(Key::Events),
            next_event: 0,
            rsvps: LookupMap::new(Key::Rsvps),
            records: LookupMap::new(Key::Records),
            pending: LookupMap::new(Key::Pending),
        }
    }

    // ==================================================================
    // Gift cards
    // ==================================================================

    /// Create a card under `public_key` (generate a fresh ed25519 key pair; the
    /// private half goes in the claim link). NEAR cards: attach amount + 0.025 NEAR.
    /// Token cards: attach 0.025 NEAR, then `ft_transfer_call(msg = {"fund_card": "<public key>"})`.
    #[payable]
    pub fn create_card(&mut self, public_key: PublicKey, asset: String, amount: U128, message: Option<String>) {
        require!(matches!(public_key.curve_type(), near_sdk::CurveType::ED25519), "card key must be ed25519");
        require!(self.cards.get(&public_key).is_none(), "card key already used");
        require!(amount.0 > 0, "amount must be > 0");
        self.assert_asset(&asset);
        let message = message.unwrap_or_default();
        require!(message.len() <= 140, "message must be at most 140 chars");
        let creator = env::predecessor_account_id();
        let attached = env::attached_deposit().as_yoctonear();
        let funded = asset == NATIVE;
        if funded {
            require!(attached >= amount.0 + CARD_FEE, "attach amount + 0.025 NEAR");
            self.refund_excess(&creator, attached - amount.0 - CARD_FEE);
        } else {
            require!(attached >= CARD_FEE, "attach 0.025 NEAR");
            self.pending.insert(format!("card:{}", pk_string(&public_key)), creator.clone());
        }
        let card = Card {
            public_key: public_key.clone(),
            creator: creator.clone(),
            asset: asset.clone(),
            amount,
            message,
            funded,
            claimed_by: None,
            cancelled: false,
            created_at: U64(env::block_timestamp()),
        };
        self.cards.insert(public_key.clone(), card);
        let mut mine = self.cards_by.get(&creator).cloned().unwrap_or_default();
        mine.push(public_key.clone());
        self.cards_by.insert(creator.clone(), mine);
        emit("card_created", json!({"public_key": pk_string(&public_key), "creator": creator, "asset": asset, "amount": amount, "funded": funded}));
        if funded {
            self.add_claim_key(public_key);
        }
    }

    /// Claim a card to `receiver_id`. Must be signed with the card's own key (from the link).
    /// A brand-new implicit account (64 hex chars) is fine: a NEAR transfer creates it.
    pub fn claim(&mut self, receiver_id: AccountId) -> Promise {
        require!(env::predecessor_account_id() == env::current_account_id(), "sign with the card's key from the link");
        let pk = env::signer_account_pk();
        let mut card = self.cards.get(&pk).cloned().expect("not a card key");
        require!(card.funded && card.claimed_by.is_none() && !card.cancelled, "card is not claimable");
        card.claimed_by = Some(receiver_id.clone());
        self.cards.insert(pk.clone(), card.clone());
        emit("card_claimed", json!({"public_key": pk_string(&pk), "receiver": receiver_id, "asset": card.asset, "amount": card.amount}));
        Promise::new(env::current_account_id()).delete_key(pk.clone()).detach();
        self.payout(&card.asset, &receiver_id, card.amount.0, Refund::Card { public_key: pk })
    }

    /// The creator takes back an unclaimed card.
    pub fn cancel_card(&mut self, public_key: PublicKey) -> Promise {
        let mut card = self.cards.get(&public_key).cloned().expect("no such card");
        require!(env::predecessor_account_id() == card.creator, "only the creator can cancel");
        require!(card.claimed_by.is_none() && !card.cancelled, "card already claimed or cancelled");
        card.cancelled = true;
        let was_funded = card.funded;
        self.cards.insert(public_key.clone(), card.clone());
        emit("card_cancelled", json!({"public_key": pk_string(&public_key)}));
        if was_funded {
            Promise::new(env::current_account_id()).delete_key(public_key).detach();
            self.payout(&card.asset, &card.creator, card.amount.0, Refund::Cancelled)
        } else {
            self.pending.remove(&format!("card:{}", pk_string(&public_key)));
            // No claim key was ever added: return the gas allowance part of the fee.
            Promise::new(card.creator).transfer(NearToken::from_yoctonear(CLAIM_ALLOWANCE))
        }
    }

    // ==================================================================
    // Events
    // ==================================================================

    /// Create an event (attach 0.05 NEAR). Times are unix milliseconds.
    #[payable]
    #[allow(clippy::too_many_arguments)]
    pub fn create_event(
        &mut self,
        title: String,
        location: String,
        starts_at_ms: U64,
        checkin_minutes: u32,
        asset: String,
        deposit: U128,
        capacity: u32,
        policy: NoShowPolicy,
        reliable: Option<ReliableRule>,
    ) -> U64 {
        require!(!title.is_empty() && title.len() <= 100, "title 1..100 chars");
        require!(location.len() <= 140, "location up to 140 chars");
        require!(deposit.0 > 0, "deposit must be > 0");
        require!(capacity >= 1 && capacity <= MAX_CAPACITY, "capacity 1..150");
        require!(checkin_minutes >= 15 && checkin_minutes <= 24 * 60, "check-in window 15 minutes..24 hours");
        self.assert_asset(&asset);
        if let Some(r) = &reliable {
            require!(r.discount_pct <= 100 && r.min_rate_pct <= 100, "percentages must be 0..100");
        }
        let starts = starts_at_ms.0 * 1_000_000;
        require!(starts > env::block_timestamp(), "event must start in the future");
        let attached = env::attached_deposit().as_yoctonear();
        require!(attached >= EVENT_FEE, "attach 0.05 NEAR");
        let host = env::predecessor_account_id();
        self.refund_excess(&host, attached - EVENT_FEE);
        let id = self.next_event;
        self.next_event += 1;
        self.events.insert(
            id,
            Event {
                host: host.clone(),
                title: title.clone(),
                location,
                starts_at: U64(starts),
                checkin_until: U64(starts + checkin_minutes as u64 * 60 * NS),
                asset: asset.clone(),
                deposit,
                capacity,
                policy,
                reliable,
                checkers: vec![],
                guests: vec![],
                attended: 0,
                cancelled: false,
                settled: false,
                pot: U128(0),
                share: U128(0),
                host_take: U128(0),
                host_withdrawn: false,
            },
        );
        let mut rec = self.records.get(&host).cloned().unwrap_or_default();
        rec.hosted += 1;
        self.records.insert(host.clone(), rec);
        emit("event_created", json!({"event_id": U64(id), "host": host, "title": title, "asset": asset, "deposit": deposit}));
        U64(id)
    }

    /// RSVP to a NEAR event: attach exactly `deposit_for(you, event)`.
    /// `ticket_key` is the public key your phone signs check-in QRs with.
    #[payable]
    pub fn rsvp(&mut self, event_id: U64, ticket_key: PublicKey) {
        let guest = env::predecessor_account_id();
        let event = self.events.get(&event_id.0).expect("no such event").clone();
        require!(event.asset == NATIVE, "this event takes a token deposit: use ft_transfer_call");
        let need = self.deposit_for(guest.clone(), event_id).0;
        let attached = env::attached_deposit().as_yoctonear();
        require!(attached >= need, "attach the deposit (see deposit_for)");
        self.refund_excess(&guest, attached - need);
        self.add_guest(event_id.0, &guest, need, ticket_key);
    }

    /// For token events: register your ticket key first (no deposit), then send the
    /// token with `ft_transfer_call(msg = {"rsvp": <event_id>})`.
    pub fn prepare_rsvp(&mut self, event_id: U64, ticket_key: PublicKey) {
        let guest = env::predecessor_account_id();
        let event = self.events.get(&event_id.0).expect("no such event").clone();
        require!(event.asset != NATIVE, "NEAR events use rsvp()");
        require!(self.can_rsvp(event_id.0, &event, &guest), "cannot RSVP to this event");
        require!(matches!(ticket_key.curve_type(), near_sdk::CurveType::ED25519), "ticket key must be ed25519");
        self.pending.insert(format!("rsvp:{}:{}", event_id.0, guest), guest.clone());
        self.pending_tickets_insert(event_id.0, &guest, ticket_key);
    }

    /// Host (or a checker) scans the guest's QR: `{event_id, guest, ts_ms, signature}`.
    /// The signature is over `checkin_message(contract, event_id, guest, ts_ms)` by the
    /// guest's ticket key and must be fresh (90 s).
    pub fn check_in(&mut self, event_id: U64, guest: AccountId, ts_ms: U64, signature: Base64VecU8) -> bool {
        let caller = env::predecessor_account_id();
        let now = env::block_timestamp();
        let id = event_id.0;
        let event = self.events.get(&id).expect("no such event").clone();
        require!(caller == event.host || event.checkers.contains(&caller), "only the host or a checker can check guests in");
        require!(!event.cancelled && !event.settled, "event is closed");
        require!(now + EARLY_CHECKIN_NS >= event.starts_at.0 && now <= event.checkin_until.0, "check-in is not open");
        let ts = ts_ms.0 * 1_000_000;
        require!(ts <= now + 30 * NS && now.saturating_sub(ts) <= QR_WINDOW_NS, "QR code expired, ask the guest to refresh");
        let key = rsvp_key(id, &guest);
        let mut r = self.rsvps.get(&key).cloned().expect("this guest has not RSVP'd");
        require!(!r.checked_in, "already checked in");
        let sig: [u8; 64] = signature.0.as_slice().try_into().expect("signature must be 64 bytes");
        let pk_bytes: [u8; 32] = r.ticket_key.as_bytes()[1..].try_into().expect("bad ticket key");
        let msg = checkin_message(&env::current_account_id(), id, &guest, ts_ms.0);
        require!(env::ed25519_verify(&sig, msg.as_bytes(), &pk_bytes), "QR signature is not valid for this guest");
        r.checked_in = true;
        self.rsvps.insert(key, r);
        self.events.get_mut(&id).unwrap().attended += 1;
        emit("checked_in", json!({"event_id": event_id, "guest": guest, "by": caller}));
        true
    }

    pub fn add_checker(&mut self, event_id: U64, account: AccountId) {
        let e = self.events.get_mut(&event_id.0).expect("no such event");
        require!(env::predecessor_account_id() == e.host, "only the host");
        if !e.checkers.contains(&account) && e.checkers.len() < 10 {
            e.checkers.push(account);
        }
    }

    /// Host cancels before the start: every guest can withdraw their full deposit.
    pub fn cancel_event(&mut self, event_id: U64) {
        let e = self.events.get_mut(&event_id.0).expect("no such event");
        require!(env::predecessor_account_id() == e.host, "only the host");
        require!(env::block_timestamp() < e.starts_at.0, "event already started");
        require!(!e.cancelled, "already cancelled");
        e.cancelled = true;
        emit("event_cancelled", json!({"event_id": event_id}));
    }

    /// After check-in closes, anyone can settle: no-show deposits form the pot, and
    /// everyone's attendance record is updated.
    pub fn settle(&mut self, event_id: U64) {
        let id = event_id.0;
        let e = self.events.get(&id).expect("no such event").clone();
        require!(!e.cancelled && !e.settled, "event is cancelled or settled");
        require!(env::block_timestamp() > e.checkin_until.0, "check-in is still open");
        let mut pot: u128 = 0;
        for g in &e.guests {
            let r = self.rsvps.get(&rsvp_key(id, g)).unwrap();
            let mut rec = self.records.get(g).cloned().unwrap_or_default();
            if r.checked_in {
                rec.attended += 1;
            } else {
                rec.no_shows += 1;
                pot += r.paid.0;
            }
            self.records.insert(g.clone(), rec);
        }
        let (share, host_take) = match e.policy {
            NoShowPolicy::SplitAttendees if e.attended > 0 => {
                let s = pot / e.attended as u128;
                (s, pot - s * e.attended as u128)
            }
            _ => (0, pot),
        };
        let ev = self.events.get_mut(&id).unwrap();
        ev.settled = true;
        ev.pot = U128(pot);
        ev.share = U128(share);
        ev.host_take = U128(host_take);
        emit("event_settled", json!({"event_id": event_id, "attended": e.attended, "no_shows": e.guests.len() as u32 - e.attended, "pot": U128(pot), "share": U128(share), "host_take": U128(host_take)}));
    }

    /// Collect what you're owed from an event: an attendee's deposit + share, the host's
    /// take, or a full refund if the event was cancelled.
    pub fn withdraw(&mut self, event_id: U64) -> Promise {
        let id = event_id.0;
        let who = env::predecessor_account_id();
        let e = self.events.get(&id).expect("no such event").clone();
        let key = rsvp_key(id, &who);
        let mut amount: u128 = 0;
        let mut as_host = false;
        if let Some(mut r) = self.rsvps.get(&key).cloned() {
            if !r.withdrawn && (e.cancelled || (e.settled && r.checked_in)) {
                amount += r.paid.0 + if e.cancelled { 0 } else { e.share.0 };
                r.withdrawn = true;
                self.rsvps.insert(key, r);
            }
        }
        if who == e.host && e.settled && !e.host_withdrawn && e.host_take.0 > 0 {
            amount += e.host_take.0;
            self.events.get_mut(&id).unwrap().host_withdrawn = true;
            as_host = true;
        }
        require!(amount > 0, "nothing to withdraw");
        emit("withdrawn", json!({"event_id": event_id, "account": who, "amount": U128(amount)}));
        self.payout(&e.asset, &who, amount, Refund::Withdrawal { event_id, account: who.clone(), host: as_host })
    }

    // ==================================================================
    // Tokens (USDC)
    // ==================================================================

    /// `{"fund_card": "<public key>"}` from the card's creator with the exact amount, or
    /// `{"rsvp": <event_id>}` from a guest who called `prepare_rsvp`. Anything else is returned.
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        let token = env::predecessor_account_id();
        let v: Value = serde_json::from_str(&msg).unwrap_or(Value::Null);
        if let Some(pk_str) = v.get("fund_card").and_then(|x| x.as_str()) {
            let Ok(pk) = pk_str.parse::<PublicKey>() else { return PromiseOrValue::Value(amount) };
            let Some(card) = self.cards.get(&pk).cloned() else { return PromiseOrValue::Value(amount) };
            if card.funded || card.cancelled || card.creator != sender_id || card.asset != token.as_str() || card.amount != amount {
                return PromiseOrValue::Value(amount);
            }
            self.pending.remove(&format!("card:{}", pk_str));
            let mut c = card;
            c.funded = true;
            self.cards.insert(pk.clone(), c);
            emit("card_funded", json!({"public_key": pk_str}));
            self.add_claim_key(pk);
            return PromiseOrValue::Value(U128(0));
        }
        if let Some(id) = v.get("rsvp").and_then(|x| x.as_u64()) {
            let Some(event) = self.events.get(&id).cloned() else { return PromiseOrValue::Value(amount) };
            if event.asset != token.as_str() || self.pending.get(&format!("rsvp:{}:{}", id, sender_id)).is_none() {
                return PromiseOrValue::Value(amount);
            }
            let need = self.deposit_for(sender_id.clone(), U64(id)).0;
            if amount.0 != need || !self.can_rsvp(id, &event, &sender_id) {
                return PromiseOrValue::Value(amount);
            }
            let ticket = self.pending_tickets_take(id, &sender_id);
            self.pending.remove(&format!("rsvp:{}:{}", id, sender_id));
            self.add_guest(id, &sender_id, need, ticket);
            return PromiseOrValue::Value(U128(0));
        }
        PromiseOrValue::Value(amount)
    }

    // ==================================================================
    // Callbacks
    // ==================================================================

    #[private]
    pub fn on_payout(&mut self, asset: String, amount: U128, refund: Refund) -> bool {
        let ok = matches!(env::promise_result_checked(0, 256), Ok(_) | Err(PromiseError::TooLong(_)));
        if ok {
            return true;
        }
        // Undo so the money can be claimed again.
        match refund {
            Refund::Card { public_key } => {
                if let Some(mut c) = self.cards.get(&public_key).cloned() {
                    c.claimed_by = None;
                    self.cards.insert(public_key.clone(), c);
                    self.add_claim_key(public_key.clone());
                    emit("card_claim_failed", json!({"public_key": pk_string(&public_key)}));
                }
            }
            Refund::Withdrawal { event_id, account, host } => {
                if let Some(mut r) = self.rsvps.get(&rsvp_key(event_id.0, &account)).cloned() {
                    r.withdrawn = false;
                    self.rsvps.insert(rsvp_key(event_id.0, &account), r);
                }
                if host {
                    self.events.get_mut(&event_id.0).unwrap().host_withdrawn = false;
                }
                emit("withdraw_failed", json!({"event_id": event_id, "account": account}));
            }
            Refund::Cancelled => emit("payout_failed", json!({"asset": asset, "amount": amount})),
        }
        false
    }

    // ==================================================================
    // Views
    // ==================================================================

    pub fn get_card(&self, public_key: PublicKey) -> Option<Card> {
        self.cards.get(&public_key).cloned()
    }

    pub fn cards_by(&self, account_id: AccountId) -> Vec<Card> {
        self.cards_by
            .get(&account_id)
            .cloned()
            .unwrap_or_default()
            .iter()
            .rev()
            .take(50)
            .filter_map(|pk| self.cards.get(pk).cloned())
            .collect()
    }

    pub fn get_event(&self, event_id: U64) -> Option<EventView> {
        self.events.get(&event_id.0).map(|e| EventView { id: event_id, event: e.clone() })
    }

    /// Newest first.
    pub fn list_events(&self, from_index: Option<u64>, limit: Option<u64>) -> Vec<EventView> {
        (0..self.next_event)
            .rev()
            .skip(from_index.unwrap_or(0) as usize)
            .take(limit.unwrap_or(20).min(50) as usize)
            .filter_map(|id| self.get_event(U64(id)))
            .collect()
    }

    pub fn get_rsvp(&self, event_id: U64, account_id: AccountId) -> Option<Rsvp> {
        self.rsvps.get(&rsvp_key(event_id.0, &account_id)).cloned()
    }

    pub fn get_record(&self, account_id: AccountId) -> Attendance {
        self.records.get(&account_id).cloned().unwrap_or_default()
    }

    /// The deposit this account pays for this event (after any reliability discount).
    pub fn deposit_for(&self, account_id: AccountId, event_id: U64) -> U128 {
        let e = self.events.get(&event_id.0).expect("no such event");
        let base = e.deposit.0;
        if let Some(rule) = &e.reliable {
            let rec = self.records.get(&account_id).cloned().unwrap_or_default();
            let done = rec.attended + rec.no_shows;
            if done >= rule.min_events && done > 0 && rec.attended * 100 >= rule.min_rate_pct as u32 * done {
                return U128(base * (100 - rule.discount_pct as u128) / 100);
            }
        }
        U128(base)
    }

    pub fn get_accepted_tokens(&self) -> Vec<AccountId> {
        self.accepted_tokens.clone()
    }

    // ==================================================================
    // Internals
    // ==================================================================

    fn assert_asset(&self, asset: &str) {
        require!(asset == NATIVE || self.accepted_tokens.iter().any(|t| t.as_str() == asset), "asset must be 'near' or an accepted token");
    }

    fn refund_excess(&self, to: &AccountId, extra: u128) {
        if extra > 0 {
            Promise::new(to.clone()).transfer(NearToken::from_yoctonear(extra)).detach();
        }
    }

    fn add_claim_key(&self, pk: PublicKey) {
        Promise::new(env::current_account_id())
            .add_access_key_allowance(pk, Allowance::limited(NearToken::from_yoctonear(CLAIM_ALLOWANCE)).unwrap(), env::current_account_id(), "claim")
            .detach();
    }

    fn can_rsvp(&self, id: u64, e: &Event, guest: &AccountId) -> bool {
        !e.cancelled
            && env::block_timestamp() < e.starts_at.0
            && (e.guests.len() as u32) < e.capacity
            && *guest != e.host
            && self.rsvps.get(&rsvp_key(id, guest)).is_none()
    }

    fn add_guest(&mut self, id: u64, guest: &AccountId, paid: u128, ticket_key: PublicKey) {
        let e = self.events.get(&id).unwrap().clone();
        require!(!e.cancelled, "event is cancelled");
        require!(env::block_timestamp() < e.starts_at.0, "RSVPs are closed");
        require!((e.guests.len() as u32) < e.capacity, "event is full");
        require!(*guest != e.host, "the host cannot RSVP");
        require!(matches!(ticket_key.curve_type(), near_sdk::CurveType::ED25519), "ticket key must be ed25519");
        let key = rsvp_key(id, guest);
        require!(self.rsvps.get(&key).is_none(), "already RSVP'd");
        self.rsvps.insert(key, Rsvp { paid: U128(paid), ticket_key, checked_in: false, withdrawn: false, at: U64(env::block_timestamp()) });
        self.events.get_mut(&id).unwrap().guests.push(guest.clone());
        let mut rec = self.records.get(guest).cloned().unwrap_or_default();
        rec.rsvps += 1;
        self.records.insert(guest.clone(), rec);
        emit("rsvp", json!({"event_id": U64(id), "guest": guest, "paid": U128(paid)}));
    }

    fn pending_tickets_insert(&mut self, id: u64, guest: &AccountId, pk: PublicKey) {
        // The ticket key waits under a "tk:" prefix until the token deposit arrives.
        let placeholder = Rsvp { paid: U128(0), ticket_key: pk, checked_in: false, withdrawn: false, at: U64(0) };
        self.rsvps.insert(format!("tk:{}:{}", id, guest), placeholder);
    }

    fn pending_tickets_take(&mut self, id: u64, guest: &AccountId) -> PublicKey {
        self.rsvps.remove(&format!("tk:{}:{}", id, guest)).expect("call prepare_rsvp first").ticket_key
    }

    fn payout(&self, asset: &str, to: &AccountId, amount: u128, refund: Refund) -> Promise {
        let transfer = if asset == NATIVE {
            Promise::new(to.clone()).transfer(NearToken::from_yoctonear(amount))
        } else {
            let token: AccountId = asset.parse().unwrap();
            Promise::new(token)
                .function_call("storage_deposit", json!({"account_id": to, "registration_only": true}).to_string().into_bytes(), NearToken::from_yoctonear(PAYOUT_RESERVE), GAS_STORAGE)
                .function_call("ft_transfer", json!({"receiver_id": to, "amount": U128(amount), "memo": "showup"}).to_string().into_bytes(), NearToken::from_yoctonear(1), GAS_FT)
        };
        transfer.then(Self::ext(env::current_account_id()).with_static_gas(GAS_CALLBACK).with_unused_gas_weight(0).on_payout(asset.to_string(), U128(amount), refund))
    }
}

#[cfg(test)]
mod tests;
