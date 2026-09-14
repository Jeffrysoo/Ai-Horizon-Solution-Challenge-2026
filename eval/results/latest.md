# DispenseIQ evaluation — 2026-09-14T14:30:51.004Z (before-reseed)

Model: `gemini-3.6-flash` · low-confidence threshold: 0.7 · knowledge base rows at run time: 6

## Summary

- In-scope top-1 defect match: **6/6 (100%)**
- In-scope cases flagged low-confidence (knowledge-base gap): 0/6 (0%)
- Out-of-scope cases correctly flagged (low confidence, score ≤ 2): **n/a**
- Mean confidence — in-scope 4.5 / 5 vs out-of-scope — / 5
- Mean top similarity — in-scope 0.78 vs out-of-scope —

## Cases

| id | scope | expected | got | conf | sim | low-conf | result | ms |
|---|---|---|---|---|---|---|---|---|
| undersize | in | Undersized Dispensing Dots | Insufficient Dispensing Volume | 5 | 0.79 | no | defect matched | 13296 |
| oversize | in | Oversized Dispensing Dots | Excessive Dispensing Volume | 5 | 0.8 | no | defect matched | 10994 |
| shape | in | Irregular Dot Shape | Irregular Dot Shape | 4 | 0.8 | no | defect matched | 12935 |
| misalign | in | Dot Misalignment | Dispensing Position Offset | 5 | 0.77 | no | defect matched | 9961 |
| drool | in | Nozzle Drooling / Post-Dispense Ooze | Nozzle Drooling and Tailing | 4 | 0.8 | no | defect matched | 11706 |
| voids | in | Voids or Air Bubbles in Cured Material | Voiding and Entrapped Air in Cured Epoxy | 4 | 0.73 | no | defect matched | 10326 |
