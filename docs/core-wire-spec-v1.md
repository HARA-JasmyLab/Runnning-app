# ATTA! Core Wire Specification v1.0

Status: **LOCKED FOR HIGH-FIDELITY IMPLEMENTATION**
Date: 2026-09-21
Target: iPhone 16 Pro / 402 x 874 pt reference

This document defines the eight priority production screens that establish ATTA!'s interaction model and visual hierarchy.

Priority screens:

- H01 Home
- H02 Live Trip Map
- P02 AI Trip Builder
- P04 Itinerary
- P08 Spot Detail
- A03 Stamp GET
- M01 Passport Overview
- U02 Rewards & Bookings

The approved reference imagery remains the visual source of truth. This document defines structure, behavior, data, and transitions so future UI changes do not alter product architecture.

---

# 0. Global screen rules

## 0.1 Fixed navigation

```text
ホーム / プラン / ＋ / パスポート / マイページ
```

- Home: map-first current travel state
- Plan: create/edit/book trips
- +: opens P02 directly
- Passport: travel history, world coverage, stamps, stories
- My Page: account, rewards, bookings

No new top-level tab may be added for booking, rewards, wallet, AI, campaigns, or affiliate offers.

## 0.2 Global visual hierarchy

```text
Map / Photography
    ↓
Travel information
    ↓
Stamp / discovery
    ↓
Booking
    ↓
Reward
```

JASMY must never become the dominant visual object on Home, Plan, Spot, or Passport.

## 0.3 Core visual language

- realistic satellite or geographic map surfaces
- real destination photography
- ATTA navy
- ATTA pink/red
- white floating cards
- handwritten ATTA! logo
- rounded 18–28 pt surfaces
- subtle elevation, never dashboard-like
- map/photo occupies more vertical area than cards on primary screens
- reward is shown inline and secondary

## 0.4 Global interaction

- Push transition: 250–300ms
- Bottom sheet: 350–420ms ease-out
- Stamp animation: spring, ~450ms
- Haptic:
  - map pin/select: light
  - arrival: medium
  - stamp: heavy
  - reward settled: success
- OS back / swipe-back must restore exact previous Trip state
- External map / booking return must restore exact Trip / TripItem context

---

# 1. H01 — Home

## Purpose

The user's travel cockpit.

H01 must answer, within one glance:

1. Where am I in my travel lifecycle?
2. What trip is active/upcoming?
3. What did I discover?
4. What is the next meaningful action?

## States

```text
EMPTY
UPCOMING
ACTIVE
RECENTLY_COMPLETED
```

H01 remains one route; state changes its content.

## ACTIVE state — canonical layout

### Layer 1 — Satellite Map Hero

Approximate height: **520–610 pt**

Content:

- ATTA! logo top-left
- map / list segmented control top-right
- current Trip label
- total Trip distance
- region / spot count
- white dotted route
- circular photo pins
- current location
- transportation glyphs where meaningful
- locate floating action button

Reference behavior:

```text
今回の旅
1,250 km
8都道府県・12スポット
```

Map must remain directly pannable only when H01 is in ACTIVE state and interaction does not conflict with the sheet below.

### Layer 2 — Latest Discovery Card

White floating card overlapping map bottom edge.

Content:

- latest earned stamp image/photo
- stamp title
- place name
- acquired date/time
- stamp visual
- optional reward line, secondary:
  `+20 JASMY`

Tap:
- place stamp -> Stamp Detail sheet
- place name/photo -> P08
- card background -> M04 filtered to current Trip

### Layer 3 — Movement Summary

White card.

Columns:

- Walk
- Train
- Car
- Flight

Data:

- actual traveled distance
- mode inference or user-confirmed mode

No gamified points here.

### Layer 4 — Next action

ACTIVE:
- primary: `Live Mapを開く` -> H02

UPCOMING:
- `旅のしおりを見る` -> P04
- `旅を開始` appears only when start conditions are met

EMPTY:
- full-height AI trip entry
- primary -> P02

RECENTLY_COMPLETED:
- hero map remains
- primary -> M03 Trip Diary

## Data contract

H01 requires:

```text
TripSummary
- trip_id
- status
- title
- start_at / end_at
- total_distance
- visited_place_count
- planned_place_count
- route_preview
- transport_summary
- latest_stamp
- current_trip_item
- next_trip_item
```

## Analytics

- home_viewed
- home_trip_opened
- home_latest_stamp_opened
- home_live_map_opened

## Edge states

- map unavailable -> styled static route preview + retry
- offline -> cached Trip summary
- location denied -> map remains usable; current location omitted
- no latest stamp -> show next destination card instead
- long trip title -> max 2 lines

## Acceptance criteria

- user can identify active Trip in <2 seconds
- map occupies majority of first viewport
- latest stamp is visible without scrolling
- reward is not visually louder than place/stamp
- Home never looks like a finance/reward dashboard

---

# 2. H02 — Live Trip Map

## Purpose

The core in-travel screen.

H02 answers:

- Where am I?
- Where am I going?
- How long will it take?
- What have I already discovered?
- Do I need to change the plan?

## Layout

### Full-screen Mapbox map

Map occupies the full viewport behind overlays.

Required layers:

- current location
- route to next TripItem
- visited route
- visited photo pins
- next destination pin
- later destination pins
- optional transport segment markers

### Header overlay

Left:
- back
- Trip title

Right:
- day selector
- overflow

### Map controls

Right vertical rail:

- locate
- map style
- ATTA! AI

### Bottom next-stop sheet

Content:

```text
NEXT
竹林の小径
京都・嵐山

徒歩 18分
1.2 km

[ナビを開始]
[スポットを見る]
```

If booking is relevant:

```text
予約済み / 予約可能
```

but this remains secondary.

## Actions

- spot card -> P08
- navigation -> native provider chooser
- AI button -> H03
- visited photo pin -> memory preview
- map pin -> compact Place peek sheet
- arrival eligibility -> A01 automatically

## Arrival detection

Initial production eligibility:

- geofence ~150m
- GPS accuracy <=50m preferred
- dwell ~20 sec
- duplicate Visit prevention
- impossible travel check

User must not tap a manual "GET stamp" button.

## Route refresh

Refresh triggers:

- current location meaningfully changes
- TripItem changes
- route is stale
- user accepts H03 replan

Do not continuously recalculate per GPS sample.

## Data contract

```text
LiveTripMap
- trip_id
- trip_day
- current_location
- location_accuracy
- visited_route
- current_route
- visited_places[]
- next_trip_item
- future_trip_items[]
- active_visit_candidate
```

## Analytics

- live_map_viewed
- map_pin_opened
- navigation_started
- in_trip_ai_opened
- arrival_candidate_started

## Edge states

- foreground location off -> visible CTA to enable
- offline -> cached map + cached itinerary + local route collection
- route API failure -> straight-line/last-known route with disclosure
- external navigation -> ATTA tracking continues
- app relaunch while ACTIVE -> H02 restoration available from H01 immediately

## Acceptance criteria

- next destination is always identifiable
- ETA/distance visible without opening another screen
- current location and visited places use different visual semantics
- map remains usable with location denied
- external navigation does not destroy active Trip state

---

# 3. P02 — AI Trip Builder

## Purpose

Make creating a realistic Trip materially faster than manual itinerary tools.

The screen should feel like **"describe the trip, not fill out a form."**

## Layout

### Hero

Large destination/travel photography or subtle geographic imagery.

Copy:

```text
AIとつくる、
あなただけの旅プラン。
```

### Natural language input — primary

Large input box.

Example:

```text
京都に家族4人で2泊3日。
美味しいものと寺を楽しみたい。
歩きすぎないプランがいい。
```

Voice input optional.

### Structured essentials

Required:

- Destination
- Dates

Optional:

- companions
- interests
- pace
- must-do places
- budget

Structured fields exist to constrain AI, not replace the natural-language entry.

### CTA

`AIで旅をつくる`

Disabled only if destination or dates are missing.

## Input behavior

AI should parse free text and pre-fill structured choices.

Example:

```text
"家族4人" -> companion: family, party_size: 4
"歩きすぎない" -> pace: relaxed
"寺" -> interest: history/culture
```

User can override parsed values.

## Data contract

```text
TripGenerationRequest
- free_text
- destinations[]
- start_date
- end_date
- party
- interests[]
- pace
- must_do_place_ids[]
- budget_range
- locale
```

## API behavior

Submit:

`POST /trip-generation-jobs`

Returns:

- job_id
- draft_trip_id
- status

Transition -> P03.

Generation must be idempotent.

## Analytics

- trip_create_started
- trip_builder_field_changed
- trip_ai_generate

## Edge states

- invalid dates
- destination unresolved
- conflicting must-do places
- trip too dense
- no internet -> retain draft input locally
- user leaves during generation -> generation continues server-side

## Acceptance criteria

- first-time user can submit with <=3 interactions after typing free text
- destination/date errors are inline
- no crypto/reward language is shown
- builder remains visually travel/editorial, not enterprise-form-like

---

# 4. P04 — Itinerary

## Purpose

Primary planning surface.

This is where ATTA! should outperform manual itinerary tools.

## Layout

### Hero

Trip photography + title + dates + party.

### Day switch

```text
DAY 1 / DAY 2 / DAY 3
```

### Timeline

Each TripItem card includes:

- time
- real photo
- place name
- concise reason/description
- travel time to next item
- booking status if relevant
- stamp indicator if relevant
- drag handle

Example:

```text
09:00
京都駅

10:00
京都鉄道博物館
徒歩 12分

12:30
錦市場
予約不要

15:00
清水寺
```

### Booking card — inline

When a contextual offer exists:

```text
人力車ツアー
¥8,000
+120 JASMY予定
[予約を見る]
```

Reward uses smaller typography than price/title.

### Quick AI actions

- もっとゆっくり
- 雨の日
- 子ども向け
- グルメを増やす

Each produces a preview of the changes before mutation.

### Bottom actions

- Edit -> P05
- Map -> P06
- Confirm Trip

## Reorder behavior

Drag-and-drop must update:

- TripItem order
- route legs
- travel time
- conflicts

If invalid:
- show conflict before commit
- allow undo

## AI replan preview

Example:

```text
変更すると:
徒歩 -1.8km
移動時間 -26分
錦市場 12:30 -> 12:10
```

CTA:
`この予定に変更`

## Data contract

```text
TripPlan
- trip
- days[]
- items[]
- route_legs[]
- booking_offers[]
- conflicts[]
- generation_version
```

## Analytics

- itinerary_viewed
- trip_item_reordered
- trip_item_removed
- trip_item_added
- trip_ai_replan_previewed
- trip_ai_replan_accepted
- booking_offer_opened
- trip_confirmed

## Edge states

- place closed
- travel time changed
- bad weather
- booking sold out
- overlapping reservation
- trip item deleted by collaborator
- stale plan version

## Acceptance criteria

- day plan understandable without opening map
- route time is visible between items
- booking does not visually dominate itinerary
- any AI mutation is previewed before acceptance
- undo exists for destructive itinerary edits

---

# 5. P08 — Spot Detail

## Purpose

The Place is ATTA!'s central content-commerce-discovery object.

P08 must feel like a travel editorial page first.

## Information order — fixed

1. Map context
2. Large photography
3. Place identity
4. Useful editorial description
5. Tags
6. Nearby places
7. Stamp
8. Booking offers
9. Reward

This order must not be inverted.

## Layout

### Map context

Small real map panel with nearby photo bubbles.

### Main photography

Large real destination image.

Controls:

- back
- favorite
- photo count
- share optional

### Place identity

```text
竹林の小径
🇯🇵 京都・嵐山
```

Avoid unsourced ratings.

### Editorial copy

Concise, grounded, practical.

Include:
- why visit
- typical duration
- best timing
- accessibility/family note when relevant

### Tags

Examples:

- 絶景
- 歴史
- 散歩
- 文化
- 写真

### Nearby

3 visual cards initially.

### Stamp block

```text
ATTA! STAMP
竹林を歩こう
現地に到着するとGET
```

If earned:
- acquired date
- memory thumbnail

### Booking offers

Contextual only.

Example:

```text
この場所でできる体験

人力車ツアー
¥8,000
+120 JASMY予定
[詳細を見る]
```

## Data contract

```text
PlaceDetail
- place
- photos[]
- editorial
- opening_hours
- practical_info
- tags[]
- nearby_places[]
- stamp_definition
- earned_stamp
- booking_offers[]
```

## Analytics

- spot_viewed
- spot_saved
- nearby_place_opened
- stamp_preview_opened
- booking_offer_opened
- spot_navigation_started

## Edge states

- no booking offers -> omit section entirely
- no stamp -> omit stamp block
- closed today -> practical warning, not modal
- missing hero image -> editorial placeholder image
- rating unavailable -> do not fabricate

## Acceptance criteria

- top half of screen is photo/map, not text
- booking appears below core place content
- reward never appears before booking price
- stamp is visible but not louder than place identity

---

# 6. A03 — Stamp GET

## Purpose

Peak delight moment.

This screen is the emotional payoff for real-world discovery.

## Layout

Full-screen photographic background with soft blur/dim.

Center:

- ATTA! logo
- large physical-looking stamp
- Stamp name
- Place
- acquired time/date
- collection progress

Example:

```text
ATTA!

竹林を歩こう
ARASHIYAMA

京都・嵐山
7 / 10 STAMPS
```

### Reward

If eligible:

```text
+20 JASMY
```

Small, secondary, after the stamp identity.

For booking reward:
`+120 JASMY 獲得予定`

Never imply settled reward before RewardEvent status allows it.

## Motion

```text
0.0s  background visible
0.1s  stamp scale .4
0.35s scale 1.12
0.45s settle 1.0
```

Haptic:
- medium on reveal
- heavy on stamp impact

Optional subtle SFX, user-controlled.

## Actions

Primary:
- `写真を残す` -> A04

Secondary:
- `旅を続ける` -> H02

## Data contract

```text
StampEarnResult
- earned_stamp_id
- definition
- place
- acquired_at
- trip_collection_progress
- reward_event
```

## Analytics

- stamp_earned
- stamp_reward_shown
- stamp_memory_started
- stamp_continue

## Edge states

- already earned -> do not replay reward settlement
- Visit valid but reward pending -> show stamp, pending reward
- reward service failure -> stamp still succeeds
- offline -> stamp stored locally and syncs; do not lose earned state

## Acceptance criteria

- user understands what was discovered before seeing reward
- no finance terminology
- stamp acquisition succeeds even if reward subsystem is unavailable
- replaying screen cannot duplicate reward

---

# 7. M01 — Passport Overview

## Purpose

Turn travel history into an emotional, durable identity.

This is not a rewards dashboard.

## Layout

### Globe / world map hero

Large globe or world map.

Content:

```text
これまでの旅で、
世界が少し近くなった。
```

Map shows:
- visited countries
- route traces
- travel points
- subtle trip clusters

### Travel coverage cards

Examples:

```text
32か国
訪れた国

16%
世界を旅した
```

### Continents / regions

Compact coverage row.

### Recent trips

Photo-first Trip cards.

### Stamp collection

White passport-style card:

```text
ATTA! スタンプコレクション
48 / 100
まだ見ぬ景色を集めよう。
```

Tap -> M04.

## Data contract

```text
PassportOverview
- visited_countries[]
- visited_regions[]
- travel_coverage
- recent_trips[]
- stamp_summary
- map_points[]
- map_routes[]
```

## Analytics

- passport_viewed
- passport_trip_opened
- passport_stampbook_opened
- passport_map_interacted

## Edge states

- 0 countries -> aspirational empty globe
- domestic-only user -> country count remains 1; emphasize cities/regions
- private trips -> not included in public story unless opted in

## Acceptance criteria

- globe/map dominates first viewport
- no JASMY balance on hero
- coverage and memories feel more important than collection completion
- emotional copy remains concise

---

# 8. U02 — Rewards & Bookings

## Purpose

The one screen where ATTA! can become operational without contaminating the travel experience.

U02 combines reward accounting and booking history because the two are causally linked.

## Layout

### Header

```text
ATTA! Rewards
3,482 JASMY
```

Secondary:

- pending
- approved
- settled

Example:

```text
獲得予定  420 JASMY
確定      3,062 JASMY
```

Do not show fiat value by default.

### Tabs

```text
[リワード] [予約]
```

### Reward ledger

Rows:

```text
竹林の小径
PLACE STAMP
+20 JASMY
SETTLED

嵐山 人力車
BOOKING
+120 JASMY
PENDING
```

Status labels in Japanese:

- PENDING -> 獲得予定
- APPROVED -> 確定
- SETTLED -> 受取済み
- REVERSED -> 取消

### Booking history

Rows:

- provider/product
- booking date
- travel date
- price
- affiliate status
- reward status

### Advanced section

Collapsed by default:

```text
ウォレット・ネットワーク情報
```

Only here can the user inspect:

- wallet address
- JasmyChain
- settlement transaction references

No seed phrase UX.

## Data contract

```text
RewardsAndBookings
- reward_account
- reward_events[]
- bookings[]
- settlement_batches[]
- embedded_wallet_summary
```

## Analytics

- rewards_viewed
- reward_event_opened
- booking_history_viewed
- booking_detail_opened
- wallet_advanced_opened

## Edge states

- no rewards -> explain how travel/booking earns rewards
- pending affiliate confirmation -> show expected approval state
- reversed reward -> show reason
- settlement delayed -> ledger remains authoritative
- wallet unavailable -> reward account still works

## Acceptance criteria

- user can distinguish pending vs settled immediately
- blockchain is not required to understand the screen
- fiat value is not the primary balance representation
- booking cancellation can visibly reverse a pending/approved reward
- wallet details remain secondary and collapsed

---

# 9. Shared component inventory for these 8 screens

Components to standardize:

```text
ATTA/Brand
ATTA/Nav/Bottom
ATTA/Map/SatelliteHero
ATTA/Map/PhotoPin
ATTA/Map/CurrentLocation
ATTA/Card/TripSummary
ATTA/Card/LatestStamp
ATTA/Card/Movement
ATTA/Card/TripItem
ATTA/Card/BookingOffer
ATTA/Card/NearbyPlace
ATTA/Card/PassportCollection
ATTA/Card/RewardEvent
ATTA/Chip/Filter
ATTA/Button/Primary
ATTA/Button/Secondary
ATTA/Stamp/Large
ATTA/Stamp/Small
ATTA/Sheet/PlacePeek
ATTA/Sheet/AIReplan
```

---

# 10. Production implementation sequence

Implement in this order:

```text
1. H01 Home
2. P02 AI Trip Builder
3. P04 Itinerary
4. P08 Spot Detail
5. H02 Live Trip Map
6. A03 Stamp GET
7. M01 Passport
8. U02 Rewards & Bookings
```

Reason:

- H01 establishes navigation and map visual language
- P02/P04 establish the core planning value
- P08 connects content + stamp + commerce
- H02/A03 validate real-world loop
- M01 provides retention
- U02 adds monetization/reward operations last

---

# 11. Definition of done for core UI

The eight-screen milestone is complete only when:

- all screens use real or production-grade map/photo surfaces
- all transitions follow Product Architecture v1
- Bottom Nav is fixed
- Booking has no standalone top-level tab
- Reward does not dominate primary travel screens
- P02 -> P04 flow works without manual data reset
- H02 can restore an ACTIVE Trip after reload
- A03 cannot duplicate earned reward
- M01 is useful with domestic-only history
- U02 distinguishes pending/settled/reversed reward
- iPhone 16 Pro / 15 / SE-width layouts do not overflow
- accessibility labels exist for map controls and primary CTAs
- analytics events are emitted for primary actions
