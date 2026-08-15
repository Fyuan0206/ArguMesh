from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

output = "tests/fixtures/reader-selection-sample.pdf"
c = canvas.Canvas(output, pagesize=A4)
width, height = A4

c.setFont("Helvetica-Bold", 18)
c.drawString(62, height - 72, "Evidence-grounded Reading for Research Papers")
c.setFont("Helvetica", 11)
c.drawString(62, height - 105, "A compact fixture for PaperIdea reader validation")
c.setFont("Times-Roman", 12)
text = c.beginText(62, height - 155)
text.setLeading(18)
for line in [
    "Abstract",
    "The method fuses multi-scale features to improve localization under severe occlusion.",
    "Every generated claim is linked to its page, selected source text, model, and time.",
    "This makes the interpretation reviewable instead of presenting an unsupported conclusion.",
]:
    text.textLine(line)
c.drawText(text)
c.showPage()

c.setFont("Helvetica-Bold", 16)
c.drawString(62, height - 72, "2. Method")
c.setFont("Times-Roman", 12)
text = c.beginText(62, height - 120)
text.setLeading(18)
for line in [
    "The reader renders each page with a canvas and a selectable text layer.",
    "Only text explicitly selected by the researcher is sent to the language model.",
    "If the excerpt is insufficient, the assistant must state that more context is required.",
]:
    text.textLine(line)
c.drawText(text)
c.save()
