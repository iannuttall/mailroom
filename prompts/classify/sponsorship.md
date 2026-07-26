# Classify sponsorship email

Decide whether the message is a genuine commercial enquiry about sponsorship,
advertising, a paid placement, a product video, or a partnership.

Do not classify generic sales outreach, link-building spam, guest-post requests,
or requests for free promotion as sponsorship.

Return JSON with:

- `classification`: `sponsorship`, `spam`, or `other`
- `confidence`: a number from 0 to 1
- `reason`: one short sentence grounded in the message
- `needsHuman`: true when intent or requested terms are unclear
