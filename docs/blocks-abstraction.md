# Blocks Abstraction — Design

## Problem

16 fixed card types = AI picks from a menu. Each type is a rigid template.
This limits expression: "title + description + image" covers 80% of output.

## Core Idea

A card is a container. Inside: an ordered list of **blocks** (elements).
AI composes freely — like writing HTML, but with a curated element palette.

```
<!--vt:card {"key":"dune","x":20,"y":10,"z":40,"w":30,"blocks":[
  {"type":"image","url":"...","caption":"Arrakis"},
  {"type":"heading","text":"Dune"},
  {"type":"text","text":"A world beyond imagination"},
  {"type":"tags","items":["Sci-Fi","Epic"]},
  {"type":"metric","value":"8.6","label":"IMDB"}
]}-->
```

## Block Elements (palette)

| Type | Props | Renders as |
|------|-------|------------|
| heading | text, level(1-3) | h1/h2/h3 |
| text | text | paragraph (markdown supported) |
| image | url, caption?, fit?(cover/contain) | responsive image |
| tags | items[] | pill row |
| metric | value, label, unit? | big number + label |
| list | items[], style?(bullet/number/todo) | list |
| quote | text, author?, source? | blockquote |
| code | code, language? | syntax-highlighted block |
| divider | — | horizontal rule |
| chart | chartType, items[], title? | bar/pie/line |
| table | columns[], rows[] | data table |
| diagram | code, title? | mermaid diagram |
| map | center, zoom, markers[], route? | interactive map |
| progress | value(0-100), label? | progress bar |
| embed | url, caption? | youtube/bilibili/etc |
| audio | title, artist?, album?, image?, duration? | audio player |
| spacer | size?(small/medium/large) | vertical space |

## Migration Path

1. Add `BlocksRenderer.vue` that renders blocks[]
2. In `BlockCard.vue`: if card.data.blocks exists → use BlocksRenderer
3. Otherwise → fall back to existing componentMap (backward compat)
4. Update parser to handle new format
5. Update system prompt
6. Old card types still work — just internally converted to blocks

## What This Enables

- AI can put an image INSIDE a metric card
- A quote card can have a photo of the person below
- A comparison can mix charts and text freely
- Profile = image + heading + text + tags (no special component needed)
- Truly custom layouts emerge from composition

## What Stays The Same

- Card positioning (x, y, z, w) — unchanged
- Card container (glass border, win-bar, drag) — unchanged
- Sketch system — unchanged
- Dock system — unchanged
- Timeline/navigation — unchanged
