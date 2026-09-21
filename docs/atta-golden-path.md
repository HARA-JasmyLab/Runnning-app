# ATTA! Golden Path v1.0

## Product loop

```text
Plan → Travel → ATTA! → Remember → Share
```

ATTA!のMVPは、旅行計画そのものではなく、
**旅行前の面倒をAIで減らし、旅行中の発見がそのまま思い出になる**
一連の体験を検証する。

---

## Screen flow

| # | Screen | Primary action | Next |
|---|---|---|---|
| 01 | Home | AIに旅を考えてもらう | Create Trip |
| 02 | Create Trip | AIで旅をつくる | Generating |
| 03 | Generating | 自動完了 | Itinerary |
| 04 | Itinerary | この旅に決定 | Confirmed |
| 05 | Confirmed | ホームへ | Planned Home |
| 06 | Planned Home | 旅を開始 | Start Trip |
| 07 | Start Trip | 旅をはじめる | Location |
| 08 | Location | 位置情報を許可 | Live Map |
| 09 | Live Map | スポットを見る | Spot |
| 10 | Spot | ここへ行く | Live Map |
| 11 | Approaching | 到着判定 | Arrival |
| 12 | Arrival | 自動判定 | Stamp |
| 13 | Stamp | 写真を残す | Memory |
| 14 | Memory | 思い出に追加 | Updated Map |
| 15 | Updated Map | 旅を終了 | Finish |
| 16 | Finish | 旅を終了 | Diary |
| 17 | Diary | 旅をシェア | Share |
| 18 | Share | 公開ページ | Travel Story |

---

## Trip state

```text
NONE
→ DRAFT
→ PLANNED
→ ACTIVE
→ COMPLETED
```

MVP prototypeでは `localStorage` に状態を保存する。

---

## Spot state

```text
PLANNED
→ APPROACHING
→ VISITED
→ STAMPED
```

または

```text
PLANNED
→ SKIPPED
```

---

## AI responsibilities

AI対象:

- Trip itinerary generation
- Itinerary re-plan
- Spot description
- Memory caption suggestion
- Daily / trip diary

AI対象外:

- GPS
- Geofence
- Stamp eligibility
- Route storage
- Photo storage
- Permission handling

---

## Initial geofence rule

本番実装時の初期基準:

- Spot radius: 150m
- 推奨GPS Accuracy: 50m以内
- 短時間の滞在確認
- 1 Spotにつき1 Stamp
- 判定失敗時は再測位
- 手動強制取得はMVPでは設けない

現在のWeb prototypeでは「到着をシミュレート」でUXを確認する。

---

## Live location privacy

共有時:

- 現在地をリアルタイム公開しない
- ACTIVE tripの精密な現在地点を公開しない
- 自宅・ホテル等の正確な開始地点を公開対象にしない
- Shared Storyは訪問済みSpotと公開対象Memoryを中心にする

---

## Offline

旅行中の最低限の体験は通信断でも維持する。

将来:

- Trip itinerary cache
- Spot metadata cache
- Route points local queue
- Stamp eligibility local evaluation
- Reconnect時sync

AI再生成はonline時のみ。

---

## MVP analytics

```text
trip_create_started
trip_ai_generate
trip_ai_generated
trip_confirmed
trip_started
spot_viewed
navigation_started
spot_arrived
stamp_earned
memory_added
trip_completed
diary_generated
diary_edited
stampbook_viewed
share_started
share_completed
shared_story_opened
```

---

## Visual system

- Warm background: #FFF9F1
- ATTA Navy: #052D46
- ATTA Red: #F52B55
- AI Blue: #2679FF
- White photographic surfaces
- 18–26px rounded cards
- Large travel photography
- Map-first interaction
- Minimal game chrome
- Stamp animation is the peak delight moment

旅の「計画アプリ」ではなく、
**旅が進むほど地図と記憶が美しく育つアプリ**
として設計する。
