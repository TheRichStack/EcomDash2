# Creative Page Spec

Status: locked for v1

## Route

`/dashboard/paid-media/creative`

Sidebar group:

- `Paid Media`
  - `All`
  - `Meta`
  - `Google`
  - `TikTok`
  - `Creative`

## Page job

Show which creatives are spending, converting, and generating revenue, with enough filtering to compare assets across platforms.

## Keep from current app

- creative-level reporting
- platform filter
- performance metrics tied to spend and revenue
- grid and table view switch
- cards-per-row control for grid view
- creative metrics customizer
- current default card metrics

## Remove from current app

- narrative summary cards
- diagnose sections
- any UI that hides the actual creative table behind other layers
- estimated impact/day from creative cards

## Proposed structure

1. KPI strip
2. Filter bar
3. Grid / table view switch
4. Creative metrics customizer
5. Creative performance surface

## Default KPI strip

- spend
- purchases
- CPA
- ROAS
- thumbstop rate
- hold rate

These same default metrics should drive the creative card presentation.

## View behavior

Preserve the current creative workflow in v1:

- grid and table are both first-class views
- cards-per-row slider stays in grid view
- users can customize which metrics appear on the creative cards
- the page should keep the current functional behavior while being visually rebuilt for EcomDash2
- one combined creative view with platform filters

## Video playback

Video creatives should support inline playback again.

Required behavior:

- video thumbnails show a play overlay
- clicking the overlay plays the creative inline in the card
- playback uses the underlying creative video URL from Meta or TikTok when available
- image creatives keep the normal static preview behavior

Implementation note:

- preserve the current creative data shape that already includes `thumbnail_url` and `video_url`
- do not block the page if a given creative lacks a playable video URL; fall back cleanly to the thumbnail or image preview

## Rebuild direction

Same principle as Paid Media:

- preserve the working feature set
- rebuild the UI in native shadcn composition
- remove legacy anomaly-first framing
- do not copy old layout code wholesale

Locked defaults:

- grid and table switch stay in v1
- cards-per-row slider stays in v1
- creative metrics customizer stays in v1
- default creative metrics are spend, purchases, CPA, ROAS, thumbstop rate, and hold rate
- estimated impact/day is removed from the creative cards
- creative stays one combined cross-platform view with platform filters
- video creatives support inline playback from Meta or TikTok sources when a playable URL exists
- no separate creative trend chart in v1
