# 15 — The Daily Mulligan (Boss Unlock, Daily 9-Hole Course)

- **ID:** 15-daily-mulligan
- **Type:** Functional + persistence + generation + UI
- **References:** `04-levels-and-wind.md` (9-hole generation); `08-campaign-and-menus.md` (main menu, storage, course rows); `14-dimension-y-boss-prototype-plan.md` (final boss)

> Defeating the final Dimension-Y boss unlocks a special ninth course, **The Daily Mulligan**. It is a 9-hole course whose holes regenerate every local calendar day. It is separate from the staged campaign (`STAGES`) and never changes staged unlocks or story cutscenes.

## 1. Boss unlock

- Persist final-boss completion in `BOSS_DEFEATED_KEY="golfVectorField.boss.v1"`: `{version:1, defeated:true, defeatedAt}`. Set it only when the boss death sequence actually starts (`startBossDeath`), i.e. boss lives reach 0. Game Over, quitting, or leaving the fight must not set it.
- The flag survives normal run clears (`clearProgress`), but a full campaign reseed (`localStorage.clear()` / new seed) removes it and relocks the daily course.
- Once defeated, the main menu shows a playable `The Daily Mulligan` row below the Dimension-Y row. It is hidden until the boss has been defeated. The row uses the normal green course button and shows `9 holes` plus today's record.

## 2. Daily course identity & generation

- Separate storage key `DAILY_COURSE_KEY="golfVectorField.daily.v1"`: `{version:1, course}`. Never stored in `COURSES_KEY` and never added to `STAGES`.
- Date key is the local calendar date `YYYY-MM-DD`. Course id is `daily-<date>`; name is exactly `The Daily Mulligan`; `holeCount:9`; `daily:true`; `dailyDate:<date>`.
- Seed is deterministic from the date: `deriveCourseSeed("daily-mulligan:<date>", 9)`. Holes use the normal 9-hole generator, so the same date produces identical holes and the next local date produces a fresh course.
- On init/menu render, if the boss is defeated: load the stored daily course; if it is missing or its `dailyDate` is not today, generate and save a new one. If the boss is not defeated, no daily course is loaded.
- A full campaign reseed also clears the in-memory daily course and the boss flag.

## 3. Play & persistence

- `findCourseById` resolves the daily course by id so the normal course flow works: starting-item picker, run save/resume, hole progression, rewards, and daily `bestTotal`.
- The daily record is stored with the daily course and resets when a new day regenerates the course. It does not write to staged course records, shop milestones, campaign unlocks, or story cutscene flags.
- Because the id contains the date, a run saved yesterday no longer matches today's daily course and is not restorable; today's daily run is.
- Menu signature includes the daily id/date and record so the row refreshes when the boss unlock happens or the date rolls over.

## Acceptance

- [ ] Defeating the Dimension-Y boss writes `golfVectorField.boss.v1` and immediately makes `The Daily Mulligan` available; losing or leaving the boss fight does not.
- [ ] Before the boss is defeated, no daily row or daily storage is created.
- [ ] The daily row is a normal playable 9-hole course using the standard starting-item/course flow.
- [ ] Same local date → identical holes; next local date → different holes and a reset daily record.
- [ ] The daily course never appears in `COURSES_KEY`/`STAGES`, never changes staged unlocking, and never triggers `end-9-hole`/`end-18-hole` story cutscenes.
- [ ] Reloading mid-daily-run resumes it the same day; a new day invalidates yesterday's daily save.
- [ ] A full campaign reseed relocks the daily course.

## File paths

- `src/courses.js:1` (`DAILY_COURSE_KEY`, `DAILY_COURSE_NAME`, `getDailyDateKey`, `dailyCourseIdForDate`, `generateDailyCourse`, `loadDailyCourse`, `saveDailyCourse`, `getOrCreateDailyCourse`)
- `src/main.js:1` (`BOSS_DEFEATED_KEY`, `isBossDefeated`, `ensureDailyCourse`, `markBossDefeated`, daily row in `renderCourseList`, daily record in `maybeUpdateHighScore`, bridge `onBossDefeated`)
- `src/boss.js:1` (`startBossDeath` calls the bridge `onBossDefeated`)
