# /brand — the delivered brand assets

**These are runtime inputs, and that is why they are not in `/docs/reference/`.**

The Brand Guide is a human document: a doctrine scan asserts that nothing under
`server/src` or `web/src` reads `/docs/reference/`, because a document parsed at runtime
is a second authority that goes stale between revisions. These files are the opposite —
the render must read them, and reading them is the whole point.

```
HouseSteady_Brand-Assets.zip   the delivered archive, verbatim, byte-for-byte
assets/                        extracted from it, unmodified
assets.json                    checksums of both, plus the palette and mark rules
```

## Why the checksums exist

**Brand Guide §04, first line:** *"Redraw, retype, or approximate the mark — the vial and
geometry reproduce from asset files only."*

That is a rule nobody can check by looking at a rendered page. A mark that is 3% off is a
mark that looks right. So `assets.json` records the sha256 of the delivered zip and of
every file extracted from it, and a doctrine scan asserts three things:

1. every extracted file still matches its recorded hash — **nothing has been edited in
   place**, which is how an approximation gets in without anyone deciding to make one;
2. no render path draws an `<svg>` mark of its own — **the vector master is inlined from
   `assets/svg/housesteady-mark.svg` or there is no mark**;
3. the palette in the render's own tokens matches `assets.json` — **navy is `#15223B`
   everywhere or the scan fails.**

**An approximated mark is the same class of failure as an approximated name.** Both are
plausible output that reads as correct, and both are invisible to any test that checks
whether something rendered.

## The palette and type rules are transcribed, not parsed

`assets.json` carries five hex values and the type rules, copied from Brand Guide §03. They
are **transcribed on purpose**: parsing CSS out of an HTML document at runtime would put
the guide back in the position the scan exists to prevent, and five constants that change
once a decade do not need a parser.

**If the two ever disagree, the guide wins and this file is the bug.** That direction is
the whole reason it is written down here rather than assumed.

## What is not here

**Wordmark vector outlines.** §05 of the guide says they *"land with the website build
pass."* The zip carries the wordmark as PNG only. So a render needing the wordmark at
arbitrary size has a real gap, and the honest options are the PNG at a fixed size or the
lockup PNG — never Fraunces set live, which would be *retyping the wordmark* and is §04's
second prohibition.
