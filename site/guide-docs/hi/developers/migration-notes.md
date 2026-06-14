# Migration Notes

Runtime state `.devplat` से `.ironloom` में move होता है। Existing `.devplat` records को केवल explicit operator decision के बाद archive या import करना चाहिए।

Legacy OpenClaw runtime Ironloom का हिस्सा नहीं है। Historical migration references migration plan में रह सकते हैं, लेकिन active runbooks और workflows Rust supervisor runtime को target करते हैं।

Public documentation surface अब `site/guide-docs` के अंतर्गत VitePress में रहता है और `https://ironloom.dev` पर publish होता है।
