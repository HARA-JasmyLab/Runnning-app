# ATTA! Production Screen Map v1.0

This document is the implementation-facing screen contract for Product Architecture v1.0.

## Global navigation

```text
[ホーム] [プラン] [＋] [パスポート] [マイページ]
```

- Home = current travel state
- Plan = create/edit/book
- + = AI Trip Builder
- Passport = history/stamps/stories
- My Page = account/rewards/bookings

---

## Primary journey

```text
H01 Home
 |
 +--> P02 AI Trip Builder
       |
       v
     P03 AI Generating
       |
       v
     P04 Itinerary
       | \
       |  +--> B01 Booking Offers -> B02 Offer Detail -> B03 Provider Bridge -> B04 Booking Complete
       |
       +--> P05 Day Editor
       |
       +--> P06 Trip Map -> P08 Spot Detail
       |
       +--> P08 Spot Detail
       |
       v
     H01 Upcoming

Travel day
H01 Upcoming
 |
 v
H02 Live Trip Map
 |
 +--> H03 In-trip AI
 |
 +--> P08 Spot Detail
 |
 v
A01 Approaching
 |
 v
A02 Arrival Verification
 |
 v
A03 Stamp GET
 |
 v
A04 Memory / Mission Complete
 |
 +--> H02 Live Trip Map
 |
 ...repeat...
 |
 v
M03 Trip Diary
 |
 +--> M01 Passport Overview
 |
 +--> M05 Public Travel Story
```

---

## Screen contracts

### H01 — Home
States:
- EMPTY
- UPCOMING
- ACTIVE
- RECENTLY_COMPLETED

Primary content:
- satellite map
- trip distance
- visited / upcoming photo pins
- latest stamp
- movement summary

Actions:
- no trip -> P02
- upcoming -> P04
- active -> H02
- recent trip -> M03

### H02 — Live Trip Map
Primary content:
- Mapbox route
- current location
- visited photo pins
- next destination
- ETA / distance
- ATTA! AI shortcut

Actions:
- spot -> P08
- replan -> H03
- navigation -> external Apple/Google Maps
- arrival -> A01

### H03 — In-trip AI
Presets:
- 遅れている
- 疲れた
- 雨
- お腹が空いた
- 時間が余った
- 別の場所に行きたい

Output:
- quantified itinerary change
- user accepts before Trip mutation

### P01 — Trip List
Sections:
- Draft
- Upcoming
- Completed

### P02 — AI Trip Builder
Required:
- destination
- dates

Optional:
- free text
- companions
- interests
- pace
- must-do places
- budget

### P03 — AI Generating
Stages:
- preference parse
- candidate retrieval
- opening-hours validation
- route optimization
- booking/stamp enrichment
- itinerary composition

Failure:
- retry
- return to builder
- keep user input

### P04 — Itinerary
Must support:
- Day tabs
- timeline
- map switch
- drag/reorder
- add/remove
- quick AI replan
- booking offer inline
- reward estimate secondary

### P05 — Day Editor
Functions:
- reorder
- time edit
- lock item
- skip
- replace
- add place
- change transport mode

### P06 — Trip Map
Pre-travel map:
- full itinerary
- day filter
- estimated route
- saved places
- bookable markers secondary

### P07 — Discover
Functions:
- text search
- category search
- map search
- AI recommendation
- save
- add to trip

### P08 — Spot Detail
Order of information:
1. photography
2. place identity
3. useful editorial description
4. tags
5. nearby
6. stamp
7. booking offers
8. reward

### B01 — Booking Offers
Types:
- HOTEL
- ACTIVITY
- RESTAURANT
- TRANSPORT
- RENTAL_CAR

Rules:
- context from TripItem / Place
- no marketplace-style global feed

### B02 — Offer Detail
Show:
- provider
- price
- conditions
- cancellation
- expected JASMY
- external booking disclosure

### B03 — Provider Bridge
Responsibilities:
- affiliate click tracking
- preserve Trip state
- deep-link / browser handoff
- return-to-ATTA route

### B04 — Booking Complete
Show:
- booking confirmation
- itinerary insertion
- reward = PENDING / 獲得予定

### A01 — Approaching
Show:
- proximity
- next stamp teaser
- no forced interaction

### A02 — Arrival Verification
Checks:
- geofence
- GPS accuracy
- dwell
- duplicate
- velocity / impossible travel

### A03 — Stamp GET
Purpose:
- peak delight moment

Show:
- stamp visual
- location
- category
- optional reward earned/pending

### A04 — Memory / Mission Complete
Inputs:
- photo
- video
- text
- voice to text
- AI caption

### M01 — Passport Overview
Visual priority:
- world/globe map
- travel coverage
- continents/regions
- recent trips
- stamp collection progress

### M02 — Trip History
Browse:
- map
- date
- country / city
- story thumbnail

### M03 — Trip Diary
Grounding:
- route
- visits
- memories
- stamps
- bookings

Never invent unobserved experiences.

### M04 — Stamp Book
Tabs:
- Place
- Trip
- Booking
- Walk
- Mission
- Limited

### M05 — Public Travel Story
Web-readable:
- no login required
- no live current location
- private endpoints redacted
- only explicitly shareable memories

### U01 — My Page
Show:
- profile
- trips
- countries
- stamps
- settings
- privacy
- connected services

### U02 — Rewards & Bookings
Show:
- JASMY balance
- pending
- approved
- settled
- reversed
- booking history

Blockchain details belong one level deeper.

---

## State-driven entry rules

```text
Trip = none        -> H01 EMPTY
Trip = DRAFT       -> P04
Trip = PLANNED     -> H01 UPCOMING
Trip = ACTIVE      -> H01 ACTIVE / H02
Trip = COMPLETED   -> M03 / M01
```

---

## Design hierarchy

```text
Home      = Map First
Plan      = AI First
Spot      = Photo First
Passport  = Story First
Rewards   = Last
```

If a new feature conflicts with this order, the feature should be redesigned instead of changing the hierarchy.

---

## Route ownership

Top-level routes:
- /home
- /plans
- /trip/:tripId
- /trip/:tripId/map
- /place/:placeId
- /passport
- /me

Nested/modal:
- booking offers
- booking detail
- rewards detail
- stamp detail
- in-trip AI
- permission education

Public web:
- /story/:shareId

---

## Implementation rule

Do not create a new top-level tab for:
- booking
- rewards
- campaigns
- wallet
- AI

Those capabilities must live inside the existing information architecture.
