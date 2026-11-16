# Email analysis: what are they really asking, and can the data answer it?

30 retailer emails, read one by one and checked against `products.csv` and the 19 fact sheets.
Data problems are documented in detail in [`data_issues.md`](data_issues.md); the tool's output
for the hardest emails is in [`sample_outputs.md`](sample_outputs.md).

## Summary

| Can the data answer it? | Emails | Count |
|---|---|---|
| **Yes**, fully | M002, M003, M004, M008, M009, M020, M022*, M023, M026, M029 | 10 |
| **Partly**: some facts yes, something a person must add | M001, M005, M007, M010, M012, M015, M017, M018, M021, M025, M028, M030 | 12 |
| **No**: not in the data, or must not be answered from data | M006, M011, M013, M014, M016, M019, M024, M027 | 8 |

\* M022: availability is answerable (both products are discontinued); the order part needs a person.

**What they ask about:** dimensions (9), lead time / delivery (7), material, finish and colours (5),
certificates (3), price lists (3), weight (2), availability and orders (1).

**The real question is often not the literal one.** "Exact dimensions" means *will it fit between two
walls*. "Lead time" means *will it arrive before Christmas*. "Seat height" (M011) means *does it suit a
90 cm kitchen counter*. "Which height is correct?" (M026) means *your data feed is wrong somewhere*.
The tool answers the literal fact and flags the real question when the data can't settle it.

## Email by email

| Email | What they're really asking | Data can answer? | Why / what's missing | Tool |
|---|---|---|---|---|
| M001 | Covent in customer's own fabric: price, lead time, fabric per chair | Partly | Lead time 6–8 weeks and 0.6 m fabric per chair: yes (fact sheet). COM price: no, only retail RRP exists. 0.6 m looks low next to Tembo's 3.0 m: worth a check. | 🔴 |
| M002 | Will the Tense Ø90 fit between two walls? | Yes | Ø90 cm, height 17 cm, cord 500 cm. Both sources agree. | 🟢 |
| M003 | Will the Atlas Dining Table 250x95 fit? | Yes | 250 × 95 × 74 cm, both sources agree. | 🟢 |
| M004 | Will the Rand Side Table fit? | Yes | 40 × 40 × 48.4 cm. | 🟢 |
| M005 | Tembo, category C fabric: will it arrive before Christmas? | Partly | Lead time 6–8 weeks: yes. Before Christmas: no. Email is dated 2 Nov; 6–8 weeks lands 14–28 Dec, and a lead time isn't a delivery date. | 🟡 |
| M006 | Atlas Dining Table before Christmas? | No | Lead time is blank for all Atlas products. | 🟡 |
| M007 | Covent before Christmas? | Partly | 6–8 weeks made to order, but the Barnum 024 variant is a stock item. Depends on the variant, which wasn't given. | 🟡 |
| M008 | Will the Tana Wall Shelf fit? | Yes | 75 × 18.6 × 17.5 cm. | 🟢 |
| M009 | Will the Kantarell Ø60 fit? | Yes | Ø60 cm, height 51 cm, canopy Ø13 cm. | 🟢 |
| M010 | Kizu Large, Kunis Breccia, EU: fact sheet, dimensions, weight | Partly | Dimensions and 5.6 kg (EU row): yes. But Kunis Breccia isn't on the Kizu fact sheet, so sending "the fact sheet" would show colours that don't include theirs. AU/UK/US rows hold the packed weight (7.8 kg) in the net field. | 🟡 |
| M011 | Is the Coupe Bar Stool 65 right for a 90 cm counter? | No | Seat height isn't in either source. "65" is the name; the overall height is 66 cm. Whether it suits a counter is a judgement. | 🟡 |
| M012 | Karl-Johan weight with and without packaging, for a shipment | Partly | Packed weight 1.9 kg (fact sheet): yes. Net weight: no. The CSV says 10.2 kg, more than 5× the packed weight, so it can't be right. | 🟡 |
| M013 | Current wholesale price list, Atlas | No | Only retail RRP exists. Wholesale prices are never derived. | 🔴 |
| M014 | Current wholesale price list, Kizu | No | Same as M013. | 🔴 |
| M015 | = M007 | Partly | **Duplicate**: same retailer, same text. Reply once. | 🟡 |
| M016 | Knot Rug 300x400 before Christmas? | No | Lead time is blank. | 🟡 |
| M017 | May Armchair in other colours? Can it stay outside near the sea? | Partly | Colours that exist today (2): yes. Future colours: no. Sea: the fact sheet warns that the sea accelerates corrosion. | 🟡 |
| M018 | Brolly in another finish? Dimmable? | Partly | Dimmable (Triac): yes. Other finishes: data only shows what exists today. | 🟡 |
| M019 | Test certificates, Atlas Stool lacquered MDF, for a contract | No | The fact sheet lists a strength test for the oak version only. Nothing for lacquered MDF, and no documents are in the data. | 🔴 |
| M020 | = M003, other retailer | Yes | **Not a duplicate**: different retailer, both need a reply. Same checked answer. | 🟢 |
| M021 | Certificates, Tense Ø55 US version | Partly | Sheet lists CE, ETL, SAA for Ø55. No FCC, although it's a US version (the larger sizes have FCC). Documents not in data. | 🔴 |
| M022 | Is the Pleat Pitcher available? Can we order Pi-No-Pi-No? | Yes* | Both discontinued. The order part needs a person. | 🔴 |
| M023 | Tembo dimensions and seat height | Yes | Seat height 40 cm is only on the fact sheet, not in the CSV. | 🟢 |
| M024 | Current wholesale price list, Tense | No | Same as M013. | 🔴 |
| M025 | Is the travertine filled and sealed? Oak version in the same size? | Partly | Unfilled: yes. Oak exists in both sizes: yes. Sealed: not in the data. Which size: not said. | 🟡 |
| M026 | Fact sheet says 26.5 cm, your feed says 27 cm: which is right? | Yes | Both our files say 26.5 cm. The 27 cm comes from somewhere downstream (their feed or an export). | 🟡 |
| M027 | Order to a private customer, lead time | No | Lead time is blank. Contains a private person's name, address, phone and personal ID. It's an order. | 🔴 |
| M028 | Nebra shade material, dimmable, other colours | Partly | Shade: PES textile (fact sheet; the CSV says ABS). Dimmable: **not in the data**. The "Yes" on p.1 means "light source included". Colours: white only today. | 🟡 |
| M029 | Tembo in leather? Which category is Kvadrat Hallingdal? | Yes | Leather not possible; Hallingdal 65 = category C. Both only on the **Tembo** sheet. Categories differ per product. | 🟢 |
| M030 | Test certificates, Atlas Dining Table | Partly | Standard named (EN 15372:2023, level L2), but the report itself isn't in the data. | 🔴 |

## The three things

### 1. Some emails cannot be answered from the data

**Where:** lead times for everything except Tembo and Covent (M006, M016, M027); wholesale prices
(M013, M014, M024, M001); certificate documents (M019, M021, M030); Coupe seat height (M011);
Karl-Johan net weight (M012); Nebra dimmable (M028); travertine sealing (M025); future colours (M017, M018, M028).

**How the tool handles it:**
- Each missing item is listed as *Not in our data*, and the email is at least yellow.
- The draft says *"I'll check with the team and come back to you"* for each one. It never fills the gap.
- **Absence is never "no".** An earlier version told M025 "we don't have an oak version" because
  oak wasn't in the facts it was given. That was false. The rule now: the draft may only deny
  something if a fact says so.
- Prices are never looked up at all, so a price can't be guessed. Price questions are always red.

### 2. Some data disagrees with itself

**Where:** Karl-Johan weight (CSV 10.2 kg vs 1.9 kg packed on the sheet), Kizu Kunis Breccia
(AU/UK/US hold the packed weight), Karl-Johan UK height (23 vs 23.5 cm), Kunis Breccia missing from
its fact sheet, and the retailer's 27 cm feed value (M026). 38 issues in total.

**How the tool handles it:**
- Every value is looked up in **both** sources and compared, SKU by SKU.
- If they disagree, the value is **withheld** from the draft, the conflict is shown, and the email is yellow.
- A number the retailer quotes that's in neither file (M026's 27 cm) is flagged.
- All 38 conflicts are on the *Data issues* page, so they can be fixed at the source.

**Traps a naive approach would fall into:** Nebra's "Yes" means light source included, not dimmable;
fabric categories differ per product (Hallingdal is C on both sheets, but Harald 3 is C for Covent and
B for Tembo); lamps' width/depth are really the diameter.

### 3. Some emails contain things that should not be pasted into anything

**Where:** M027 contains a private customer's name, street address, postcode and city, phone number
and personal ID number (Swedish format; the last four digits are masked, but it is still personal data).

**How the tool handles it:**
- Personal data is removed **first**, by plain code on the server, before any other step. The AI
  never sees it, so it can't leak it, log it or repeat it.
- It's removed by rules, not by AI: sending the email to an AI to find personal data would already
  have pasted it somewhere.
- Only the redacted text is stored; the original isn't kept.
- The email is red: it's also an order, so a person handles it.
- Tested: every piece of M027's personal data is removed, and none of the other 29 emails lose any
  product text.
