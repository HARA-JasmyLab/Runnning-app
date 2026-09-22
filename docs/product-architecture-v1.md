# ATTA! Product Architecture v1.0

Status: **LOCKED FOR PRODUCTION DESIGN**
Date: 2026-09-21

ATTA! is a travel product whose core experience is:

```text
PLAN -> BOOK -> TRAVEL -> ATTA! -> EARN -> REMEMBER
```

The product must always feel like a travel app first. Booking, affiliate monetization, rewards, and JasmyChain remain supporting infrastructure.

---

## 1. Product definition

**AIで旅をつくり、予約し、実際に旅をして、発見をスタンプとして集め、旅の記録とJASMYが自然に残るアプリ。**

Three product pillars:

1. **PLAN** — AI travel planning
2. **DISCOVER** — map + stamp rally
3. **REWARD** — booking + JASMY
4. **PASSPORT** — the durable record tying all three together

---

## 2. Fixed global navigation

The bottom navigation is fixed to:

```text
ホーム / プラン / ＋ / パスポート / マイページ
```

### Home
Current trip and lived travel activity. Map-first.

### Plan
Trip creation, itinerary editing, discovery, collaboration and booking.

### +
Start a new trip. Opens AI Trip Builder directly.

### Passport
Travel history, world map, stamp collection, diaries and shareable stories.

### My Page
Profile, rewards, booking history, privacy and advanced account settings.

The labels and order above must not change without an architecture revision.

---

## 3. Production Screen Map — 26 core screens

### HOME / TRAVEL

| ID | Screen | Purpose | Primary next |
|---|---|---|---|
| H01 | Home | One surface with EMPTY / UPCOMING / ACTIVE states. Satellite map and latest travel activity are primary. | P02 / H02 |
| H02 | Live Trip Map | Real route, current location, visited photo pins, next spot, route time/distance. | P08 / A01 |
| H03 | In-trip AI | Contextual replanning when tired, late, hungry, rainy, or ahead of schedule. | H02 |

### PLAN

| ID | Screen | Purpose | Primary next |
|---|---|---|---|
| P01 | Trip List | Upcoming, draft, completed trips. | P04 / P02 |
| P02 | AI Trip Builder | Natural-language trip input plus destination, dates, companions, interests, pace. | P03 |
| P03 | AI Generating | Explainable itinerary generation state. | P04 |
| P04 | Itinerary | Day-by-day plan. Main planning surface. | P05 / P06 / B01 |
| P05 | Day Editor | Reorder, skip, add, change time, lock items. | P04 |
| P06 | Trip Map | Map representation of itinerary before travel. | P08 |
| P07 | Discover | Search/browse places; saved places live as a filter/state here. | P08 |
| P08 | Spot Detail | Photo-first place page: content + stamp + nearby + bookable offers. | H02 / B01 |

### BOOKING / AFFILIATE

| ID | Screen | Purpose | Primary next |
|---|---|---|---|
| B01 | Booking Offers | Contextual hotel/activity/restaurant/transport offers for a TripItem or Place. | B02 |
| B02 | Offer Detail | Price, provider, conditions, expected reward, cancellation notes. | B03 |
| B03 | Provider Bridge | Handoff to affiliate/provider flow while preserving ATTA trip state. | B04 |
| B04 | Booking Complete | Confirm booking receipt and show JASMY as **獲得予定** until approval. | P04 / H01 |

Booking is never a standalone marketplace tab. Offers appear in the itinerary and Spot Detail where they are contextually useful.

### ATTA! / STAMP

| ID | Screen | Purpose | Primary next |
|---|---|---|---|
| A01 | Approaching | Proximity state and pre-arrival feedback. | A02 |
| A02 | Arrival Verification | GPS accuracy + geofence + dwell verification. | A03 |
| A03 | Stamp GET | Peak delight moment. Earned Place/Trip/Booking/Walk/Mission/Limited stamp. | A04 / H02 |
| A04 | Memory / Mission Complete | Add photo/text/voice; mission completion is a variant of the same completion surface. | H02 / M03 |

### PASSPORT

| ID | Screen | Purpose | Primary next |
|---|---|---|---|
| M01 | Passport Overview | World map + visited countries/areas + recent trips + collection progress. | M02 / M04 |
| M02 | Trip History | Completed trips by map, date and story. | M03 |
| M03 | Trip Diary | AI-grounded travel story built only from actual trip evidence. | M05 |
| M04 | Stamp Book | Place / Trip / Booking / Walk / Mission / Limited collections. | Stamp detail sheet |
| M05 | Public Travel Story | Browser-readable share page without login. | External share |

### ACCOUNT

| ID | Screen | Purpose | Primary next |
|---|---|---|---|
| U01 | My Page | Profile, stats, privacy, connected services. | U02 |
| U02 | Rewards & Bookings | JASMY balance, reward ledger, pending rewards, booking history. | Reward/booking detail sheet |

Total: **26 core screens**

---

## 4. Supporting overlays and system flows

These are not counted in the 26 because they are sheets, native flows, transient states or advanced settings:

- Login / signup / anonymous account claim
- Foreground location education
- OS location permission
- Background location education
- Notification permission
- Native Share Sheet
- Saved Place quick action
- Stamp Detail sheet
- Reward Detail sheet
- Booking Detail sheet
- Wallet / blockchain advanced information
- Delete / undo / destructive confirmation
- Offline / reconnect
- Upload retry
- AI failure / retry / cancel
- Booking cancellation / reversed reward
- External navigation provider selector

---

## 5. Golden Path v2

```text
H01 Home
  -> P02 AI Trip Builder
  -> P03 AI Generating
  -> P04 Itinerary
  -> [B01 Offers -> B02 -> B03 -> B04] optional
  -> H01 Upcoming Trip
  -> H02 Live Trip Map
  -> P08 Spot Detail
  -> A01 Approaching
  -> A02 Arrival Verification
  -> A03 Stamp GET
  -> A04 Memory
  -> H02 Live Trip Map
  -> ...repeat...
  -> Trip Complete
  -> M03 Trip Diary
  -> M01 Passport
  -> M05 Public Travel Story
```

Reward events happen in parallel and do not interrupt the travel flow.

---

## 6. Core domain model

```text
User
├─ Trip
│  ├─ TripDay
│  │  └─ TripItem
│  │     ├─ Place
│  │     └─ BookingOffer
│  ├─ RouteLeg
│  ├─ Booking
│  ├─ Visit
│  ├─ EarnedStamp
│  ├─ Memory
│  └─ Diary
├─ SavedPlace
├─ Passport
│  └─ EarnedStamp
├─ RewardAccount
│  └─ RewardEvent
└─ EmbeddedWallet
```

### Place is the central content-commerce object

```text
Place
├─ location / geofence
├─ category
├─ opening_hours
├─ images
├─ editorial + AI description
├─ nearby places
├─ stamp definition
└─ booking offers
```

A Spot Detail page is therefore:

**Content + Commerce + Stamp**

---

## 7. Trip state machine

```text
DRAFT
  -> PLANNED
  -> ACTIVE
  -> COMPLETED
  -> ARCHIVED
```

Trip completion and diary generation are separate operations. Diary failure must never roll back Trip completion.

### TripItem state

```text
PLANNED
  -> APPROACHING
  -> VISITED
  -> STAMPED
```

Alternative:

```text
PLANNED -> SKIPPED
```

---

## 8. Booking architecture

ATTA! normalizes partner inventory into a single internal object.

```text
BookingOffer
- id
- provider
- type: HOTEL | ACTIVITY | RESTAURANT | TRANSPORT | RENTAL_CAR
- place_id / trip_item_id
- title
- price
- currency
- availability
- affiliate_url / deeplink
- affiliate_id
- expected_reward_jasmy
- terms
```

Partner connectors sit behind an Offer Aggregator.

```text
ATTA!
  -> Offer Aggregator
     -> Hotel partners
     -> Activity partners
     -> Restaurant partners
     -> Transport partners
     -> Rental car partners
```

ATTA! UI must never expose provider fragmentation unless required for booking.

---

## 9. Reward architecture

The user sees **ATTA! Rewards** and JASMY amounts, not blockchain mechanics.

### Reward sources

```text
VISIT
BOOKING
WALK
MISSION
QUIZ
SPONSOR
```

### RewardEvent

```text
RewardEvent
- id
- user_id
- source_type
- source_id
- amount_jasmy
- status
- created_at
- approved_at
- settled_at
- reversed_at
```

Statuses:

```text
PENDING -> APPROVED -> SETTLED
                    -> REVERSED
```

Booking rewards remain **獲得予定** until affiliate confirmation.

### Settlement

Do not write every reward event directly on-chain.

```text
RewardEvent
  -> Reward Ledger
  -> Batch Settlement
  -> JasmyChain
  -> User Smart Account
```

Suggested settlement triggers:

- Trip completion
- Daily batch
- Minimum reward threshold

The product layer remains independent from settlement cadence.

---

## 10. Wallet abstraction

Normal users should not need to understand:

- wallet address
- seed phrase
- gas
- bridge
- chain transaction
- network switching

Default experience:

```text
Apple / Google / Email
  -> Embedded account
  -> Smart account
  -> JasmyChain wallet
```

User-visible:

```text
ATTA! Rewards
3,482 JASMY
```

Advanced wallet/network details live behind My Page settings only.

---

## 11. Stamp system

Supported stamp types:

```text
PLACE
TRIP
BOOKING
WALK
MISSION
LIMITED
```

Sponsorship is metadata, not a separate type:

```text
sponsor_id
campaign_id
```

Examples:

- PLACE: 竹林を歩こう
- TRIP: KYOTO EXPLORER
- BOOKING: FIRST STAY
- WALK: WALK KYOTO 10K
- MISSION: FUSHIMI MASTER
- LIMITED: KYOTO AUTUMN 2026

---

## 12. Campaign architecture

```text
Campaign
- sponsor_id
- title
- start_at
- end_at
- area
- mission_definition
- stamp_definition
- reward_budget
- reward_rule
```

Campaigns must still feel like travel discovery, not banner advertising.

---

## 13. Arrival and fraud controls

A reward-bearing visit must be more than a raw GPS point.

Initial production rule set:

```text
geofence radius
+ GPS accuracy
+ dwell time
+ device integrity
+ velocity / impossible-travel check
+ duplicate reward check
+ trip / place eligibility
```

Initial UX defaults:

- radius: ~150m
- preferred GPS accuracy: <=50m
- dwell: ~20s

These are configurable server-side, not hard-coded product truths.

---

## 14. AI Trip Engine

Do not let the LLM invent the itinerary directly from scratch.

```text
User request
  -> Intent parser
  -> Place candidate retrieval
  -> Hours / distance / travel time / suitability
  -> Route optimizer
  -> Schedule builder
  -> LLM narrative + explanation
```

Optimization signals:

- travel time
- opening hours
- user interests
- pace
- party composition
- weather
- popularity
- booking availability
- accessibility
- reward availability

**Reward is a weak signal.** A higher reward must never make an objectively worse itinerary recommendation win.

---

## 15. Design guardrails — LOCKED

The approved reference screens are the visual source of truth.

### Home
**Map First**

- realistic satellite map
- travel route
- circular photo pins
- white route line
- white cards
- dark navy map surface
- minimal text on map
- stamp and movement cards below

### Plan
**AI First**

- trip creation must feel faster than manual planning
- large photography
- clear day timeline
- map / list switch
- drag/reorder interactions
- booking integrated inside itinerary

### Spot
**Photo First**

- large real photography
- map context above/behind
- place title + location
- useful editorial text
- nearby visual cards
- booking offers after core place content
- stamp visible but not visually louder than the place

### Passport
**Story First**

- globe/world map
- travel coverage
- visited regions
- trip history
- collection progress
- emotional, not financial

### Rewards
**Reward Last**

- no point-farm dashboard on Home
- no crypto terminology in primary flows
- JASMY is shown as a benefit of real travel behavior
- reward amount may appear inline on booking/stamp results
- balance belongs primarily in My Page

### Fixed visual language

- realistic satellite maps
- large destination photography
- white floating cards
- ATTA navy
- ATTA pink/red
- handwritten ATTA! logo
- subtle travel/passport motifs
- restrained shadows and rounded corners
- no generic SaaS dashboards
- no abstract pastel gradients as primary travel imagery
- no blockchain visual motifs in consumer-facing screens

---

## 16. Information architecture principle

ATTA! should not feel like four apps stitched together.

```text
AI planning
booking
stamp rally
JASMY rewards
```

must all resolve into the same object:

```text
TRIP
```

The Trip is the primary product container before, during and after travel.

---

## 17. Technical service boundaries

Logical domains:

```text
Mobile / Web Client
       |
       v
API / BFF
       |
       +-- Trip Service
       +-- Place Service
       +-- Booking Service
       +-- Visit / Location Service
       +-- Stamp Service
       +-- Reward Service
       +-- Passport / Story Service
       +-- User / Identity Service
       |
       +-- PostgreSQL + PostGIS
       +-- Object Storage
       +-- Mapbox
       +-- Booking/Affiliate Partners
       +-- JasmyChain Settlement
```

Start as a modular monolith unless scale forces independent services. Preserve these domain boundaries in code and schema.

---

## 18. Admin console

Required operational domains:

- Places
- Trips/support lookup
- Stamp definitions
- Campaigns
- Sponsors
- Affiliate offers
- Booking conversions
- Reward events
- Settlement batches
- Fraud review
- Users
- Content moderation / public stories

Without Admin, sponsored stamp campaigns and reward operations will not scale.

---

## 19. Primary business model

1. **Affiliate revenue**
2. **Sponsored campaigns / tourism partnerships**
3. **Premium subscription**

Reward economics are funded from campaign/affiliate economics; reward distribution is not the product's only monetization model.

---

## 20. Product KPIs

Planning:
- Trip creation rate
- AI itinerary completion rate
- itinerary confirm rate
- time-to-confirmed-trip

Travel:
- real-world activation rate
- first ATTA! rate
- stamps per active trip
- memory add rate
- trip completion rate

Commerce:
- booking offer CTR
- booking conversion
- affiliate revenue / active trip
- reward cost / conversion

Retention:
- Passport revisit rate
- second trip creation
- shared story open rate

---

## 21. Implementation order

### Phase 1 — Architecture-aligned MVP
- H01/H02
- P02/P03/P04/P08
- A01-A04
- M01/M03/M04
- U01
- Mapbox + Places data
- account + cloud persistence

### Phase 2 — Commerce
- B01-B04
- U02
- affiliate tracking
- Reward Ledger
- pending/approved/reversed reward states

### Phase 3 — JasmyChain
- embedded wallet
- gas sponsorship
- batch settlement
- reward history + transaction references

### Phase 4 — Growth
- collaboration
- sponsored missions
- campaign admin
- walking stamps
- public travel stories
- premium features

---

## 22. Non-negotiable product rules

1. The map, trip and place are more visually important than rewards.
2. Booking is embedded in itinerary and place context, not a marketplace tab.
3. A user can enjoy ATTA! without knowing what blockchain is.
4. Real travel evidence is required for travel rewards.
5. AI diary content must be grounded in actual trip evidence.
6. Reward availability must not distort itinerary quality.
7. The approved reference-screen visual language is the source of truth.
8. Bottom navigation is fixed: **ホーム / プラン / ＋ / パスポート / マイページ**.
9. The core loop is fixed: **PLAN -> BOOK -> TRAVEL -> ATTA! -> EARN -> REMEMBER**.
10. Future features must map to an existing domain before a new top-level navigation concept is introduced.
