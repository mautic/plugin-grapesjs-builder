/**
 * Injects data storage object into window.
 */
export function injectDataStorage() {
  window.grapesjsCkeditorData = {
    optionsRegistry: {}
  };
}

/**
 * Instantiates the editor instantly using options from registry.
 *
 * @param {string} selector
 * @param {string} optionsKey
 * @param {boolean} forceBr
 */
export function injectEditorInstant(selector, optionsKey, forceBr, reuseEditor) {
  const normalizeFeedItems = (items) => Array.from(items || []);
  const toMentionFeedPromise = (feed, queryText) => Promise.resolve(feed(queryText))
    .then(normalizeFeedItems)
    .catch(err => {
      console.error('Mention feed error:', err);
      return [];
    });

  const wrapMentionFeed = (feed) => (queryText) => new Promise(resolve => {
    toMentionFeedPromise(feed, queryText).then(resolve);
  });

  const normalizeMentionFeeds = (mentionConfig) => {
    if (!mentionConfig || !Array.isArray(mentionConfig.feeds)) {
      return;
    }

    mentionConfig.feeds.forEach(feedConfig => {
      if (typeof feedConfig.feed === 'function') {
        feedConfig.feed = wrapMentionFeed(feedConfig.feed);
      }
    });
  };

  const registry = window.grapesjsCkeditorData && window.grapesjsCkeditorData.optionsRegistry;
  const options = registry && optionsKey ? registry[optionsKey] : {};
  if (registry && optionsKey) {
    delete registry[optionsKey];
  }
  const attachToolbarContainer = () => {
    if (window.grapesjsCkeditorData.toolbarContainer) {
      try {
        window.grapesjsCkeditorData.toolbarContainer.remove();
      } catch (err) {
      }
      window.grapesjsCkeditorData.toolbarContainer = null;
    }

    window.grapesjsCkeditorData.toolbarContainer = createHtmlElem(
      'div',
      document.body,
      {
        style: {
          position: 'absolute',
          top: '0px',
          bottom: '0px',
          height: 'min-content'
        }
      }
    );
    createHtmlElem(
      'div',
      window.grapesjsCkeditorData.toolbarContainer,
      {}
    );
    window.grapesjsCkeditorData.toolbarContainer.addEventListener(
      'mousedown',
      e => {
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    );
  };

  const ensureTipObserver = () => {
    const applyTipClass = () => {
      const buttons = document.querySelectorAll('.ck-button');
      buttons.forEach(btn => {
        if (!btn.classList.contains('token-tip-active') && btn.textContent.includes("Tip: Type '{'")) {
          btn.classList.add('token-tip-active');
        }
      });
    };

    if (window.grapesjsCkeditorData.tipObserver) {
      return;
    }

    const observer = new MutationObserver(applyTipClass);
    window.grapesjsCkeditorData.tipObserver = observer;
    observer.observe(document.body, { childList: true, subtree: true });
    applyTipClass();
  };

  const configureEditor = (editorInstance) => {
    // Try to find CKEditor's toolbar element via the editor instance
    try {
      const rootEl = editorInstance.ui && editorInstance.ui.view && editorInstance.ui.view.element ? editorInstance.ui.view.element : null;
      const toolbarEl = rootEl ? rootEl.querySelector('.ck-toolbar') : null;
      if (toolbarEl) {
        // Hide toolbar initially
        try { toolbarEl.style.display = 'none'; } catch (err) { }

        // Show toolbar after 2 seconds using the editor object (accessing DOM through the editor)
        setTimeout(() => {
          try {
            // Prefer any API-backed toolbar element if available, fallback to DOM node
            const tb = (editorInstance.ui && editorInstance.ui.view && editorInstance.ui.view.element && editorInstance.ui.view.element.querySelector('.ck-toolbar')) || toolbarEl;
            if (tb) tb.style.display = '';
          } catch (err) {
            console.warn('GrapesJS CKEditor: unable to reveal toolbar', err);
          }
        }, 100);
      }
    } catch (err) {
      console.warn('GrapesJS CKEditor: toolbar manipulation failed', err);
    }

    if (forceBr && !window.grapesjsCkeditorData.forceBrApplied) {
      try {
        editorInstance.editing.view.document.on(
          'keydown',
          (event, data) => {
            if (data.keyCode === 13) {
              data.shiftKey = true;
            }
          },
          { priority: 'highest' }
        );
        window.grapesjsCkeditorData.forceBrApplied = true;
      } catch (err) {
        console.warn('GrapesJS CKEditor: unable to apply forceBr handler', err);
      }
    }

    ensureTipObserver();
  };

  const createEditor = () => {
    attachToolbarContainer();

    (window.CKEDITOR ? CKEDITOR.ClassicEditor : ClassicEditor).create(
      document.querySelector(selector),
      options
    ).then(
      e => {
        window.grapesjsCkeditorData.editor = e;
        configureEditor(e);
      }
    ).catch(
      error => {
        console.error(error);
      }
    );
  };

  const existingEditor = window.grapesjsCkeditorData.editor;
  if (reuseEditor && existingEditor) {
    attachToolbarContainer();
    configureEditor(existingEditor);
  } else if (existingEditor && typeof existingEditor.destroy === 'function') {
    Promise.resolve(existingEditor.destroy())
      .catch(err => {
        console.warn('GrapesJS CKEditor: unable to destroy previous editor', err);
      })
      .then(() => {
        window.grapesjsCkeditorData.editor = null;
        window.grapesjsCkeditorData.forceBrApplied = false;
        createEditor();
      });
  } else {
    createEditor();
  }

  // Cross-frame iterable fix: Ensure mention feeds return a local array (iterable in this window)
  normalizeMentionFeeds(options && options.mention ? options.mention : null);


  /**
   *
   * @param {string} type
   * @param {HTMLElement} container
   * @param {Object} properties
   * @return {HTMLElement}
   */
  function createHtmlElem(type, container, properties) {
    const elem = document.createElement(type);
    setElementProperty(elem, properties);
    if (container) {
      container.appendChild(elem);
    }
    return elem;
  }

  /**
   *
   * @param {Object} elem
   * @param {Object} properties
   */
  function setElementProperty(elem, properties) {
    if (properties) {
      for (const key in properties) {
        if (_typeof(properties[key]) === 'object') {
          setElementProperty(elem[key], properties[key]);
        } else {
          elem[key] = properties[key];
        }
      }
    }
  }
}
