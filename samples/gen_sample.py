import pymupdf as fitz

doc = fitz.open()
pages_text = [
    "Welcome to the PDF translation plugin.\nThis document demonstrates the translation pipeline.\nThe plugin preserves layout, fonts, and images.",
    "Paragraph detection groups lines into logical units.\nCode blocks are kept as-is and never translated.\nTables are translated cell by cell.",
    "Translate up to fifty pages per task.\nThe output is an editable PDF with selectable text.\nYour API key is never written to logs.",
]
for i, text in enumerate(pages_text):
    page = doc.new_page()
    y = 100
    for line in text.split("\n"):
        page.insert_text((72, y), line, fontsize=12)
        y += 18
doc.save("E:/Code/dsh-pdf-translate/samples/sample-en.pdf")
doc.close()
print("sample generated: 3 pages, 9 paragraphs")
