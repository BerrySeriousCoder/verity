# Verity

A document review workspace for source-grounded checks across digital PDFs, spreadsheets, and CSVs.

- [Engineering notebook](docs/README.md)
- [Development setup](project/README.md)
- [Docker and Railway deployment](docs/08-deployment.md)
- [Small fictional test documents](testdoc/dummy/README.md)
- [Contribution conventions](CONTRIBUTING.md)

Verity ingests digital PDFs, CSVs and spreadsheets, builds bidirectional review checklists, and compares evidence using parallel Gemini workers with independent verification. The interface streams worker activity and keeps a live checklist with source citations. PostgreSQL checkpoints let interrupted reviews resume.

The product checks documents and produces findings; it does not edit source documents or send external messages. OCR and scanned-document understanding are excluded. Local development and a password-protected single-workspace Docker deployment are supported; multi-user accounts and tenant isolation are not implemented. Evaluation infrastructure and measured quality/cost benchmarks remain future work.
