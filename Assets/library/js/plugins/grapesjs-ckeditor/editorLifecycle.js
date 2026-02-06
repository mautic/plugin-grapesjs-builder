/**
 * Editor lifecycle helpers for GrapesJS CKEditor.
 */
import { createHtmlElem } from './dom';
import { injectDataStorage, injectEditorInstant } from './iframe';
import { isOpenPanelOverlapGjsToolbar } from './overlap';

export const editorLifecycleMixin = {
  /**
   * Checks if the target element should use inline editor.
   *
   * @param {HTMLElement} target
   * @returns {boolean}
   */
  isInline(target) {
    return this.inline.includes(target.tagName.toLowerCase());
  },

  /**
   * Compiles options for the editor instance based on the target element.
   *
   * @param {HTMLElement} target
   * @returns {Object}
   */
  compileEditorOptions(target) {
    let options = this.isInline(target) ? this.inlineOptions : this.options;
    const compiledOptions = {
      ...(options ? options : {}),
      licenseKey: this.licenseKey
    };

    const fontFamilyConfig = this.mergeFontFamilyOptions(compiledOptions.fontFamily);
    if (fontFamilyConfig) {
      compiledOptions.fontFamily = fontFamilyConfig;
    }

    const headingConfig = this.mergeHeadingOptions(compiledOptions.heading);
    if (headingConfig) {
      compiledOptions.heading = headingConfig;
    }

    const styleConfig = this.mergeStyleDefinitions(compiledOptions.style);
    if (styleConfig) {
      compiledOptions.style = styleConfig;
    }

    return compiledOptions;
  },

  /**
   * Enables the rich text editor on an element.
   *
   * @param {HTMLElement} el - The element to enable editor on
   * @param {Object} rte - The RTE instance (should be this)
   * @returns {Object} - The RTE instance
   */
  enable(el, rte) {
    if (rte && rte !== this) {
      return rte;
    }

    if (rte && rte === this && this.el === el && this.ckeditor) {
      this.focus(el, rte);
      return rte;
    }

    this.latestContent = el.innerHTML;

    const selectedComponent = this.editor && typeof this.editor.getSelected === 'function'
      ? this.editor.getSelected()
      : null;
    this.trackBadgableComponent(selectedComponent);
    this.trackToolbarVisibility();
    const computedWidth = this.updateMenuWidthsBySelection(selectedComponent);

    this.el = el;
    this.display = el.style.display;
    this.inlineMode = this.isInline(el);
    this.editorContainer = createHtmlElem(
      'div',
      el.parentElement,
      {}
    );

    const initializeEditor = () => {
      if (!this.el || this.el !== el) {
        return;
      }

      this.injectFontStyles();

      const optionsKey = this.registerEditorOptions(this.compileEditorOptions(el));
      const reuseEditor = this._Ck5ForGrapesJsData.reuseEditor ? 'true' : 'false';
      this.executeInFrame(
        `${injectEditorInstant.name}('#${this.getElementId(this.editorContainer)}','${optionsKey}',${this.inlineMode ? 'true' : 'false'},${reuseEditor});`
      );

      const toolbarContainer = this.toolbarContainer;
      const toolbarMaxWidth = computedWidth || (this.inlineMode ? this.inlineMenuMaxWidth : this.menuMaxWidth);
      if (toolbarMaxWidth && toolbarContainer) {
        toolbarContainer.style.maxWidth = toolbarMaxWidth;
      }

      if (this.inlineMode) {
        if (['span', 'a'].includes(el.tagName.toLowerCase())) {
          el.style.display = 'inline-block';
        }
        const head = this.frameDoc ? this.frameDoc.querySelector('head') : null;
        if (head) {
          this.inlineStyles = createHtmlElem(
            'style',
            head,
            {
              innerHTML: `.ck-editor__editable>p {display: inline-block; margin-top: 0px !important; margin-bottom: 0px !important;}` +
                `.ck-editor__editable {display: inline-block;}`
            }
          );
        }
      }

      if (toolbarContainer && toolbarContainer.firstChild) {
        this.toolBarMObserver.observe(
          toolbarContainer.firstChild,
          {
            subtree: true,
            childList: true,
            attributes: true
          }
        );
      }

      if (this.el) {
        this.elementObserver.observe(
          this.el,
          {
            subtree: true,
            childList: true,
            attributes: true
          }
        );
      }

      setTimeout(
        () => {
          if (!this.el || this.el !== el) {
            return;
          }

          const ckeditor = this.ckeditor;
          if (!ckeditor) {
            return;
          }

          ckeditor.data.set(this.latestContent);
          this.latestContent = null;
          el.innerHTML = '';

          if (ckeditor.ui && ckeditor.ui.view && ckeditor.ui.view.editable && ckeditor.ui.view.editable.element) {
            el.appendChild(ckeditor.ui.view.editable.element);
          }

          const toolbarWrapper = this.toolbarContainer && this.toolbarContainer.firstChild;
          if (toolbarWrapper && ckeditor.ui && ckeditor.ui.view && ckeditor.ui.view.element) {
            toolbarWrapper.appendChild(ckeditor.ui.view.element);
          }

          if (toolbarMaxWidth && this.toolbarContainer) {
            this.toolbarContainer.style.maxWidth = toolbarMaxWidth;
          }

          this.applyLinkUnderlineNormalization(this.el);
          this.applyIndentationNormalization(this.el);

          this.editor.refresh();
          this.onResize();

          try {
            ckeditor.focus();
          } catch (error) {
            console.warn('GrapesJS CKEditor: unable to focus editor', error);
          }

          const bodyWrapper = this.frameDoc && this.frameDoc.querySelector('.ck-body-wrapper');
          if (bodyWrapper) {
            if (!this._Ck5ForGrapesJsData.bodyWrapperMouseDownHandler) {
              this._Ck5ForGrapesJsData.bodyWrapperMouseDownHandler = e => {
                e.stopPropagation();
                e.stopImmediatePropagation();
              };
            }
            if (!this._Ck5ForGrapesJsData.bodyWrapperClickHandler) {
              this._Ck5ForGrapesJsData.bodyWrapperClickHandler = e => {
                e.stopPropagation();
                e.stopImmediatePropagation();
              };
            }
            bodyWrapper.addEventListener(
              'mousedown',
              this._Ck5ForGrapesJsData.bodyWrapperMouseDownHandler
            );
            bodyWrapper.addEventListener(
              'click',
              this._Ck5ForGrapesJsData.bodyWrapperClickHandler
            );
            this._Ck5ForGrapesJsData.bodyWrapperEl = bodyWrapper;
          }

          this.setCaret();
        }
      );
    };

    const finalizeInitialization = () => initializeEditor();

    this.ensureFontConfig()
      .catch(() => [])
      .then(() => finalizeInitialization());
    return this;
  },

  /**
   * Sets the caret position in the editor based on the last click event.
   */
  setCaret() {
    if (!this.latestClickEvent) return;
    let e = this.latestClickEvent;
    let range = null;
    let textNode;
    let offset;
    if (document.caretRangeFromPoint) {
      range = this.frameDoc.caretRangeFromPoint(e.clientX, e.clientY);
      textNode = range.startContainer;
      offset = range.startOffset;
    } else if (document.caretPositionFromPoint) {
      range = this.frameDoc.caretPositionFromPoint(e.clientX, e.clientY);
      textNode = range.offsetNode;
      offset = range.offset;
    }
    if (range) {
      range = this.frameDoc.createRange();
      let sel = this.frameContentWindow.getSelection();
      range.setStart(textNode, offset)
      range.collapse(true)
      sel.removeAllRanges();
      sel.addRange(range);
    }
    this.latestClickEvent = null;
  },

  /**
   * Focuses the editor.
   *
   * @param {HTMLElement} el
   * @param {Object} rte
   */
  focus(el, rte) {
    if (rte && rte !== this) {
      return;
    }

    if (el && this.el !== el) {
      this.el = el;
    }

    if (el) {
      el.contentEditable = true;
    }

    const ckeditor = this.ckeditor;
    if (ckeditor && typeof ckeditor.focus === 'function') {
      try {
        ckeditor.focus();
      } catch (error) {
        console.warn('GrapesJS CKEditor: unable to focus editor', error);
      }
    }

    this.setCaret();
  },

  /**
   * Tracks the 'badgable' state of a component to temporarily disable it.
   *
   * @param {Object} component
   */
  trackBadgableComponent(component) {
    if (!component || typeof component.get !== 'function' || typeof component.set !== 'function') {
      this.badgableInfo = null;
      return;
    }

    let previousState;
    try {
      previousState = component.get('badgable');
    } catch (error) {
      previousState = undefined;
    }

    const shouldRestore = previousState !== false;
    if (!shouldRestore) {
      this.badgableInfo = null;
      return;
    }

    this.badgableInfo = {
      component,
      previousState
    };

    try {
      component.set('badgable', false);
    } catch (error) {
      console.warn('GrapesJS CKEditor: unable to disable badgable on component', error);
      this.badgableInfo = null;
    }
  },

  /**
   * Restores the 'badgable' state of the tracked component.
   */
  restoreBadgableComponent() {
    if (!this.badgableInfo) {
      return;
    }

    const { component, previousState } = this.badgableInfo;
    this.badgableInfo = null;

    if (!component || typeof component.set !== 'function') {
      return;
    }

    const targetState = typeof previousState === 'boolean' ? previousState : true;

    try {
      component.set('badgable', targetState);
    } catch (error) {
      console.warn('GrapesJS CKEditor: unable to restore badgable on component', error);
    }
  },

  /**
   * Tracks the current toolbar visibility state to hide it during editing.
   */
  trackToolbarVisibility() {
    this.restoreToolbarVisibility();

    const canvas = this.editor && this.editor.Canvas;
    const getToolbar = canvas && typeof canvas.getToolbarEl === 'function' ? () => canvas.getToolbarEl() : null;
    if (!getToolbar) {
      this.toolbarVisibilityInfo = null;
      return;
    }

    const toolbarEl = getToolbar();
    if (!toolbarEl) {
      this.toolbarVisibilityInfo = null;
      return;
    }

    const info = {
      toolbarEl,
      previousDisplay: toolbarEl.style.display,
      previousVisibility: toolbarEl.style.visibility,
      previousPointerEvents: toolbarEl.style.pointerEvents,
      listener: null
    };

    const hideToolbar = () => {
      const target = getToolbar ? (getToolbar() || toolbarEl) : toolbarEl;
      if (!target) {
        return;
      }

      info.toolbarEl = target;
      target.style.display = 'none';
      target.style.visibility = 'hidden';
      target.style.pointerEvents = 'none';
    };

    hideToolbar();

    if (typeof this.editor.on === 'function') {
      const listener = () => hideToolbar();
      this.editor.on('canvas:tools:update', listener);
      info.listener = listener;
    }

    this.toolbarVisibilityInfo = info;
  },

  /**
   * Restores the GrapesJS toolbar visibility.
   */
  restoreToolbarVisibility() {
    if (!this.toolbarVisibilityInfo) {
      return;
    }

    const { toolbarEl, previousDisplay, previousVisibility, previousPointerEvents, listener } = this.toolbarVisibilityInfo;

    if (listener && typeof this.editor.off === 'function') {
      try {
        this.editor.off('canvas:tools:update', listener);
      } catch (error) {
        console.warn('GrapesJS CKEditor: failed to detach toolbar listener', error);
      }
    }

    if (toolbarEl) {
      toolbarEl.style.display = typeof previousDisplay === 'string' ? previousDisplay : '';
      toolbarEl.style.visibility = typeof previousVisibility === 'string' ? previousVisibility : '';
      toolbarEl.style.pointerEvents = typeof previousPointerEvents === 'string' ? previousPointerEvents : '';
    }

    this.toolbarVisibilityInfo = null;
  },

  /**
   * Gets the content from the editor, applying normalizations.
   *
   * @returns {string}
   */
  getContent() {
    const ckeditor = this.ckeditor;
    let ckeditorContent = ckeditor && ckeditor.data ? ckeditor.data.get() : '';
    if (typeof ckeditorContent !== "string") ckeditorContent = "";
    const baseContent = this.latestContent === null ? (
      this.inlineMode ?
        ckeditorContent.replace(/^<p>/, '').replace(/<\/p>$/, '') :
        ckeditorContent
    ) : this.latestContent;

    return this.normalizeListMarkerStyles(this.normalizeIndentationStyles(this.normalizeLinkUnderlineColors(baseContent)));
  },

  /**
   * Gets content for the interface (GrapesJ).
   *
   * @param {HTMLElement} el
   * @param {Object} rte
   * @returns {string}
   */
  getContentForInterface(el, rte) {
    if (rte && rte !== this) {
      return el && typeof el.innerHTML === 'string' ? el.innerHTML : '';
    }

    if (!this.isActive) {
      return el && typeof el.innerHTML === 'string' ? el.innerHTML : '';
    }

    return this.getContent();
  },

  /**
   * Disables the editor and cleans up.
   *
   * @param {HTMLElement} el
   * @param {Object} rte
   */
  disable(el, rte) {
    if (rte && rte !== this) {
      return;
    }

    this.restoreBadgableComponent();
    this.restoreToolbarVisibility();

    if (this.el) {
      let content = this.getContent();
      this.toolBarMObserver.disconnect();
      this.elementObserver.disconnect();
      this.gjsToolBarMObserver.disconnect();
      const toolbarContainer = this.toolbarContainer;
      const ckeditor = this.ckeditor;
      const frameWindow = this.frameContentWindow;
      if (frameWindow && this._Ck5ForGrapesJsData.frameScrollHandler) {
        frameWindow.removeEventListener('scroll', this._Ck5ForGrapesJsData.frameScrollHandler);
      }
      if (frameWindow && this._Ck5ForGrapesJsData.frameResizeHandler) {
        frameWindow.removeEventListener('resize', this._Ck5ForGrapesJsData.frameResizeHandler);
      }
      if (this._Ck5ForGrapesJsData.frameBodyEl && this._Ck5ForGrapesJsData.frameBodyMouseDownHandler) {
        this._Ck5ForGrapesJsData.frameBodyEl.removeEventListener(
          'mousedown',
          this._Ck5ForGrapesJsData.frameBodyMouseDownHandler
        );
      }
      if (this._Ck5ForGrapesJsData.bodyWrapperEl) {
        if (this._Ck5ForGrapesJsData.bodyWrapperMouseDownHandler) {
          this._Ck5ForGrapesJsData.bodyWrapperEl.removeEventListener(
            'mousedown',
            this._Ck5ForGrapesJsData.bodyWrapperMouseDownHandler
          );
        }
        if (this._Ck5ForGrapesJsData.bodyWrapperClickHandler) {
          this._Ck5ForGrapesJsData.bodyWrapperEl.removeEventListener(
            'click',
            this._Ck5ForGrapesJsData.bodyWrapperClickHandler
          );
        }
      }
      const reuseEditor = !!this._Ck5ForGrapesJsData.reuseEditor;
      if (!reuseEditor && this.inFrameData && this.inFrameData.tipObserver) {
        try {
          this.inFrameData.tipObserver.disconnect();
        } catch (error) {
          console.warn('GrapesJS CKEditor: unable to disconnect tip observer', error);
        }
        this.inFrameData.tipObserver = null;
      }

      const finalizeCleanup = () => {
        if (this.inFrameData) {
          if (!reuseEditor) {
            this.inFrameData.editor = null;
          }
          this.inFrameData.toolbarContainer = null;
        }
        toolbarContainer && toolbarContainer.remove();
        this.inlineStyles && this.inlineStyles.remove();
        this.inlineStyles = null;
        this._Ck5ForGrapesJsData.frameBodyEl = null;
        this._Ck5ForGrapesJsData.bodyWrapperEl = null;
        this.el.innerHTML = content;
        this.el.style.display = this.display;
        this.el.contentEditable = false;
        this.el = null;
        this.editorContainer && this.editorContainer.remove();
        this.editorContainer = null;
        this.latestContent = null;
        this.display = undefined;
        this.latestClickEvent = null;
      };

      if (reuseEditor) {
        finalizeCleanup();
      } else if (ckeditor && typeof ckeditor.destroy === 'function') {
        Promise.resolve(ckeditor.destroy())
          .catch(error => {
            console.warn('GrapesJS CKEditor: unable to destroy editor', error);
          })
          .then(() => {
            if (ckeditor._context && typeof ckeditor._context.destroy === 'function') {
              ckeditor._context.destroy();
            }
          })
          .then(() => finalizeCleanup());
      } else {
        if (ckeditor && ckeditor._context && typeof ckeditor._context.destroy === 'function') {
          ckeditor._context.destroy();
        }
        finalizeCleanup();
      }
    }
  },

  /**
   * Injects the CKEditor script and data storage into the iframe.
   *
   * @param {string} src
   */
  injectEditorModule(src) {
    createHtmlElem(
      'style',
      document.querySelector('head'),
      {
        innerHTML: `.gjs-rte-toolbar {opacity: 0;}`
      }
    );

    let body = this.frameBody;
    createHtmlElem(
      'script',
      body, {
      src: src
    }
    ).onload =
      () => setTimeout(
        () => {
          [...this.frameDoc.querySelectorAll('style')].find(
            item => {
              let innerHTML = item.innerHTML;
              let match = innerHTML.match(/.ck.ck-editor__editable_inline ?{[^}]*(overflow:[^;]*;)[^}]*}/);
              if (match) {
                item.innerHTML = innerHTML.replace(match[0], '');
                createHtmlElem(
                  'style',
                  item.parentNode,
                  {
                    innerHTML: `.ck-toolbar {border-bottom-width: 1px !important;}` +
                      `.ck.ck-editor__editable.ck-focused:not(.ck-editor__nested-editable) {border: none !important;box-shadow: none !important;} 
                       .ck.ck-dropdown .ck-dropdown__panel.ck-dropdown__panel-visible { max-height: 200px; overflow-y: auto; } `
                  }
                );
              }
              return match;
            }
          );
        }
      );
    createHtmlElem(
      'script',
      body,
      {
        innerHTML: `${injectEditorInstant.toString()}; function _typeof(obj) { return typeof obj; }`
      }
    );
    this.executeInFrame(
      `(${injectDataStorage.toString()})()`
    );
    if (!this._Ck5ForGrapesJsData.frameScrollHandler) {
      this._Ck5ForGrapesJsData.frameScrollHandler = this.onResize.bind(this);
    }
    if (!this._Ck5ForGrapesJsData.frameResizeHandler) {
      this._Ck5ForGrapesJsData.frameResizeHandler = this.onResize.bind(this);
    }
    this.frameContentWindow.addEventListener(
      'scroll',
      this._Ck5ForGrapesJsData.frameScrollHandler
    );
    this.frameContentWindow.addEventListener(
      'resize',
      this._Ck5ForGrapesJsData.frameResizeHandler
    );
  },

  /**
   * Executes code within the iframe context.
   *
   * @param {string} code
   */
  executeInFrame(code) {
    createHtmlElem(
      'script',
      this.frameBody,
      {
        innerHTML: code
      }
    ).remove();
  },

  /**
   * Gets or generates a unique ID for an element.
   *
   * @param {HTMLElement} el
   * @returns {string}
   */
  getElementId(el) {
    return el.id = el.id === '' || el.id === null || el.id === undefined ? `ckeditor_target_el_${this.uniqId}` : el.id;
  },

  /**
   * Adjusts the GrapesJS toolbar opacity if it overlaps with panels.
   */
  tuneGjsToolbar() {
    const gjsToolbar = this.gjsToolbar;
    if (gjsToolbar) {
      if (this.isActive && isOpenPanelOverlapGjsToolbar(this.toolbarContainer, gjsToolbar, this.frame)) {
        gjsToolbar.style.opacity = 0;
        gjsToolbar.style.pointerEvents = 'none';
      } else {
        gjsToolbar.style.opacity = 'unset';
        gjsToolbar.style.pointerEvents = 'all';
      }
    }
  },

  /**
   * Updates toolbar max widths based on selection.
   *
   * @param {Object} component
   * @returns {string|null}
   */
  updateMenuWidthsBySelection(component) {
    const targetComponent = component || (this.editor && typeof this.editor.getSelected === 'function' ? this.editor.getSelected() : null);
    const element = targetComponent && typeof targetComponent.getEl === 'function' ? targetComponent.getEl() : null;
    const width = element && typeof element.getBoundingClientRect === 'function' ? element.getBoundingClientRect().width : null;
    if (!Number.isFinite(width) || width <= 0) {
      return null;
    }

    const minWidth = 445;
    const widthValue = `${Math.max(width, minWidth)}px`;
    this._Ck5ForGrapesJsData.menuMaxWidth = widthValue;
    this._Ck5ForGrapesJsData.inlineMenuMaxWidth = widthValue;

    return widthValue;
  },

  /**
   * Positions the toolbar relative to the edited element.
   */
  positionToolbar() {
    if (this.toolbarContainer && this.toolbarContainer.firstChild.firstChild) {
      this.toolbarContainer.style.display = '';
      this.toolbarContainer.style.top = '0px';
      this.toolbarContainer.style.left = '0px';
      const gjsToolbar = this.gjsToolbar;
      gjsToolbar && this.gjsToolBarMObserver.observe(
        gjsToolbar,
        {
          subtree: false,
          childList: false,
          attributes: true
        }
      )
      setTimeout(this.tuneGjsToolbar.bind(this));
      const gjsToolbarBoundingRect = (gjsToolbar && gjsToolbar.getBoundingClientRect()) ||
        { width: 0, height: 0, bottom: 0 };
      let toolBarBoundingRect = this.toolbarContainer.getBoundingClientRect();
      const elBoundingRect = this.el.getBoundingClientRect();
      const gjsToolbarHSpace = 1;
      const gjsToolbarToScreenBorderSpace = 5;
      const gjsToolbarVSpace = 1;
      let left, top;

      // Should we center toolbar
      const center = toolBarBoundingRect.width > elBoundingRect.width - gjsToolbarBoundingRect.width - gjsToolbarHSpace;
      if (center) {
        left = elBoundingRect.left - (toolBarBoundingRect.width - elBoundingRect.width) / 2 + this.frameScrollX;
        if (left + toolBarBoundingRect.width > this.frameBody.offsetWidth) {
          left -= left + toolBarBoundingRect.width - this.frameBody.offsetWidth + gjsToolbarToScreenBorderSpace;
        }
        if (left < this.frameScrollX) left = this.frameScrollX;
      } else {
        left = elBoundingRect.left + this.frameScrollX;
      }
      this.toolbarContainer.style.left = left + 'px';

      toolBarBoundingRect = this.toolbarContainer.getBoundingClientRect();
      top = (
        elBoundingRect.top + this.frameScrollY - toolBarBoundingRect.height - gjsToolbarVSpace -
        (center ? gjsToolbarBoundingRect.height : 0)
      );
      if (top <= this.frameScrollY) {
        top = (
          elBoundingRect.bottom + this.frameScrollY + gjsToolbarVSpace +
          (
            center && gjsToolbarBoundingRect.bottom > elBoundingRect.bottom ? gjsToolbarBoundingRect.height : 0
          )
        );
      }
      this.toolbarContainer.style.top = top + 'px';
    } else {
      this.toolbarContainer.style.display = 'none';
      setTimeout(this.tuneGjsToolbar.bind(this));
    }
  },

  /**
   * Registers options in the iframe registry.
   *
   * @param {Object} options
   * @returns {string}
   */
  registerEditorOptions(options) {
    if (!this.frameContentWindow) {
      return '';
    }

    const frameData = this.frameContentWindow.grapesjsCkeditorData || (this.frameContentWindow.grapesjsCkeditorData = {});
    const registry = frameData.optionsRegistry || (frameData.optionsRegistry = {});

    const key = `options_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    registry[key] = options;

    return key;
  },

  /**
   * Resize handler to reposition toobar.
   */
  onResize() {
    if (this.isActive) {
      this.positionToolbar();
    }
  }
};
