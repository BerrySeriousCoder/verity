# Small fictional comparison fixture

Upload **demo-policy.pdf** (one page) and **demo-placement-slip.xlsx** (one sheet). Every identity, reference, date, and amount is fabricated. The original private documents in the parent folder were used only as a layout reference and are not included in this fixture.

Suggested prompt:

> The PDF is the final policy and the XLSX is its placement slip. Compare this single location in both directions. Check sums insured, coverage, extensions, deductibles, conditions and premium arithmetic. Cite the evidence for each finding.

There are nine deliberately different schedule rows: machinery sum insured, derived total sum insured, earthquake cover, debris limit, expediting limit, deductible, stock declarations, sprinkler warranty, and premium total. The premium total is deliberately wrong in the policy: 25,000 + 4,500 = 29,500, not 29,400. Some other rows align; fire and flood have matching wording but inherit the differing total sum insured.

`expected-findings.json` is the answer key. **Do not upload it** during the test. The harness may split or combine findings, so compare their substance and citations, not an exact questionnaire count. This small example tests the workflow, not real insurance correctness or a performance guarantee.

Regenerate with `node project/scripts/generate-demo-documents.mjs` from the repository root after `pnpm install` in `project/`.
