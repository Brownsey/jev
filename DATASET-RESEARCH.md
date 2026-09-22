# Entity-resolution showcase: dataset research

Research date: 22 September 2026. This records the user's revised goal and a shortlist; these datasets and the clustering flow are not yet implemented.

## Revised goal

Show entity discovery across a collection of individual records. Include records with no counterpart (singletons), duplicate pairs, triples, and confusing but distinct projects. The current app evaluates preconstructed pairs and does not yet demonstrate this complete workflow. Dataset limits must count input rows, not pair comparisons.

Keep UK and Germany construction/planning as the main domain. Suggested generated preset: 300 rows representing 170 entities: 80 singletons, 50 groups of two, 40 groups of three. Split the preset evenly across UK/Germany. Generate local deterministic variations in descriptions, developer names, addresses, missing fields and phase notation, retaining hard negatives at the same/nearby site. Store private evaluation entity IDs separately; never send them, scenarios or duplicate counts to Jev.

## Free dataset shortlist

All full source datasets below exceed 500 rows. Sample complete labelled entity groups below the chosen row limit; taking the first N rows or random individual rows can accidentally remove counterparts.

| Dataset | Full source | Proposed small sample | Suitability and reuse |
| --- | --- | --- | --- |
| Splink `fake_1000` | 1,000 rows / 250 labelled synthetic people | 190 rows: 40 singletons + 30 pairs + 30 triples (100 entities) | Strongest compact demonstration of grouping, typos and missing fields. Includes name, date of birth, UK city and email; no construction descriptions or street addresses. Dataset repository carries MIT licence. |
| Leipzig Affiliations | 2,260 affiliation strings / 330 labelled clusters | 200–300 rows selected as complete groups | Real organisation/location wording, useful for semantic name matching. Often contains address components/city, but not a structured construction dataset. Publisher links CC BY 4.0. |
| Leipzig Music Brainz 20K | 19,375 records / 10,000 entities across five sources | 200–300 rows selected as complete groups | Real music records with synthetically corrupted duplicates across two to five sources. Useful multi-source example, unrelated to construction. Publisher links CC BY 4.0. |

Directly inspected Splink CSV and counted groups: 43 singleton entities, 30 pairs, 37 triples, 34 groups of four, 33 of five, 33 of six, 41 of seven. Therefore the proposed 190-row sample can retain whole existing groups without inventing duplicates or relabelling truncated clusters. Select deterministically and shuffle rows; replace source/cluster-derived record identifiers with opaque IDs before inference.

No ready-made, labelled UK/Germany construction-project clustering benchmark was identified in this quick search. Open planning/address data alone does not establish whether records refer to the same project, especially for separate phases at one site. Retain clearly labelled synthetic domain examples and distinguish them from real-source benchmarks.

## Proposed low-cost flow

1. Choose 100–300 input rows (hard limit 499), generate or load a local fixture for free, then inspect raw records.
2. Select likely candidate pairs locally using multiple permissive name/address/reference rules; do not use evaluation entity IDs. Show the candidate count before any paid run. A 300-row all-pairs run requires 44,850 comparisons, so row limits alone do not control inference cost.
3. Enforce a separate comparison cap, batch the candidates through Jev, and retain cancellation/partial progress. Cache identical comparisons against model, prompt and field settings.
4. Show inferred entity groups with singletons, pairs and triples; distinguish unresolved records from confirmed nonmatches. Flag contradictory links rather than blindly merging every connected chain.
5. Reveal ground truth only for evaluation. Report missed matches from candidate selection as well as matching/clustering errors; untested pairs are not verified negatives. Label singleton status as 'no match found' where candidate coverage is incomplete.

These are implementation requirements for the next app change, not descriptions of the current deployed behavior. No paid model calls were made during this research.

## Sources

- Splink dataset descriptions and original CSV links: https://moj-analytical-services.github.io/splink/api_docs/datasets.html
- Inspected CSV: https://raw.githubusercontent.com/moj-analytical-services/splink_datasets/master/data/fake_1000.csv
- Dataset licence: https://github.com/moj-analytical-services/splink_datasets/blob/main/LICENSE
- Leipzig dataset sizes, cluster labels, downloads and licensing: https://dbs.uni-leipzig.de/research/projects/benchmark-datasets-for-entity-resolution
- Licence linked by Leipzig: https://creativecommons.org/licenses/by/4.0/

Retain source attribution and licence notices when packaging samples. Label the sampling method and any synthetic alterations.
