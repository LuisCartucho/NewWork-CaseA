# Data issues: products.csv vs fact sheets (first pass)

How this was done: text extracted from all 19 PDFs with `pdftotext -layout` (no AI; the PDFs contain real text), then each fact sheet was read and compared to products.csv by hand. Page numbers refer to the PDF.

**Severity**
- **High**: would put a wrong number or a wrong promise in front of a retailer.
- **Medium**: makes the tool flag or skip something it could otherwise answer.
- **Low**: cosmetic; worth fixing in the PIM, no risk in a reply.

**Emails**: the emails where the issue actually comes up.

## A. Numbers that disagree, or are wrong

| # | Product | What's wrong | Evidence | Sev. | Emails |
|---|---|---|---|---|---|
| A1 | **Karl-Johan Table Lamp** (all 8 rows) | Weight in products.csv is **10.2 kg** (oak) / **11.55 kg** (marble). The fact sheet says **1.9 kg *including* packaging**. The CSV weight is 5× the packed weight, so it can't be right. The net weight isn't in either source. | csv 20310–20311US; fact sheet p.1 "Weight (incl. packaging) 1.9 kg" | High | M012 |
| A2 | Karl-Johan Table Lamp | Height: fact sheet **23.5 cm** (H 235 mm). csv: EU 23.5, **UK smoked oak 23**, and **blank** for 20310AU, 20310US, 20311AU, 20311UK, 20311US. | fact sheet p.1 | Medium | M012 |
| A3 | **Kizu Table Lamp Large, Kunis Breccia** | AU/UK/US rows say **7.8 kg**, EU says 5.6 kg like every other Large. **7.8 kg is the fact sheet's weight *incl. packaging***, so the AU/UK/US rows almost certainly hold the packed weight in the net-weight field. | csv 20415AU/UK/US; fact sheet p.1 "Weight (incl. packaging) 7.8 kg" | High | M010 |
| A4 | **Kizu Table Lamp Small, Kunis Breccia** | Same pattern: AU/UK/US **4.4 kg** = fact sheet weight incl. packaging; EU and all other Small rows 3 kg. | csv 20425AU/UK/US; fact sheet p.1 "4.4 kg" | High | — |
| A5 | Kizu (both sizes) | The net weight (5.6 / 3 kg) isn't on the fact sheet, so it can't be cross-checked. It only exists in the CSV. | — | Medium | M010 |
| A6 | **Coupe Bar Stool "65" / "75"** | The names say 65/75; the height is **66 / 76 cm** in *both* the CSV and the fact sheet (660 / 760 mm). Seat height isn't given anywhere, so "65" may be a nominal seat height. Don't state a seat height. | csv 44820–44811; fact sheet p.2 | High | M011 |
| A7 | **Tembo Lounge Chair**, weight 21 kg | The fact sheet prints "Weight: 21 kg" on the **packaging-dimensions** line, so it's unclear whether 21 kg is net or packed. The CSV treats it as net. | fact sheet p.2 | Medium | M023 |
| A8 | Tembo, variant F | Weight **blank**; material text differs from A–E ("Upholstery, steel corpus, moulded foam core, wooden feet", which matches the fact sheet wording exactly, while A–E say "Oak; Upholstered"). Do A–E have oak, or wooden feet? | csv 40101-F; fact sheet p.2 | Medium | — |
| A9 | Covent Club Chair, weight | CSV 11.2 kg; fact sheet only gives **20 kg incl. packaging**. Net weight can't be verified. | fact sheet p.1 | Low | — |
| A10 | **May Lounge Armchair**, packaging | Fact sheet: "**Each package includes two** May Lounge Armchairs"; 30 kg incl. packaging is for the 2-pack. The CSV has no pack size, so it's **unclear whether RRP 3,195 DKK is per chair or per pack**. | fact sheet p.1–2 | High (prices) | — |
| A11 | Atlas Coffee Table 82x82 height | CSV 26.5 cm = fact sheet 265 mm. **Both agree.** The retailer's "27 cm" doesn't come from either file; it probably comes from a rounded feed or export further downstream. | fact sheet p.2 | Medium | M026 |
| A13 | Pi-No-Pi-No | CSV `weight_kg` (1.3 / 0.9 / 0.8 / 0.3) equals the fact sheet's "Weight **incl. packaging**", the same mix-up as Kizu (A3) but across the whole product. | fact sheet p.2 | Low (discontinued) | — |
| A12 | Nebra Floor Lamp | `height_cm` = "148-175" (text in a number column; the code must handle ranges). Matches the fact sheet (1480–1750 mm, adjustable pole). | — | Low | M028 |

## B. Wrong or inconsistent labels and categories

| # | Product | What's wrong | Sev. |
|---|---|---|---|
| B1 | May Lounge Armchair | category **"Outdoor Table"**; the fact sheet says Lounge Armchair, Outdoor Furniture. | Medium |
| B2 | Covent 42220NEBA024 | category **"Dining Chair"**; siblings and fact sheet say "Lounge Chair". The fact sheet lists this SKU as the **stock item** (no lead time; the others are 6–8 weeks made to order). The fact sheet's "Colour/Variant: **Lana**" doesn't match "Barnum 024" either. | Medium |
| B3 | Kizu Large/Small Kunis Breccia EU | variant labels "Kunis Breccia, **Large**, EU" / "**Small**, EU" (size inside the variant; no other row does this). **No CN variant** for Kunis Breccia, while every other colour has CN. | Medium |
| B4 | Kizu (both sizes) | **Kunis Breccia isn't on either Kizu fact sheet** (only White, Black, Gris du Marais, Breccia Pernice, Rosso Levanto). A retailer asking for "the fact sheet for Kunis Breccia" gets a sheet that doesn't mention it. | High (M010) |
| B5 | **Tembo** SKUs | CSV: 40101-A…F. Fact sheet: **41000 = COM, 41001 = categories A–F (same number for all)**. The SKUs don't match at all, and the CSV has no COM row. | High |
| B6 | Tembo fabric categories | The fact sheet's item list goes A–F, but the fabric price-category table only goes **A–E** (no fabrics listed for F). | Medium |
| B7 | Coupe | `family` **empty**; `made_to_order` empty. | Low |
| B8 | Rand Side Table | `made_to_order` **empty**; family "Rand Tables". | Low |
| B9 | Tana Wall Shelf | `family` = **"New Works"** (should be Tana). | Low |
| B10 | Tembo | `made_to_order` empty, although it has a 6–8 week delivery time. | Low |
| B11 | Brolly | "Anodised" (EU rows) vs "Anodized" (US rows). The fact sheet says "brushed anodized aluminum" and never says "black". | Low |
| B12 | Atlas Coffee Table travertine | material **"Marble"**; the fact sheet calls it "travertine limestone". The fact sheet also misspells 42610 as "Unfilled **Travertive**". | Medium (M025) |
| B13 | Atlas Stool lacquered | CSV material "FSC MDF" and variants "Espresso / Burgundy / Creme" with no "Lacquered" and no "Square". The fact sheet calls them "Lacquered, Espresso" etc. and says "high-gloss lacquered **MDF**". Matching "lacquered MDF" to these rows needs a synonym rule. Origin: lacquered = **China**, oak = Latvia. | Medium (M019) |
| B14 | Atlas Coffee Table oak | CSV "Natural Oak"; fact sheet "Oak". Coffee table fumed oak material = "Solid Oak", but Atlas Stool fumed oak material = "Fumed Oak" (inconsistent). | Low |
| B15 | Nebra material | CSV "ABS; Steel; Textile"; fact sheet: **PES (polyester) textile** pleated shade pressed with plastic film, cast aluminium LED module, steel. ABS isn't mentioned. | Medium (M028) |
| B16 | Pi-No-Pi-No | Fact sheet lists **10302 Complete Set Green/Amber/Brown**, which is **missing from the CSV**. "Bronce" typo in both. Material: CSV "Glass"; fact sheet "Painted glass and wood". | Low (discontinued) |
| B17 | Pleat Pitcher | `variant` empty (fact sheet: Mirror Polished Stainless Steel). | Low (discontinued) |

## C. Facts that only exist in the fact sheet (the CSV can't answer these, but the fact sheet can)

These are *good news*: some questions look "not in the data" but are answerable from the PDF.

| Fact | Where | Emails |
|---|---|---|
| **Tembo seat height 40 cm** (400 mm) | Tembo fact sheet p.2 | M023 |
| **Tembo: "Upholstery with leather not possible"**; fabric requirement 3.0 m | Tembo p.2 | M029 |
| **Kvadrat Hallingdal 65 = Category C** on the *Tembo* sheet | Tembo p.3 | M029 |
| **Covent COM fabric requirement 0.6 m per chair** (strangely low next to Tembo's 3.0 m; worth a human sanity check) | Covent p.2 | M001 |
| Covent delivery time "6–8 weeks for made to order"; NEBA024 = stock item | Covent p.1 | M001, M007, M015 |
| May seat height 33.5 cm; **"placing the furniture near the sea can accelerate the corrosion process"**; minor rust spots may appear | May p.1–2 | M017 |
| **Brolly is dimmable (Triac phase dimming)**, both sizes | Brolly p.3 | M018 |
| Kantarell and Tense are dimmable (Triac) | Kantarell p.3, Tense p.3–4 | — |
| Kizu and Karl-Johan have a **dimmer switch on the cord**, 30 cm from the base | Kizu p.1, Karl-Johan p.1 | — |
| Packed weights for almost every product (Atlas, Coupe, Tense, Kantarell, Brolly, Knot, Rand, Tana, May, Nebra) | p.2 of each | M012 (but see A1) |
| Atlas Dining Table certificate: **EN 15372:2023, severity L2** (non-domestic tables) | Atlas Dining p.3 | M030 |
| Atlas Stool certificate: **EN 16139:2025 L2, Solid Oak only**. **Nothing listed for lacquered MDF.** | Atlas Stool p.3 | M019 |
| Tense certifications: **Ø55 = CE, ETL, SAA**; Ø70–120 = CE, ETL, SAA, PSE, FCC (confirmed with `pdftotext -table`; `-layout` makes this ambiguous) | Tense p.4 | M021 |
| Atlas Coffee Table: "stone is sensitive to liquids … spilled liquids can leave a **permanent stain**" | Atlas Coffee p.1 | M025 |
| Nebra shade material (see B15) | Nebra p.1 | M028 |
| Knot Rug fire test 16 CFR 1630/1631 | Knot p.3 | — |

## D. Traps in the fact-sheet layout (things a naive parser or LLM would get wrong)

| # | Trap | Why it matters |
|---|---|---|
| D1 | **Nebra: "Yes" on p.1 means "Light Source Included", not "Dimmable".** The Nebra sheet has **no dimmable field at all**. | M028 "can it be dimmed?" must be **not in data**, not "yes". |
| D2 | **Fabric price categories differ per product.** Harald 3 and Molly 2: Covent **C**, Tembo **B**. Gentle 2: Covent **F**, Tembo **E**. Mons: Covent **F**, Tembo **D**. (Hallingdal 65 is C in both.) | M029 must be answered from the **Tembo** sheet, never "the" fabric list. |
| D3 | `-layout` text interleaves labels and values (two columns) on almost every sheet. Example: the Tense Ø55 certification line. | The lookup should use a small hand-checked fact table per sheet, not free-text search across the PDF. |
| D4 | Pendants/lamps: CSV width/depth are really the **diameter**; cord length and canopy size only appear in the fact sheet. | A "fits between two walls" answer should say Ø, not width × depth. |

## E. Gaps: questions the data cannot answer (→ human)

| Gap | Emails |
|---|---|
| **Lead time** for everything except Tembo and Covent (Atlas, Knot, Kizu, lamps… all blank). | M006, M016, M027 |
| "Before Christmas?": even with 6–8 weeks, it depends on order date, stock and shipping. Email dated 2 Nov + 6–8 weeks = 14–28 Dec, which straddles Christmas. | M005, M006, M007/M015, M016 |
| **Wholesale prices / price lists.** Only RRP exists. Never derive. | M013, M014, M024, M001 |
| **Certificate documents.** The sheets list standard names, but the actual test reports aren't in the data. | M019, M021, M030 |
| Coupe seat height (A6) | M011 |
| Karl-Johan net weight (A1) | M012 |
| **Colours/finishes beyond those in the data** (May, Brolly, Nebra): the data only says what exists *today*, not what's possible or coming. | M017, M018, M028 |
| Nebra dimmable (D1) | M028 |
| Travertine **sealing** (only "Unfilled" is known) | M025 |
| COM price for Covent (CSV RRP 9,995 is retail, not the retailer's price) | M001 |

## F. Certificates and market approvals that don't fit the variants sold

| # | Product | Issue |
|---|---|---|
| F1 | **Kizu, Karl-Johan** | CSV has **AU/UK/US (and CN for Kizu)** variants, but both fact sheets only say **CE, 220–240 V**. Nothing for US 110–120 V, UKCA, RCM or CCC. |
| F2 | **Tense Ø55 US** (21240US) | Ø55 certifications are CE, ETL, SAA. **No FCC** for Ø55, although there's a US variant (Ø70–120 have FCC). The product highlights say "CE, ETL, SAA **and PSE**". |
| F3 | Kantarell | Highlights: "CE, **RCM** and ETL". Certifications list: "CE, ETL, UKCA, **SAA**, FCC" (no RCM). The fact sheet item list has no US SKUs. |

## G. Fact-sheet quality (low, but owner-visible)

- Pleat Pitcher: "Approved for use only with cold beverages as the surface will get very hot" (contradictory), and "dishwasher safe" vs "we recommend handwash". The designer name (Omayra Maymó) doesn't match the bio (Cristián Mohaded). The product is discontinued, so don't send this sheet.
- Old sheets: Tembo, Pleat, Pi-No-Pi-No (2020), Kizu, Karl-Johan (2023). The newer sheets use a different template. The old Tembo sheet is probably why its SKUs don't match (B5).
- Kizu Large sheet: product name "Kizu Table Lamp **Larg**".
- Nebra: "Max Voltage 21 W" (should be wattage); "Lightning" for Lighting.
- Brolly: packaging width "860 mm / 33.5"" (860 mm = 33.9"); lm/W figures don't match lm ÷ W.

## H. Status flags in the data

- **Discontinued**: Pleat Pitcher (11610), all Pi-No-Pi-No (10301–10330). → M022.
- Everything else is `active`.

## I. Email-level oddities (not data, but the tool must notice)

| Emails | Issue |
|---|---|
| **M007 = M015** | Identical: same retailer (Studio Living NL), same date, same text → **duplicate**; answer once. |
| **M003 ≈ M020** | Same question, **different retailers** (Haus & Co, The Design Store Dublin) → **not** a duplicate; both need a reply, but one checked answer serves both. |
| M027 | Private person's name, street address, phone, personal ID (Swedish format, last 4 masked but still personal data) → redact before anything else; also an **order**, so it's a human job. |
| M026 | The retailer quotes a "feed" value (27 cm) that's in none of our files → the feed or export they get is wrong somewhere. |
| M019 | "lacquered MDF" maps to **6 SKUs** (3 colours × square/round) → ambiguous variant; certificates only exist for oak. |
| M025 | "oak version in the same size": the retailer didn't say which size; oak exists in both 82x82 and 60x60. |
| M010 | "We sell the EU version": the EU row is the one with the odd label (B3); weight differs from AU/UK/US (A3). |
| M029 | Asks about Tembo but "which price category is Hallingdal" is product-specific (D2). |
