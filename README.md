# Odyssey 1.6

A short, bilingual (English / 中文) wellbeing journey for international students: three chapters of about ten minutes each, a lighthouse hub, and a guide for staff.

Based on the ODYSSEY concept by Matthew Lei (University of Auckland Bachelor of Design capstone, 2023). Te Whare Tapa Whā is a Māori model of health by Sir Mason Durie.

**Status:** learning prototype. Not therapy, screening or diagnosis. Content review by counselling staff and Māori advisers is still needed before wider use.

## What's in the folder

| File | Purpose |
|---|---|
| `index.html` | Main screen: interactive island map with a detail panel for each of the five stages, and "How help works here" |
| `chapter1.html` | Where am I? · Bridge of Strengths |
| `chapter2.html` | Who am I? · Cave of Reflections |
| `chapter3.html` | Who are they? · Valley of Light |
| `advisers.html` | Guide for advisers and teachers, with a 45-minute session plan |
| `about.html` | Privacy statement and accessibility statement |
| `setup.html` | Campus setup form for staff |
| `campus-config.js` | Your campus's support services (blank until you fill it in) |
| `odyssey-fx.js` | Music, sound effects, particles and the traveller drawing |
| `odyssey-island.js`, `three.min.js` | The 3D island on the main screen (three.js, MIT License) |
| `manifest.webmanifest`, `sw.js`, `icon-*.png` | Install to home screen and offline use |

Keep every file in the same folder.

## Deploy (GitHub Pages)

1. Upload the whole `odyssey` folder to a GitHub Pages repository.
2. Open `https://<you>.github.io/<repo>/odyssey/`.
3. On a phone, use "Add to Home Screen". After the first visit it works offline.

Opening `index.html` straight from a computer also works for testing. Offline install needs https.

## Set it up for your campus

1. Open `setup.html` and fill in your counselling, urgent, health centre and international support details.
2. Use **Preview on this device** to check how the support panels look.
3. Tick "All details checked", then **Copy** or **Download** the generated file.
4. Replace `campus-config.js` in the folder with it.
5. Call each number and open each link once to confirm them. Re-check every semester.

## Privacy and accessibility

- No accounts, analytics, cookies or third-party requests. Fonts, music and the 3D library are all in the folder.
- Music is off until the student turns it on. The 3D island falls back to a flat map without WebGL or with data saver on, and all motion stops under reduced-motion settings.
- Only language choice and chapter progress are kept, in the student's own browser.
- Reflections and plans are never saved.
- Built to WCAG 2.2 AA: colour contrast checked, keyboard support, 24 px minimum targets, reduced motion, Chinese text tagged for screen readers. Known limits are listed in `about.html`.

## Updating

Edit the sources in `src/` and run `python3 build.py`. Bump `VERSION` in `build.py` so installed copies refresh.

## Before student use

- Counselling team reviews the balanced replies, safety wording and campus details.
- Māori advisers review the Te Whare Tapa Whā framing in Chapter 1.
- Helpline details confirmed current: 1737 (free call or text, 24/7), Asian Family Services 0800 862 342, Lifeline 0800 543 354 (7am to midnight), 111.
- Ethics approval if you evaluate it formally.
