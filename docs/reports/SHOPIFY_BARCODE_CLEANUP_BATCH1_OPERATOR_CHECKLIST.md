# Shopify Barcode Cleanup Batch 1 Operator Checklist

## Scope

- Batch: **1**
- Total rows: **50**
- High priority: **49**
- Medium priority: **1**

## Action Mix

- keep barcode on this variant: **24**
- replace barcode on this variant: **25**
- remove barcode temporarily: **1**
- manual business review needed: **0**

## Operator Steps (Shopify Admin)

1. Open each variant using Product + Variant IDs.
2. Apply the exact `recommended_action`.
3. If action is `replace barcode on this variant`, assign a unique barcode not used by any other active variant.
4. If action is `remove barcode temporarily`, clear barcode and save.
5. If action is `manual business review needed`, stop and escalate to merch/inventory owner.
6. After completing all rows, re-run:
   - `npm run shopify:barcode-conflicts`
   - `npm run shopify:barcode-cleanup-plan`
   - `npm run shopify:barcode-cleanup-queue`

## Batch 1 Checklist

### Barcode `109902` (2 rows)

- [ ] #7 | replace barcode on this variant | 4 POCKET CUBAN SHIRT IN CELADON | 3X - LARGE | SKU: `109902` | Product: `gid://shopify/Product/10453094400305` | Variant: `gid://shopify/ProductVariant/52860479570225` | Status: `active`
- [ ] #8 | keep barcode on this variant | 4 POCKET CUBAN SHIRT IN CELADON | SMALL | SKU: `109902` | Product: `gid://shopify/Product/10453094400305` | Variant: `gid://shopify/ProductVariant/52042262872369` | Status: `active`

### Barcode `110802` (2 rows)

- [ ] #9 | replace barcode on this variant | 4 POCKET CUBAN SHIRT IN NIMBUS | 3X - LARGE | SKU: `110807` | Product: `gid://shopify/Product/10453094760753` | Variant: `gid://shopify/ProductVariant/52860686926129` | Status: `active`
- [ ] #10 | keep barcode on this variant | 4 POCKET CUBAN SHIRT IN NIMBUS | SMALL | SKU: `110802` | Product: `gid://shopify/Product/10453094760753` | Variant: `gid://shopify/ProductVariant/52042265067825` | Status: `active`

### Barcode `110902` (3 rows)

- [ ] #4 | replace barcode on this variant | CLEE INDUSTRIES SWEATSHORTS (MAROON) | MEDIUM | SKU: `110903` | Product: `gid://shopify/Product/10512070345009` | Variant: `gid://shopify/ProductVariant/52311843668273` | Status: `active`
- [ ] #5 | keep barcode on this variant | CLEE INDUSTRIES SWEATSHORTS (MAROON) | SMALL | SKU: `110902` | Product: `gid://shopify/Product/10512070345009` | Variant: `gid://shopify/ProductVariant/52311843635505` | Status: `active`
- [ ] #6 | remove barcode temporarily | CUTOFF HOODIE IN WOOD | SMALL | SKU: `110902` | Product: `gid://shopify/Product/10456313069873` | Variant: `gid://shopify/ProductVariant/52053236482353` | Status: `archived`

### Barcode `140002` (2 rows)

- [ ] #11 | replace barcode on this variant | 4 POCKET CUBAN SHIRT IN STONE GREY | 3X - LARGE | SKU: `140002` | Product: `gid://shopify/Product/10454734078257` | Variant: `gid://shopify/ProductVariant/52860619850033` | Status: `active`
- [ ] #12 | keep barcode on this variant | 4 POCKET CUBAN SHIRT IN STONE GREY | SMALL | SKU: `140002` | Product: `gid://shopify/Product/10454734078257` | Variant: `gid://shopify/ProductVariant/52046941520177` | Status: `active`

### Barcode `144402` (2 rows)

- [ ] #13 | replace barcode on this variant | LIORA IN ANTHRACITE | SMALL | SKU: `144402` | Product: `gid://shopify/Product/10475464130865` | Variant: `gid://shopify/ProductVariant/52149866955057` | Status: `active`
- [ ] #14 | keep barcode on this variant | LIORA | ANTHRACITE / SMALL | SKU: `144402` | Product: `gid://shopify/Product/10353640276273` | Variant: `gid://shopify/ProductVariant/51650350383409` | Status: `active`

### Barcode `144403` (2 rows)

- [ ] #15 | replace barcode on this variant | LIORA IN ANTHRACITE | LARGE | SKU: `144403` | Product: `gid://shopify/Product/10475464130865` | Variant: `gid://shopify/ProductVariant/52149866987825` | Status: `active`
- [ ] #16 | keep barcode on this variant | LIORA | ANTHRACITE / LARGE | SKU: `144403` | Product: `gid://shopify/Product/10353640276273` | Variant: `gid://shopify/ProductVariant/51650350448945` | Status: `active`

### Barcode `144802` (2 rows)

- [ ] #17 | replace barcode on this variant | LIORA IN CAVIAR | SMALL | SKU: `144802` | Product: `gid://shopify/Product/10464847102257` | Variant: `gid://shopify/ProductVariant/52100475912497` | Status: `active`
- [ ] #18 | keep barcode on this variant | LIORA | CAVIAR / SMALL | SKU: `144802` | Product: `gid://shopify/Product/10353640276273` | Variant: `gid://shopify/ProductVariant/51702627238193` | Status: `active`

### Barcode `144803` (3 rows)

- [ ] #1 | replace barcode on this variant | LEILA IN OAT | SMALL | SKU: `185402` | Product: `gid://shopify/Product/10464278642993` | Variant: `gid://shopify/ProductVariant/52095530664241` | Status: `active`
- [ ] #2 | replace barcode on this variant | LIORA IN CAVIAR | LARGE | SKU: `144803` | Product: `gid://shopify/Product/10464847102257` | Variant: `gid://shopify/ProductVariant/52100475945265` | Status: `active`
- [ ] #3 | keep barcode on this variant | LIORA | CAVIAR / LARGE | SKU: `144803` | Product: `gid://shopify/Product/10353640276273` | Variant: `gid://shopify/ProductVariant/51702627270961` | Status: `active`

### Barcode `144902` (2 rows)

- [ ] #19 | replace barcode on this variant | LIORA IN CHARCOAL GREY | SMALL | SKU: `144902` | Product: `gid://shopify/Product/10475489853745` | Variant: `gid://shopify/ProductVariant/52149972992305` | Status: `active`
- [ ] #20 | keep barcode on this variant | LIORA | CHARCOAL GREY / SMALL | SKU: `144902` | Product: `gid://shopify/Product/10353640276273` | Variant: `gid://shopify/ProductVariant/51835326693681` | Status: `active`

### Barcode `144903` (2 rows)

- [ ] #21 | replace barcode on this variant | LIORA IN CHARCOAL GREY | LARGE | SKU: `144903` | Product: `gid://shopify/Product/10475489853745` | Variant: `gid://shopify/ProductVariant/52149973025073` | Status: `active`
- [ ] #22 | keep barcode on this variant | LIORA | CHARCOAL GREY / LARGE | SKU: `144903` | Product: `gid://shopify/Product/10353640276273` | Variant: `gid://shopify/ProductVariant/51835326726449` | Status: `active`

### Barcode `145002` (2 rows)

- [ ] #23 | replace barcode on this variant | LIORA IN WOOD | SMALL | SKU: `145002` | Product: `gid://shopify/Product/10475468521777` | Variant: `gid://shopify/ProductVariant/52149891727665` | Status: `active`
- [ ] #24 | keep barcode on this variant | LIORA | WOOD / SMALL | SKU: `145002` | Product: `gid://shopify/Product/10353640276273` | Variant: `gid://shopify/ProductVariant/51650367586609` | Status: `active`

### Barcode `145003` (2 rows)

- [ ] #25 | replace barcode on this variant | LIORA IN WOOD | LARGE | SKU: `145003` | Product: `gid://shopify/Product/10475468521777` | Variant: `gid://shopify/ProductVariant/52149891760433` | Status: `active`
- [ ] #26 | keep barcode on this variant | LIORA | WOOD / LARGE | SKU: `145003` | Product: `gid://shopify/Product/10353640276273` | Variant: `gid://shopify/ProductVariant/51650367619377` | Status: `active`

### Barcode `176202` (2 rows)

- [ ] #27 | replace barcode on this variant | "VINES AND THORNS" OVERPOCKET PHAT PANTS IN NAVY | SMALL | SKU: `176202` | Product: `gid://shopify/Product/10464848740657` | Variant: `gid://shopify/ProductVariant/52100495704369` | Status: `active`
- [ ] #28 | keep barcode on this variant | "VINES AND THORNS" OVERPOCKET PHAT PANTS | NAVY / SMALL | SKU: `176202` | Product: `gid://shopify/Product/10380877660465` | Variant: `gid://shopify/ProductVariant/51832681857329` | Status: `active`

### Barcode `176203` (2 rows)

- [ ] #29 | replace barcode on this variant | "VINES AND THORNS" OVERPOCKET PHAT PANTS IN NAVY | MEDIUM | SKU: `176203` | Product: `gid://shopify/Product/10464848740657` | Variant: `gid://shopify/ProductVariant/52100495737137` | Status: `active`
- [ ] #30 | keep barcode on this variant | "VINES AND THORNS" OVERPOCKET PHAT PANTS | NAVY / MEDIUM | SKU: `176203` | Product: `gid://shopify/Product/10380877660465` | Variant: `gid://shopify/ProductVariant/51832681890097` | Status: `active`

### Barcode `176204` (2 rows)

- [ ] #31 | replace barcode on this variant | "VINES AND THORNS" OVERPOCKET PHAT PANTS IN NAVY | LARGE | SKU: `176204` | Product: `gid://shopify/Product/10464848740657` | Variant: `gid://shopify/ProductVariant/52100495769905` | Status: `active`
- [ ] #32 | keep barcode on this variant | "VINES AND THORNS" OVERPOCKET PHAT PANTS | NAVY / LARGE | SKU: `176204` | Product: `gid://shopify/Product/10380877660465` | Variant: `gid://shopify/ProductVariant/51832681922865` | Status: `active`

### Barcode `176205` (2 rows)

- [ ] #33 | replace barcode on this variant | "VINES AND THORNS" OVERPOCKET PHAT PANTS IN NAVY | EXTRA - LARGE | SKU: `176205` | Product: `gid://shopify/Product/10464848740657` | Variant: `gid://shopify/ProductVariant/52100495802673` | Status: `active`
- [ ] #34 | keep barcode on this variant | "VINES AND THORNS" OVERPOCKET PHAT PANTS | NAVY / EXTRA - LARGE | SKU: `176205` | Product: `gid://shopify/Product/10380877660465` | Variant: `gid://shopify/ProductVariant/51832681955633` | Status: `active`

### Barcode `176206` (2 rows)

- [ ] #35 | replace barcode on this variant | "VINES AND THORNS" OVERPOCKET PHAT PANTS IN NAVY | 2X - LARGE | SKU: `176206` | Product: `gid://shopify/Product/10464848740657` | Variant: `gid://shopify/ProductVariant/52100495835441` | Status: `active`
- [ ] #36 | keep barcode on this variant | "VINES AND THORNS" OVERPOCKET PHAT PANTS | NAVY / 2X - LARGE | SKU: `176206` | Product: `gid://shopify/Product/10380877660465` | Variant: `gid://shopify/ProductVariant/51832681988401` | Status: `active`

### Barcode `176207` (2 rows)

- [ ] #37 | replace barcode on this variant | "VINES AND THORNS" OVERPOCKET PHAT PANTS IN NAVY | 3X - LARGE | SKU: `176207` | Product: `gid://shopify/Product/10464848740657` | Variant: `gid://shopify/ProductVariant/52100495868209` | Status: `active`
- [ ] #38 | keep barcode on this variant | "VINES AND THORNS" OVERPOCKET PHAT PANTS | NAVY / 3X - LARGE | SKU: `176207` | Product: `gid://shopify/Product/10380877660465` | Variant: `gid://shopify/ProductVariant/51832682021169` | Status: `active`

### Barcode `178802` (2 rows)

- [ ] #39 | replace barcode on this variant | "CROP CIRCLES" MOCK NECK TEE IN OLIVE | EXTRA-SMALL | SKU: `178802` | Product: `gid://shopify/Product/10449938645297` | Variant: `gid://shopify/ProductVariant/52034743566641` | Status: `active`
- [ ] #40 | keep barcode on this variant | MOCK NECK TEE IN OLIVE | EXTRA - SMALL | SKU: `178802` | Product: `gid://shopify/Product/9256996831537` | Variant: `gid://shopify/ProductVariant/47957568422193` | Status: `active`

### Barcode `178803` (2 rows)

- [ ] #41 | replace barcode on this variant | "CROP CIRCLES" MOCK NECK TEE IN OLIVE | SMALL | SKU: `178803` | Product: `gid://shopify/Product/10449938645297` | Variant: `gid://shopify/ProductVariant/52034743599409` | Status: `active`
- [ ] #42 | keep barcode on this variant | MOCK NECK TEE IN OLIVE | SMALL | SKU: `178803` | Product: `gid://shopify/Product/9256996831537` | Variant: `gid://shopify/ProductVariant/47957568454961` | Status: `active`

### Barcode `178804` (2 rows)

- [ ] #43 | replace barcode on this variant | "CROP CIRCLES" MOCK NECK TEE IN OLIVE | MEDIUM | SKU: `178804` | Product: `gid://shopify/Product/10449938645297` | Variant: `gid://shopify/ProductVariant/52034743632177` | Status: `active`
- [ ] #44 | keep barcode on this variant | MOCK NECK TEE IN OLIVE | MEDIUM | SKU: `178804` | Product: `gid://shopify/Product/9256996831537` | Variant: `gid://shopify/ProductVariant/47957568487729` | Status: `active`

### Barcode `178805` (2 rows)

- [ ] #45 | replace barcode on this variant | "CROP CIRCLES" MOCK NECK TEE IN OLIVE | LARGE | SKU: `178805` | Product: `gid://shopify/Product/10449938645297` | Variant: `gid://shopify/ProductVariant/52034743664945` | Status: `active`
- [ ] #46 | keep barcode on this variant | MOCK NECK TEE IN OLIVE | LARGE | SKU: `178805` | Product: `gid://shopify/Product/9256996831537` | Variant: `gid://shopify/ProductVariant/47957568520497` | Status: `active`

### Barcode `178806` (2 rows)

- [ ] #47 | replace barcode on this variant | "CROP CIRCLES" MOCK NECK TEE IN OLIVE | EXTRA-LARGE | SKU: `178806` | Product: `gid://shopify/Product/10449938645297` | Variant: `gid://shopify/ProductVariant/52034743697713` | Status: `active`
- [ ] #48 | keep barcode on this variant | MOCK NECK TEE IN OLIVE | EXTRA - LARGE | SKU: `178806` | Product: `gid://shopify/Product/9256996831537` | Variant: `gid://shopify/ProductVariant/47957568553265` | Status: `active`

### Barcode `178807` (2 rows)

- [ ] #49 | replace barcode on this variant | "CROP CIRCLES" MOCK NECK TEE IN OLIVE | 2X-LARGE | SKU: `178807` | Product: `gid://shopify/Product/10449938645297` | Variant: `gid://shopify/ProductVariant/52034743730481` | Status: `active`
- [ ] #50 | keep barcode on this variant | MOCK NECK TEE IN OLIVE | 2X - LARGE | SKU: `178807` | Product: `gid://shopify/Product/9256996831537` | Variant: `gid://shopify/ProductVariant/47957568586033` | Status: `active`
