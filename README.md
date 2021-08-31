# Link to Text Fragment (Fork)

This repo is a fork of [one from Google](https://github.com/GoogleChromeLabs/link-to-text-fragment) that generates [Text Fragment links](https://wicg.github.io/ScrollToTextFragment/) based on the current selection in a webpage.

## Why?

When taking notes in [my](https://github.com/babramczyk/wiki) [wiki](https://wiki.abramczyk.dev), I typically do so by highlighting text on a webpage to append it to my register. When done researching, I'll dump the clipboard into a wiki page, and organize if I think I need to.

But I do more than just copy -- I also include a `source` link at the end of each copied note, so that I can remember where I read something. Those links are _much_ more useful if they point right to the text on the page. Luckily, the Text Fragment spec was implemented by Chrome recently, so I leverage that.

For a while, I generated this by running some custom JXA code in an Alfred workflow. Unfortunately, my custom logic was not nearly as sophisticated as Google's was, and was broken in some cases; so I needed a way to execute the JavaScript their Chrome extension was running, from my Alfred workflow (which basically meant from AppleScript).

So, long story short, I forked the repo, made some tweaks where necessary, bundled it into a one-liner with [esbuild](https://github.com/evanw/esbuild#readme), then ran it from AppleScript like this:

```AppleScript
activeTab.execute({
  javascript: 'script_here',
});
```

Now, I can even more easily capture memories when researching, and go _exactly_ to where the memory came from. For me, that's been _**incredibly**_ powerful.
