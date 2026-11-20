# Prune design notes

Who uses it: Reddit users scrolling the feed on a phone, a few minutes a day. Not developers. So: one tree, one main button, no settings.

Look: a potting bench. Warm paper background, ink text, moss foliage, terracotta pot. The target shape is hatched like a pencil guide on a plan, so it reads as "aim here" without a legend.

## Tokens
| Token | Value | Use |
|---|---|---|
| paper | #F4EFE6 | page |
| paper-2 | #EBE3D4 | side panel |
| ink | #1F1B16 | text, primary button |
| ink-2 | #5A5047 | secondary text |
| moss | #3F6B2E | fill meter, target edge, your bar |
| clay | #B4532A | pot, snips, spill meter, branch about to be cut |
| bud | #B9D48F | buds |

Radius: 6px (small), 10px (buttons, cards), pill (chips).

## Type
- Display: Young Serif (OFL). Wordmark 26px, score 72px, labels 19px.
- Body: IBM Plex Sans 15px. Heading-to-body ratio is at least 1.25.
- Numbers use tabular figures.

## Rules
- One primary button per screen (Grow / Post my result).
- Foliage is drawn at the exact radius the scorer uses. What you see is what is scored.
- Buds carry a number, not only a size, so the hint works without color.
- Motion: branches draw in, foliage pops, buds spring. All of it turns off with prefers-reduced-motion.
- Under 860px wide the panel moves below the tree and the live meter hides.
