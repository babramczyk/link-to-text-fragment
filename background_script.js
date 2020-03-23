(async (browser) => {
  if (!('fragmentDirective' in window.location)) {
    return;
  }

  const DEBUG = true;

  // https://wicg.github.io/ScrollToTextFragment/#:~:text=It%20is%20recommended,a%20range%2Dbased%20match.
  // Experimenting with 100 instead.
  const EXACT_MATCH_MAX_CHARS = 100;
  const CONTEXT_MAX_WORDS = 5;

  const log = (...args) => {
    if (DEBUG) {
      console.log(...args);
    }
  };

  browser.contextMenus.create({
    title: browser.i18n.getMessage('copy_link'),
    id: 'copy-link',
    contexts: ['all'],
  });

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    const selectedText = info.selectionText;
    if (!selectedText) {
      return;
    }
    try {
      await sendMessageToPage('debug', DEBUG);
    } catch {
      // Ignore
    }
    const textFragmentURL = await createURL(tab.url);
    if (!textFragmentURL) {
      try {
        await sendMessageToPage('failure');
      } catch {
        // Ignore
      }
      return log('😔 Failed to create unique link.\n\n\n');
    }
    await copyToClipboard(textFragmentURL);
  });

  const escapeRegExp = (s) => {
    return s.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  };

  const unescapeRegExp = (s) => {
    return s.replace(/\\([\\^$.*+?()[\]{}|])/g, '$1');
  };

  const encodeURIComponentAndMinus = (text) => {
    return encodeURIComponent(text).replace(/-/g, '%2D');
  };

  const isUniqueMatch = (hayStack, start, end = '') => {
    try {
      const needle = new RegExp(`${start}${end}`, 'gims');
      const matches = [...hayStack.matchAll(needle)];
      log(
          '———\n',
          'RegEx: 👉' + needle.source + '👈\n',
          'Matches:',
          matches,
          '\n———',
      );
      if (matches.length === 1) {
        let matchedText = matches[0][0];
        // Find inner matches where the needle is (at least partly) contained
        // again in the haystack.
        const startNeedle = new RegExp(start, 'ims');
        const endNeedle = new RegExp(end.replace(/^\.\*\?/), 'ims');
        matchedText = matchedText
            .replace(startNeedle, '')
            .replace(endNeedle, '');
        const innerMatches = [...matchedText.matchAll(needle)];
        if (innerMatches.length === 0) {
          return true;
        }
        return false;
      } else if (matches.length === 0) {
        return null;
      }
      return false;
    } catch (err) {
      // This can happen when the regular expression can't be created.
      console.error(err.name, err.message);
      return null;
    }
  };

  const findUniqueMatch = (
      pageText,
      textStart,
      textEnd,
      unique,
      wordsBefore,
      wordsAfter,
      growthDirection,
      prefix = '',
      suffix = '',
  ) => {
    log(
        'prefix: "' +
        prefix +
        '"\n' +
        'textStart: "' +
        textStart +
        '"\n' +
        'textEnd: "' +
        textEnd +
        '"\n' +
        'suffix: "' +
        suffix +
        '"\n' +
        'growth direction: ' +
        growthDirection,
    );
    if (
      wordsAfter.length === 0 &&
      wordsBefore.length > 0 &&
      growthDirection === 'suffix'
    ) {
      // Switch the growth direction.
      growthDirection = 'prefix';
    } else if (
      wordsBefore.length === 0 &&
      wordsAfter.length === 0 &&
      unique === false
    ) {
      // No more search options.
      return {
        prefix: false,
        suffix: false,
      };
    }
    // We need to add outer context before or after the needle.
    if (growthDirection === 'prefix' && wordsBefore.length > 0) {
      const newPrefix = escapeRegExp(wordsBefore.pop());
      prefix = `${newPrefix}${prefix ? ` ${prefix}` : ''}`;
      log('new prefix "' + prefix + '"');
    } else if (wordsAfter.length > 0) {
      const newSuffix = escapeRegExp(wordsAfter.shift());
      suffix = `${suffix ? `${suffix} ` : ''}${newSuffix}`;
      log('new suffix "' + suffix + '"');
    }
    unique = isUniqueMatch(
        pageText,
        `${prefix ? `${prefix}.?` : ''}${textStart}`,
        `${textEnd ? `.*?${textEnd}` : ''}${suffix ? `.?${suffix}` : ''}`,
    );
    if (unique) {
      return {
        prefix: unescapeRegExp(prefix.trim()),
        suffix: unescapeRegExp(suffix.trim()),
      };
    } else if (unique === null) {
      // Couldn't create regular expression. This should rarely happen…
      return {
        prefix: false,
        suffix: false,
      };
    }
    return findUniqueMatch(
        pageText,
        textStart,
        textEnd,
        unique,
        wordsBefore,
        wordsAfter,
        growthDirection,
        prefix,
        suffix,
    );
  };

  const chooseSeedTextStartAndTextEnd = (selection) => {
    const selectedText = selection;
    const selectedWords = selection.split(/\s/g);
    const selectedParagraphs = selection.split(/\n+/g);
    let textStart = '';
    let textEnd = '';
    let textStartGrowthWords = [];
    let textEndGrowthWords = [];
    log('🔎 Beginning our search.', selection);
    // Reminder: `shift()`, `pop()`, and `splice()` all change the array.
    if (selectedParagraphs.length > 1) {
      log('Selection spans multiple boundaries.');
      // Use the first word of the first boundary and the last word of the last
      // boundary.
      const selectedWordsBeforeBoundary = selectedParagraphs
          .shift()
          .split(/\s/g);
      const selectedWordsAfterBoundary = selectedParagraphs.pop().split(/\s/g);
      textStart = selectedWordsBeforeBoundary.shift();
      textEnd = selectedWordsAfterBoundary.pop();
      // Add inner context at the beginning and the end.
      if (CONTEXT_MAX_WORDS > 0) {
        if (selectedWordsBeforeBoundary.length) {
          textStart +=
            ' ' +
            selectedWordsBeforeBoundary.splice(0, CONTEXT_MAX_WORDS).join(' ');
        }
        textStartGrowthWords = selectedWordsBeforeBoundary;
        if (selectedWordsAfterBoundary.length) {
          textEnd =
            selectedWordsAfterBoundary
                .splice(-1 * CONTEXT_MAX_WORDS)
                .join(' ') +
            ' ' +
            textEnd;
        }
        textEndGrowthWords = selectedWordsAfterBoundary;
      }
    } else if (
      selectedWords.length === 1 ||
      selectedText.length <= EXACT_MATCH_MAX_CHARS
    ) {
      log('Selection spans just one boundary and is short enough.');
      // Just use the entire text.
      textStart = selectedText;
    } else {
      log('Selection spans just one boundary, but is too long.');
      // Use the first and the last word of the selection.
      textStart = selectedWords.shift();
      textEnd = selectedWords.pop();
      // Add inner context at the beginning and the end.
      if (CONTEXT_MAX_WORDS > 0) {
        if (selectedWords.length) {
          textStart +=
            ' ' + selectedWords.splice(0, CONTEXT_MAX_WORDS).join(' ');
        }
        // Need to check again since `splice` changes the array.
        if (selectedWords.length) {
          textEnd =
            selectedWords.splice(-1 * CONTEXT_MAX_WORDS).join(' ') +
            ' ' +
            textEnd;
        }
        textStartGrowthWords = selectedWords;
      }
    }
    return {
      textStart: escapeRegExp(textStart.trim()),
      textEnd: escapeRegExp(textEnd.trim()),
      textStartGrowthWords,
      textEndGrowthWords,
    };
  };

  const createURL = async (tabURL) => {
    let pageResponse;
    try {
      pageResponse = await sendMessageToPage('get-text');
    } catch (err) {
      console.error(err.name, err.message);
      return false;
    }
    const {
      selectedText,
      pageText,
      textBeforeSelection,
      textAfterSelection,
      textNodeBeforeSelection,
      textNodeAfterSelection,
      closestElementFragment,
    } = pageResponse;

    tabURL = new URL(tabURL);
    let textFragmentURL = `${tabURL.origin}${tabURL.pathname}${
      closestElementFragment ? `#${closestElementFragment}` : '#'
    }`;

    let {
      textStart,
      textEnd,
      textStartGrowthWords,
      textEndGrowthWords,
    } = chooseSeedTextStartAndTextEnd(selectedText);
    let unique = isUniqueMatch(
        pageText,
        textStart,
        `${textEnd ? `.*?${textEnd}` : ''}`,
    );
    if (unique) {
      // We have a unique match, return it.
      textStart = encodeURIComponentAndMinus(unescapeRegExp(textStart));
      textEnd = textEnd ?
        `,${encodeURIComponentAndMinus(unescapeRegExp(textEnd))}` :
        '';
      return (textFragmentURL += `:~:text=${textStart}${textEnd}`);
    } else if (unique === null) {
      return false;
    }

    // We need to add inner context to textStart.
    if (textStartGrowthWords.length) {
      log('Growing inner context at text start');
      while (textStartGrowthWords.length) {
        const newTextStart = escapeRegExp(textStartGrowthWords.shift());
        textStart = `${textStart} ${newTextStart}`;
        log('new text start "' + textStart + '"');
        unique = isUniqueMatch(
            pageText,
            textStart,
            `${textEnd ? `.*?${textEnd}` : ''}`,
        );
        if (unique) {
          // We have a unique match, return it.
          textStart = encodeURIComponentAndMinus(unescapeRegExp(textStart));
          textEnd = textEnd ?
            `,${encodeURIComponentAndMinus(unescapeRegExp(textEnd))}` :
            '';
          return (textFragmentURL += `:~:text=${textStart}${textEnd}`);
        } else if (unique === null) {
          return false;
        }
      }
    }

    // We need to add inner context to textEnd.
    if (textEndGrowthWords.length) {
      log('Growing inner context at text end');
      while (textEndGrowthWords.length) {
        const newTextEnd = escapeRegExp(textEndGrowthWords.pop());
        textEnd = `${newTextEnd} ${textEnd}`;
        log('new text end "' + textEnd + '"');
        unique = isUniqueMatch(
            pageText,
            textStart,
            `.*?${textEnd}`,
        );
        if (unique) {
          // We have a unique match, return it.
          textStart = encodeURIComponentAndMinus(unescapeRegExp(textStart));
          textEnd = encodeURIComponentAndMinus(unescapeRegExp(textEnd));
          return (textFragmentURL += `:~:text=${textStart}${textEnd}`);
        } else if (unique === null) {
          return false;
        }
      }
    }

    // We need to add outer context. Therefore, use the text before/after in the
    // same node as the selected text, or if there's none, the text in
    // the previous/next node.
    const wordsInTextNodeBeforeSelection = textNodeBeforeSelection ?
      textNodeBeforeSelection.split(/\s/g) :
      [];
    const wordsBeforeSelection = textBeforeSelection ?
      textBeforeSelection.split(/\s/g) :
      [];
    const wordsBefore = wordsBeforeSelection.length ?
      wordsBeforeSelection :
      wordsInTextNodeBeforeSelection;

    const wordsInTextNodeAfterSelection = textNodeAfterSelection ?
      textNodeAfterSelection.split(/\s/g) :
      [];
    const wordsAfterSelection = textAfterSelection ?
      textAfterSelection.split(/\s/g) :
      [];
    const wordsAfter = wordsAfterSelection.length ?
      wordsAfterSelection :
      wordsInTextNodeAfterSelection;

    // Add context either before or after the selected text, depending on
    // where there is more text.
    const growthDirection =
      wordsBefore.length > wordsAfter.length ? 'prefix' : 'suffix';

    let {prefix, suffix} = findUniqueMatch(
        pageText,
        textStart,
        textEnd,
        unique,
        wordsBefore,
        wordsAfter,
        growthDirection,
    );
    if (!prefix && !suffix) {
      return false;
    }
    prefix = prefix ? `${encodeURIComponentAndMinus(prefix)}-,` : '';
    suffix = suffix ? `,-${encodeURIComponentAndMinus(suffix)}` : '';
    textStart = encodeURIComponentAndMinus(textStart);
    textEnd = textEnd ? `,${encodeURIComponentAndMinus(textEnd)}` : '';
    textFragmentURL += `:~:text=${prefix}${textStart}${textEnd}${suffix}`;
    return textFragmentURL;
  };

  const sendMessageToPage = (message, data = null) => {
    return new Promise((resolve, reject) => {
      browser.tabs.query(
          {
            active: true,
            currentWindow: true,
          },
          (tabs) => {
            browser.tabs.sendMessage(
                tabs[0].id,
                {
                  message,
                  data,
                },
                (response) => {
                  if (!response) {
                    return reject(
                        new Error('Failed to connect to the specified tab.'),
                    );
                  }
                  return resolve(response);
                },
            );
          },
      );
    });
  };

  const copyToClipboard = async (url) => {
    // Try to use the Async Clipboard API with fallback to the legacy approach.
    try {
      await sendMessageToPage('success', url);
      const {state} = await navigator.permissions.query({
        name: 'clipboard-write',
      });
      if (state !== 'granted') {
        throw new Error('Clipboard permission not granted');
      }
      await navigator.clipboard.writeText(url);
    } catch {
      const textArea = document.createElement('textarea');
      document.body.append(textArea);
      textArea.textContent = url;
      textArea.select();
      document.execCommand('copy');
      textArea.remove();
    }
    log('🎉', url, '\n\n\n');
  };
})(window.chrome || window.browser);
