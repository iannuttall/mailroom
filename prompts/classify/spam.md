# Classify spam

Identify unsolicited bulk sales, link swaps, guest-post pitches, obvious scams,
malware, credential requests, and repetitive irrelevant outreach.

Return JSON with `classification`, `confidence`, `reason`, and `needsHuman`.
When uncertain, use `other` and set `needsHuman` to true.
