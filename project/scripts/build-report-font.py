"""Subset the existing brand font for the calculator directory and income workflow."""
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

project = Path(__file__).resolve().parents[1]
assets = project / "assets" / "fonts"
sources = ["ReportIncome", "Report", "ReportConvert", "InputReview", "CreditSettlementDirect", "Chrome"]
text = "".join((project / "src" / f"{name}.jsx").read_text(encoding="utf-8") for name in sources)
font = TTFont(assets / "PretendardVariable-core.woff2", recalcTimestamp=False)
chars = {ord(ch) for ch in text} | set(range(32, 127))
options = subset.Options()
options.layout_features = ["*"]
builder = subset.Subsetter(options)
builder.populate(unicodes=chars)
builder.subset(font)
path = assets / "PretendardVariable-report.woff2"
font.save(path)
print(f"{len(chars)} code points, {path.stat().st_size:,} bytes")
