# Note for Cecilie: the Retailer Inbox Helper

Hi Cecilie,

I built a first version of a tool for the retailer emails you answer today. It doesn't send
anything. It prepares a draft, shows you where every fact comes from, and tells you which emails
need you. You stay in charge of what goes out.

**Try it:** https://newworks-inbox-helper.fly.dev (I'll send you the login separately).

## What it does

For each email it finds the product and variant, looks up the answer in our product list **and**
the fact sheets, and drafts a reply. Each email gets a colour:

- 🟢 **Green: ready to send.** Everything asked was found, and both sources agree. Read it, copy it, send it.
- 🟡 **Yellow: check first.** A usable draft, but something needs your eye, and it says what in one
  sentence: a fact we don't have, two sources that disagree, a variant the retailer didn't specify,
  or a "before Christmas" that a lead time can't promise.
- 🔴 **Red: yours.** Price lists, certificates, orders, discontinued products, and anything with
  private customer details.

Of the 30 sample emails: 8 green, 13 yellow, 9 red. Most of the time saved is on the
dimension and spec questions: no more opening the spreadsheet and three PDFs to find one number.

## What it will never do

- **Quote a price.** It only knows retail prices, and wholesale prices aren't something to work out.
  Price questions always come to you.
- **Make up a number.** Every number in a draft is checked against our data before you see it.
- **Guess.** If we don't have the answer, the draft says "I'll check with the team" instead of
  inventing one, or saying "no".
- **Pass on private details.** If an email contains a customer's name, address, phone or ID number,
  those are removed before anything else happens. The AI never sees them.

## What I found in our data

You probably know some of these already:

- **Some answers simply aren't in our data:** lead times for most products (Atlas, Knot, Kizu, the
  lamps), Coupe seat heights, whether Nebra is dimmable, whether the travertine is sealed.
- **Some of our data is wrong.** The Karl-Johan lamp is listed at 10.2 kg, but the fact sheet says
  1.9 kg *including* the box. Some Kizu rows hold the packed weight in the net weight field.
  Kunis Breccia isn't on the Kizu fact sheet. The tool spotted 38 issues like this; they're all on the
  *Data issues* page.
- **Some answers are only on the fact sheets**, such as Tembo's seat height and fabric categories.
  Those categories differ per product: the same fabric can be category C for Covent and B for Tembo.

## What I'd need from you

1. **Use it for a week** next to your normal routine, and tell me where a draft was wrong or clumsy.
2. **The missing facts:** if you know the lead times or seat heights, adding them makes more emails green.
3. **The data issues:** who can fix the product list? Every fix there helps the website and
   retailers' feeds too, not only this tool.

Thanks,
Luis
