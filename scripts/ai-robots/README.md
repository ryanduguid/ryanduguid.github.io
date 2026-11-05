# Pinned AI agent list

`site-tools check_seo` reads this copy of the community list in
[ai-robots-txt/ai.robots.txt](https://github.com/ai-robots-txt/ai.robots.txt) and
fails when an agent on it has no reviewed treatment. The check reads only these
files and never fetches the list, so an upstream change cannot turn CI red.

| Field | Value |
| --- | --- |
| File | `robots.json`, 202 entries |
| Source | [ai-robots-txt/ai.robots.txt](https://github.com/ai-robots-txt/ai.robots.txt), commit `8158e03528906c9d597813c1aef0601119609363` |
| Retrieved | 5 November 2026 |
| SHA-256 | `532f315b083ac5b5e830c0f59a8e87cee8b08924dbaffd3bc48114bd54710e7c` |
| Licence | MIT; the upstream `LICENSE` is copied beside it unchanged |

The list is a block list by intent, but this site blocks nothing. It uses the list
only to classify agents. `function` values are community-maintained, so a name
reaches `robots.txt` only on its operator's own page.

## Classes

Names compare as RFC 9309 matches them: any case, without a `/1.0` suffix.

| Class | Treatment | Where it is kept |
| --- | --- | --- |
| Search and citation | Named, allowed | `RETRIEVAL_CRAWLERS` in `scripts/src/site_contracts/data.rs` |
| Named training and other crawl | Named, allowed | `ALLOWED_TRAINING_CRAWLERS` in the same file |
| `training` | Allowed through `*` | `left-to-wildcard.json` |
| `search_unverified` | Allowed through `*` | `left-to-wildcard.json` |
| `other` | Allowed through `*` | `left-to-wildcard.json` |

`training` holds agents the list says collect data to train models or to sell.
`search_unverified` holds agents the list says answer or index for search, whose
operator page was not read or does not name the token. `other` holds browser and
coding agents, commerce and advertising fetchers, and agents whose use is unclear.
Every class is allowed today: the groups differ only in what the file states.

3 cases in `search_unverified` and `other` were checked and left unnamed. Brave
says its crawler 'does not advertise a differentiated user agent', so `Bravebot`
names nothing Brave documents. Kagi documents `Kagibot`, not `kagi-fetcher`.
`Google-NotebookLM` is a former token, 'supported until August 2026'; its successor
`Google-GeminiNotebook` is named. `Claude-Search`, `Claude-Web` and `anthropic-ai`
left `robots.txt` on 5 November 2026 because Anthropic's page names only
`ClaudeBot`, `Claude-User` and `Claude-SearchBot`.

## Operator pages for the search and citation class

Read on 5 November 2026. Google, OpenAI, Perplexity, Amazon and Meta each say their
user-triggered fetchers may not apply `robots.txt`, so naming one states this site's
intent and may not control the fetch.

| Agent | Operator's page |
| --- | --- |
| `Googlebot`, `Google-Extended` | [Google's common crawlers](https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers) |
| `Google-GeminiNotebook` | [Google's user-triggered fetchers](https://developers.google.com/crawling/docs/crawlers-fetchers/google-user-triggered-fetchers) |
| `Bingbot` | [Bing's crawlers](https://www.bing.com/webmasters/help/which-crawlers-does-bing-use-8c184ec0) |
| `OAI-SearchBot`, `ChatGPT-User` | [OpenAI's crawlers](https://developers.openai.com/api/docs/bots) |
| `Claude-SearchBot`, `Claude-User` | [Anthropic's crawlers](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler) |
| `PerplexityBot`, `Perplexity-User` | [Perplexity's crawlers](https://docs.perplexity.ai/guides/bots) |
| `Applebot` | [About Applebot](https://support.apple.com/en-us/119829) |
| `YouBot` | [YouBot](https://docs.you.com/youbot) |
| `MistralAI-Index`, `MistralAI-User` | [Mistral's crawlers](https://docs.mistral.ai/robots) |
| `DuckAssistBot` | [DuckAssistBot](https://duckduckgo.com/duckduckgo-help-pages/results/duckassistbot) |
| `meta-webindexer`, `meta-externalfetcher` | [Meta's web crawlers](https://developers.facebook.com/docs/sharing/webmasters/web-crawlers) |
| `Amzn-SearchBot`, `Amzn-User` | [Amazon's crawlers](https://developer.amazon.com/amazonbot) |

## Moving the pin

Replace `robots.json` with the file from a newer commit, update the commit, date,
count and SHA-256 here and `AI_ROBOTS_LIST_SHA256` in
`scripts/src/site_contracts/data.rs`, then run `site-tools check_seo`. The check
names each new agent to classify and each entry the list has dropped. Do this in
one reviewed pull request, on a schedule of your choosing: the list changes weekly.
