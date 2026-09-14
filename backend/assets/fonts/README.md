# Vazirmatn (embedded weights)

`Vazirmatn-Regular.woff2` and `Vazirmatn-Bold.woff2` — used by
`backend/services/paymentVoucherPrintService.js` to embed the font as a
`data:` URI in generated PDFs, since Playwright renders that HTML via
`page.setContent()` with no base URL (no relative file paths, no network
access to Google Fonts) and the rendering host's installed fonts can't be
relied on.

Source: https://github.com/rastikerdar/vazirmatn — SIL Open Font License
1.1 (see `OFL.txt`), which permits embedding/redistribution.
