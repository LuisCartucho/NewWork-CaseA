#!/usr/bin/env sh
# Extract text from every fact sheet PDF (pages separated by form feed \f so we can cite page numbers).
# Run from server/. Plain tool, no AI: the PDFs contain real text, so OCR/LLM is not needed.
set -e
mkdir -p data/fact_sheets_text
for f in data/fact_sheets/*.pdf; do
  base=$(basename "$f" .pdf)
  pdftotext -layout "$f" "data/fact_sheets_text/$base.txt"
done
echo "Extracted $(ls data/fact_sheets_text | wc -l) files"
