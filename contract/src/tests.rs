#![allow(unused_must_use)]
use super::*;
use ed25519_dalek::{Signer, SigningKey};
use near_sdk::test_utils::{get_logs, VMContextBuilder};
use near_sdk::{testing_env, CurveType, NearToken, PromiseResult};

const NEAR: u128 = 1_000_000_000_000_000_000_000_000;
const MS: u64 = 1_000_000;
const T0: u64 = 1_000_000 * MS; // 1000 s

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}

fn key(seed: u8) -> (SigningKey, PublicKey) {
    let sk = SigningKey::from_bytes(&[seed; 32]);
    let pk = PublicKey::from_parts(CurveType::ED25519, sk.verifying_key().to_bytes().to_vec()).unwrap();
    (sk, pk)
}

fn ctx(who: &str, deposit: u128, t: u64) -> VMContextBuilder {
    let mut b = VMContextBuilder::new();
    b.current_account_id(acc("showup.near"))
        .predecessor_account_id(acc(who))
        .signer_account_id(acc(who))
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .account_balance(NearToken::from_near(100))
        .block_timestamp(t);
    b
}

fn at(who: &str, deposit: u128, t: u64) {
    testing_env!(ctx(who, deposit, t).build());
}

fn setup() -> ShowUp {
    at("deployer.near", 0, T0);
    ShowUp::new(vec![acc("usdc.near")])
}

// ---------------------------------------------------------------- cards

fn claim_as_card(pk: &PublicKey) {
    let mut c = ctx("showup.near", 0, T0);
    c.signer_account_pk(pk.clone());
    testing_env!(c.build());
}

#[test]
fn card_create_and_claim_with_link_key() {
    let mut s = setup();
    let (_, pk) = key(1);
    at("alice.near", NEAR + CARD_FEE, T0);
    s.create_card(pk.clone(), NATIVE.into(), U128(NEAR), Some("Happy birthday!".into()));
    let c = s.get_card(pk.clone()).unwrap();
    assert!(c.funded);
    assert_eq!(s.cards_by(acc("alice.near")).len(), 1);

    claim_as_card(&pk);
    s.claim(acc(&"b".repeat(64)));
    let c = s.get_card(pk).unwrap();
    assert_eq!(c.claimed_by, Some(acc(&"b".repeat(64))));
    assert!(get_logs().iter().any(|l| l.contains("card_claimed")));
}

#[test]
#[should_panic(expected = "card is not claimable")]
fn card_cannot_be_claimed_twice() {
    let mut s = setup();
    let (_, pk) = key(1);
    at("alice.near", NEAR + CARD_FEE, T0);
    s.create_card(pk.clone(), NATIVE.into(), U128(NEAR), None);
    claim_as_card(&pk);
    s.claim(acc("bob.near"));
    s.claim(acc("eve.near"));
}

#[test]
#[should_panic(expected = "sign with the card's key")]
fn claim_must_come_from_the_card_key() {
    let mut s = setup();
    let (_, pk) = key(1);
    at("alice.near", NEAR + CARD_FEE, T0);
    s.create_card(pk, NATIVE.into(), U128(NEAR), None);
    at("eve.near", 0, T0);
    s.claim(acc("eve.near"));
}

#[test]
#[should_panic(expected = "not a card key")]
fn unknown_key_cannot_claim() {
    let mut s = setup();
    let (_, other) = key(9);
    claim_as_card(&other);
    s.claim(acc("eve.near"));
}

#[test]
#[should_panic(expected = "attach amount + 0.025 NEAR")]
fn card_needs_fee() {
    let mut s = setup();
    let (_, pk) = key(1);
    at("alice.near", NEAR, T0);
    s.create_card(pk, NATIVE.into(), U128(NEAR), None);
}

#[test]
fn creator_can_cancel_unclaimed_card() {
    let mut s = setup();
    let (_, pk) = key(1);
    at("alice.near", NEAR + CARD_FEE, T0);
    s.create_card(pk.clone(), NATIVE.into(), U128(NEAR), None);
    at("alice.near", 0, T0);
    s.cancel_card(pk.clone());
    assert!(s.get_card(pk).unwrap().cancelled);
}

#[test]
#[should_panic(expected = "only the creator can cancel")]
fn others_cannot_cancel_card() {
    let mut s = setup();
    let (_, pk) = key(1);
    at("alice.near", NEAR + CARD_FEE, T0);
    s.create_card(pk.clone(), NATIVE.into(), U128(NEAR), None);
    at("eve.near", 0, T0);
    s.cancel_card(pk);
}

#[test]
fn usdc_card_funds_only_from_creator_with_exact_amount() {
    let mut s = setup();
    let (_, pk) = key(2);
    at("alice.near", CARD_FEE, T0);
    s.create_card(pk.clone(), "usdc.near".into(), U128(5_000_000), None);
    assert!(!s.get_card(pk.clone()).unwrap().funded);
    let msg = json!({"fund_card": String::from(&pk)}).to_string();
    at("usdc.near", 0, T0);
    assert!(matches!(s.ft_on_transfer(acc("eve.near"), U128(5_000_000), msg.clone()), PromiseOrValue::Value(U128(5_000_000))));
    assert!(matches!(s.ft_on_transfer(acc("alice.near"), U128(4), msg.clone()), PromiseOrValue::Value(U128(4))));
    assert!(matches!(s.ft_on_transfer(acc("alice.near"), U128(5_000_000), msg), PromiseOrValue::Value(U128(0))));
    assert!(s.get_card(pk).unwrap().funded);
}

#[test]
fn failed_card_payout_makes_card_claimable_again() {
    let mut s = setup();
    let (_, pk) = key(1);
    at("alice.near", NEAR + CARD_FEE, T0);
    s.create_card(pk.clone(), NATIVE.into(), U128(NEAR), None);
    claim_as_card(&pk);
    s.claim(acc("nonexistent.near"));
    testing_env!(ctx("showup.near", 0, T0).build(), near_sdk::test_vm_config(), near_sdk::RuntimeFeesConfig::test(), Default::default(), vec![PromiseResult::Failed]);
    assert!(!s.on_payout(NATIVE.into(), U128(NEAR), Refund::Card { public_key: pk.clone() }));
    assert_eq!(s.get_card(pk).unwrap().claimed_by, None);
}

// ---------------------------------------------------------------- events

const START_MS: u64 = 10_000_000; // 10,000 s
const START: u64 = START_MS * MS;

fn event(s: &mut ShowUp, policy: NoShowPolicy, reliable: Option<ReliableRule>) -> U64 {
    at("host.near", EVENT_FEE, T0);
    s.create_event("NEAR Lagos meetup".into(), "Yaba, Lagos".into(), U64(START_MS), 60, NATIVE.into(), U128(NEAR), 50, policy, reliable)
}

fn rsvp(s: &mut ShowUp, id: U64, guest: &str, seed: u8) -> SigningKey {
    let (sk, pk) = key(seed);
    let need = s.deposit_for(acc(guest), id).0;
    at(guest, need, T0);
    s.rsvp(id, pk);
    sk
}

fn qr(sk: &SigningKey, id: U64, guest: &str, ts_ms: u64) -> Base64VecU8 {
    let msg = checkin_message(&acc("showup.near"), id.0, &acc(guest), ts_ms);
    Base64VecU8(sk.sign(msg.as_bytes()).to_bytes().to_vec())
}

fn check_in(s: &mut ShowUp, id: U64, guest: &str, sk: &SigningKey) {
    let now_ms = START_MS + 60_000;
    at("host.near", 0, now_ms * MS);
    assert!(s.check_in(id, acc(guest), U64(now_ms - 10_000), qr(sk, id, guest, now_ms - 10_000)));
}

fn after_checkin() -> u64 {
    START + 61 * 60 * 1_000_000_000
}

#[test]
fn full_event_split_pot_among_attendees() {
    let mut s = setup();
    let id = event(&mut s, NoShowPolicy::SplitAttendees, None);
    let a = rsvp(&mut s, id, "ada.near", 1);
    let b = rsvp(&mut s, id, "bayo.near", 2);
    rsvp(&mut s, id, "chidi.near", 3);
    check_in(&mut s, id, "ada.near", &a);
    check_in(&mut s, id, "bayo.near", &b);
    at("anyone.near", 0, after_checkin());
    s.settle(id);
    let e = s.get_event(id).unwrap().event;
    assert_eq!((e.attended, e.pot.0, e.share.0, e.host_take.0), (2, NEAR, NEAR / 2, 0));

    at("ada.near", 0, after_checkin());
    s.withdraw(id);
    assert!(get_logs().iter().any(|l| l.contains(&format!("\"amount\":\"{}\"", NEAR + NEAR / 2))));
    assert_eq!(s.get_record(acc("ada.near")).attended, 1);
    assert_eq!(s.get_record(acc("chidi.near")).no_shows, 1);
    assert_eq!(s.get_record(acc("host.near")).hosted, 1);
}

#[test]
#[should_panic(expected = "nothing to withdraw")]
fn no_show_cannot_withdraw() {
    let mut s = setup();
    let id = event(&mut s, NoShowPolicy::SplitAttendees, None);
    rsvp(&mut s, id, "chidi.near", 3);
    at("anyone.near", 0, after_checkin());
    s.settle(id);
    at("chidi.near", 0, after_checkin());
    s.withdraw(id);
}

#[test]
#[should_panic(expected = "nothing to withdraw")]
fn attendee_cannot_withdraw_twice() {
    let mut s = setup();
    let id = event(&mut s, NoShowPolicy::SplitAttendees, None);
    let a = rsvp(&mut s, id, "ada.near", 1);
    check_in(&mut s, id, "ada.near", &a);
    at("anyone.near", 0, after_checkin());
    s.settle(id);
    at("ada.near", 0, after_checkin());
    s.withdraw(id);
    s.withdraw(id);
}

#[test]
fn host_policy_gives_pot_to_host() {
    let mut s = setup();
    let id = event(&mut s, NoShowPolicy::Host, None);
    let a = rsvp(&mut s, id, "ada.near", 1);
    rsvp(&mut s, id, "chidi.near", 3);
    check_in(&mut s, id, "ada.near", &a);
    at("anyone.near", 0, after_checkin());
    s.settle(id);
    assert_eq!(s.get_event(id).unwrap().event.host_take.0, NEAR);
    at("host.near", 0, after_checkin());
    s.withdraw(id);
    assert!(s.get_event(id).unwrap().event.host_withdrawn);
}

#[test]
#[should_panic(expected = "QR signature is not valid")]
fn qr_signed_by_someone_else_is_rejected() {
    let mut s = setup();
    let id = event(&mut s, NoShowPolicy::SplitAttendees, None);
    rsvp(&mut s, id, "ada.near", 1);
    let (impostor, _) = key(77);
    let now_ms = START_MS + 60_000;
    at("host.near", 0, now_ms * MS);
    s.check_in(id, acc("ada.near"), U64(now_ms), qr(&impostor, id, "ada.near", now_ms));
}

#[test]
#[should_panic(expected = "QR code expired")]
fn old_screenshot_qr_is_rejected() {
    let mut s = setup();
    let id = event(&mut s, NoShowPolicy::SplitAttendees, None);
    let a = rsvp(&mut s, id, "ada.near", 1);
    let now_ms = START_MS + 30 * 60_000;
    let old = now_ms - 5 * 60_000;
    at("host.near", 0, now_ms * MS);
    s.check_in(id, acc("ada.near"), U64(old), qr(&a, id, "ada.near", old));
}

#[test]
#[should_panic(expected = "only the host or a checker")]
fn guests_cannot_check_themselves_in() {
    let mut s = setup();
    let id = event(&mut s, NoShowPolicy::SplitAttendees, None);
    let a = rsvp(&mut s, id, "ada.near", 1);
    let now_ms = START_MS + 60_000;
    at("ada.near", 0, now_ms * MS);
    s.check_in(id, acc("ada.near"), U64(now_ms), qr(&a, id, "ada.near", now_ms));
}

#[test]
fn a_checker_can_scan_for_the_host() {
    let mut s = setup();
    let id = event(&mut s, NoShowPolicy::SplitAttendees, None);
    let a = rsvp(&mut s, id, "ada.near", 1);
    at("host.near", 0, T0);
    s.add_checker(id, acc("door.near"));
    let now_ms = START_MS + 60_000;
    at("door.near", 0, now_ms * MS);
    assert!(s.check_in(id, acc("ada.near"), U64(now_ms), qr(&a, id, "ada.near", now_ms)));
}

#[test]
fn reliable_guests_pay_less() {
    let mut s = setup();
    let id = event(&mut s, NoShowPolicy::SplitAttendees, None);
    let a = rsvp(&mut s, id, "ada.near", 1);
    check_in(&mut s, id, "ada.near", &a);
    at("anyone.near", 0, after_checkin());
    s.settle(id);

    // second event: 50% off for people with >= 1 event and >= 100% attendance
    at("host.near", EVENT_FEE, after_checkin());
    let id2 = s.create_event("Meetup 2".into(), "".into(), U64(START_MS * 3), 60, NATIVE.into(), U128(NEAR), 50, NoShowPolicy::SplitAttendees, Some(ReliableRule { min_events: 1, min_rate_pct: 100, discount_pct: 50 }));
    assert_eq!(s.deposit_for(acc("ada.near"), id2).0, NEAR / 2);
    assert_eq!(s.deposit_for(acc("newcomer.near"), id2).0, NEAR);
}

#[test]
fn cancelled_event_refunds_in_full() {
    let mut s = setup();
    let id = event(&mut s, NoShowPolicy::SplitAttendees, None);
    rsvp(&mut s, id, "ada.near", 1);
    at("host.near", 0, T0);
    s.cancel_event(id);
    at("ada.near", 0, T0);
    s.withdraw(id);
    assert!(s.get_rsvp(id, acc("ada.near")).unwrap().withdrawn);
}

#[test]
#[should_panic(expected = "already RSVP'd")]
fn no_double_rsvp() {
    let mut s = setup();
    let id = event(&mut s, NoShowPolicy::SplitAttendees, None);
    rsvp(&mut s, id, "ada.near", 1);
    rsvp(&mut s, id, "ada.near", 1);
}

#[test]
#[should_panic(expected = "the host cannot RSVP")]
fn host_cannot_rsvp() {
    let mut s = setup();
    let id = event(&mut s, NoShowPolicy::SplitAttendees, None);
    rsvp(&mut s, id, "host.near", 1);
}

#[test]
#[should_panic(expected = "check-in is still open")]
fn cannot_settle_early() {
    let mut s = setup();
    let id = event(&mut s, NoShowPolicy::SplitAttendees, None);
    at("anyone.near", 0, START + MS);
    s.settle(id);
}

#[test]
fn usdc_event_rsvp_via_ft_transfer_call() {
    let mut s = setup();
    at("host.near", EVENT_FEE, T0);
    let id = s.create_event("Paid in USDC".into(), "".into(), U64(START_MS), 60, "usdc.near".into(), U128(2_000_000), 10, NoShowPolicy::SplitAttendees, None);
    let (_, pk) = key(5);
    at("ada.near", 0, T0);
    s.prepare_rsvp(id, pk);
    let msg = json!({"rsvp": id.0}).to_string();
    at("usdc.near", 0, T0);
    assert!(matches!(s.ft_on_transfer(acc("eve.near"), U128(2_000_000), msg.clone()), PromiseOrValue::Value(U128(2_000_000))));
    assert!(matches!(s.ft_on_transfer(acc("ada.near"), U128(1), msg.clone()), PromiseOrValue::Value(U128(1))));
    assert!(matches!(s.ft_on_transfer(acc("ada.near"), U128(2_000_000), msg), PromiseOrValue::Value(U128(0))));
    assert_eq!(s.get_event(id).unwrap().event.guests, vec![acc("ada.near")]);
}

#[test]
fn failed_withdraw_can_be_retried() {
    let mut s = setup();
    let id = event(&mut s, NoShowPolicy::SplitAttendees, None);
    let a = rsvp(&mut s, id, "ada.near", 1);
    check_in(&mut s, id, "ada.near", &a);
    at("anyone.near", 0, after_checkin());
    s.settle(id);
    at("ada.near", 0, after_checkin());
    s.withdraw(id);
    testing_env!(ctx("showup.near", 0, after_checkin()).build(), near_sdk::test_vm_config(), near_sdk::RuntimeFeesConfig::test(), Default::default(), vec![PromiseResult::Failed]);
    s.on_payout(NATIVE.into(), U128(NEAR), Refund::Withdrawal { event_id: id, account: acc("ada.near"), host: false });
    assert!(!s.get_rsvp(id, acc("ada.near")).unwrap().withdrawn);
}

/// A ticket QR signed by the mobile app's own code (app/test/make-fixture.ts), verified here.
#[test]
fn ticket_signed_by_the_app_verifies_in_the_contract() {
    let mut s = setup();
    let id = event(&mut s, NoShowPolicy::SplitAttendees, None);
    let pk: PublicKey = "ed25519:FLqzRV2jB8ieziHeeFnCmfuqNbJ8oBDqqmtgVYGmAHd2".parse().unwrap();
    at("ada.near", NEAR, T0);
    s.rsvp(id, pk);
    let sig: Base64VecU8 = serde_json::from_value(json!("uac/+na7RIrtGVrfgSqt/eaTB4Hub7AFkJonoFVd3ctHdrZll1cjmZFqGucLdxuQk7M6jL3BggsYAVx59ouUBw==")).unwrap();
    at("host.near", 0, (10060000 + 10_000) * MS);
    assert!(s.check_in(id, acc("ada.near"), U64(10060000), sig));
}
