# Legal drafts

These are starting drafts for the public legal pages, written to match what the software actually
does today. They are **not legal advice** and are **not in force**: nothing in the app links to
them yet. Before publishing, have them reviewed by someone qualified in the places you operate
(India and the EU at least), and fill in every `[BRACKETED]` gap.

- [terms.md](terms.md): terms of use
- [privacy.md](privacy.md): privacy policy
- [content-rules.md](content-rules.md): what may be published in a public reader wiki, and how to
  report a page

What they assume, so you can check each against reality before you publish:

| The draft says                                                                  | True today?                                                                                            |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| You must be 18 or older                                                         | A decision for you; nothing in the app checks age                                                      |
| Your work is yours; you can export it at any time                               | Yes: JSON, Markdown, Word, EPUB and PDF exports, on every account                                      |
| We do not train AI models on your work, and the product has no AI in it         | Yes, as built. Keep it true                                                                            |
| AI crawlers are asked to stay out of public wikis                               | Yes: `robots.txt` and an `X-Robots-Tag: noai` header. Polite crawlers obey; nothing can force the rest |
| Deleting your account deletes your worlds and their files                       | Yes (account page). Backups you keep will still hold copies until they rotate                          |
| We keep sign-in sessions in a cookie and use no advertising or tracking cookies | Yes. Fonts are served by the app, not by Google                                                        |
| Email is sent through Resend                                                    | Once you set it up                                                                                     |
| Files are stored on our servers in [REGION]                                     | Depends on where you host                                                                              |
