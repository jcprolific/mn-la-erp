# Shopify Barcode Cleanup Execution Order (Phase 2.6b)

## Summary

- Total queued variant actions: **945**
- High priority actions: **328**
- Medium priority actions: **617**
- Low priority actions: **0**
- Planned batches (50 actions/batch): **19**

## Prioritization Logic

- Sort groups by active impact first.
- Within each group, run high-priority rows first.
- Execute `replace barcode on this variant` and `manual business review needed` before lower impact actions.

## Top Groups To Start With

- `144803` | variants: 3 | high: 3 | critical actions: 2
- `110902` | variants: 3 | high: 2 | critical actions: 1
- `109902` | variants: 2 | high: 2 | critical actions: 1
- `110802` | variants: 2 | high: 2 | critical actions: 1
- `140002` | variants: 2 | high: 2 | critical actions: 1
- `144402` | variants: 2 | high: 2 | critical actions: 1
- `144403` | variants: 2 | high: 2 | critical actions: 1
- `144802` | variants: 2 | high: 2 | critical actions: 1
- `144902` | variants: 2 | high: 2 | critical actions: 1
- `144903` | variants: 2 | high: 2 | critical actions: 1
- `145002` | variants: 2 | high: 2 | critical actions: 1
- `145003` | variants: 2 | high: 2 | critical actions: 1
- `176202` | variants: 2 | high: 2 | critical actions: 1
- `176203` | variants: 2 | high: 2 | critical actions: 1
- `176204` | variants: 2 | high: 2 | critical actions: 1
- `176205` | variants: 2 | high: 2 | critical actions: 1
- `176206` | variants: 2 | high: 2 | critical actions: 1
- `176207` | variants: 2 | high: 2 | critical actions: 1
- `178802` | variants: 2 | high: 2 | critical actions: 1
- `178803` | variants: 2 | high: 2 | critical actions: 1

## First Batch Preview (Top 25)

- #1 [high] replace barcode on this variant | LEILA IN OAT | SMALL | barcode `144803` | variant `gid://shopify/ProductVariant/52095530664241`
- #2 [high] replace barcode on this variant | LIORA IN CAVIAR | LARGE | barcode `144803` | variant `gid://shopify/ProductVariant/52100475945265`
- #3 [high] keep barcode on this variant | LIORA | CAVIAR / LARGE | barcode `144803` | variant `gid://shopify/ProductVariant/51702627270961`
- #4 [high] replace barcode on this variant | CLEE INDUSTRIES SWEATSHORTS (MAROON) | MEDIUM | barcode `110902` | variant `gid://shopify/ProductVariant/52311843668273`
- #5 [high] keep barcode on this variant | CLEE INDUSTRIES SWEATSHORTS (MAROON) | SMALL | barcode `110902` | variant `gid://shopify/ProductVariant/52311843635505`
- #6 [medium] remove barcode temporarily | CUTOFF HOODIE IN WOOD | SMALL | barcode `110902` | variant `gid://shopify/ProductVariant/52053236482353`
- #7 [high] replace barcode on this variant | 4 POCKET CUBAN SHIRT IN CELADON | 3X - LARGE | barcode `109902` | variant `gid://shopify/ProductVariant/52860479570225`
- #8 [high] keep barcode on this variant | 4 POCKET CUBAN SHIRT IN CELADON | SMALL | barcode `109902` | variant `gid://shopify/ProductVariant/52042262872369`
- #9 [high] replace barcode on this variant | 4 POCKET CUBAN SHIRT IN NIMBUS | 3X - LARGE | barcode `110802` | variant `gid://shopify/ProductVariant/52860686926129`
- #10 [high] keep barcode on this variant | 4 POCKET CUBAN SHIRT IN NIMBUS | SMALL | barcode `110802` | variant `gid://shopify/ProductVariant/52042265067825`
- #11 [high] replace barcode on this variant | 4 POCKET CUBAN SHIRT IN STONE GREY | 3X - LARGE | barcode `140002` | variant `gid://shopify/ProductVariant/52860619850033`
- #12 [high] keep barcode on this variant | 4 POCKET CUBAN SHIRT IN STONE GREY | SMALL | barcode `140002` | variant `gid://shopify/ProductVariant/52046941520177`
- #13 [high] replace barcode on this variant | LIORA IN ANTHRACITE | SMALL | barcode `144402` | variant `gid://shopify/ProductVariant/52149866955057`
- #14 [high] keep barcode on this variant | LIORA | ANTHRACITE / SMALL | barcode `144402` | variant `gid://shopify/ProductVariant/51650350383409`
- #15 [high] replace barcode on this variant | LIORA IN ANTHRACITE | LARGE | barcode `144403` | variant `gid://shopify/ProductVariant/52149866987825`
- #16 [high] keep barcode on this variant | LIORA | ANTHRACITE / LARGE | barcode `144403` | variant `gid://shopify/ProductVariant/51650350448945`
- #17 [high] replace barcode on this variant | LIORA IN CAVIAR | SMALL | barcode `144802` | variant `gid://shopify/ProductVariant/52100475912497`
- #18 [high] keep barcode on this variant | LIORA | CAVIAR / SMALL | barcode `144802` | variant `gid://shopify/ProductVariant/51702627238193`
- #19 [high] replace barcode on this variant | LIORA IN CHARCOAL GREY | SMALL | barcode `144902` | variant `gid://shopify/ProductVariant/52149972992305`
- #20 [high] keep barcode on this variant | LIORA | CHARCOAL GREY / SMALL | barcode `144902` | variant `gid://shopify/ProductVariant/51835326693681`
- #21 [high] replace barcode on this variant | LIORA IN CHARCOAL GREY | LARGE | barcode `144903` | variant `gid://shopify/ProductVariant/52149973025073`
- #22 [high] keep barcode on this variant | LIORA | CHARCOAL GREY / LARGE | barcode `144903` | variant `gid://shopify/ProductVariant/51835326726449`
- #23 [high] replace barcode on this variant | LIORA IN WOOD | SMALL | barcode `145002` | variant `gid://shopify/ProductVariant/52149891727665`
- #24 [high] keep barcode on this variant | LIORA | WOOD / SMALL | barcode `145002` | variant `gid://shopify/ProductVariant/51650367586609`
- #25 [high] replace barcode on this variant | LIORA IN WOOD | LARGE | barcode `145003` | variant `gid://shopify/ProductVariant/52149891760433`

## Output

- Full execution queue CSV: `docs/reports/shopify_barcode_cleanup_execution_queue.csv`
