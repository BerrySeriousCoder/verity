# Verity

A document review workspace for source-grounded checks across digital PDFs, spreadsheets, and CSVs.

- [Engineering notebook](docs/README.md)
- [Development setup](project/README.md)
- [Contribution conventions](CONTRIBUTING.md)

Status: the first local slice uploads PDF originals, persists their identities in PostgreSQL, and displays them in a Next.js/Tailwind workspace with a PDF.js viewer. Text extraction, citation highlights, agents, and review workflows are not implemented yet. The product checks documents and produces review findings; it does not edit source documents or send external messages. OCR and scanned-document understanding are excluded. This local development slice is not ready for shared deployment.
