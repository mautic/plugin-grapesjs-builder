/**
 * Ck5ForGrapesJs Plugin Authorization
 * Developed by: DevFuture.pro
 * @param {Object} editor - GrapesJS Editor instance
 * @param {Object} options - Plugin options
 */
export default (editor, options) => {
  new Ck5ForGrapesJs(editor, options);
}

/**
 * Main Class for CkEditor 5 integration with GrapesJS
 */
class Ck5ForGrapesJs {

  /**
   * Constructor
   *
   * @param {Object} editor - GrapesJS Editor instance
   * @param {Object} options - Plugin options
   * @param {string} options.ckeditor_module - URL or path to the CKEditor script
   * @param {Array<string>} options.inline - Array of tags to use inline editor for
   * @param {Object} options.inline_options - Options for inline editor
   * @param {Object} options.options - General CKEditor options
   * @param {string} options.licenseKey - CKEditor License Key
   * @param {string} options.toolbar_max_width - Max width for toolbar
   * @param {string} options.inline_toolbar_max_width - Max width for inline toolbar
   * @param {boolean} options.parse_content - Whether to parse content
   * @param {string} options.theme_alias - Theme alias for configuration
   */
  constructor(
    editor,
    {
      ckeditor_module, inline, inline_options,
      options, licenseKey, toolbar_max_width,
      inline_toolbar_max_width, parse_content,
      theme_alias
    } = {
        ckeditor_module: 'https://cdn.ckeditor.com/ckeditor5/35.2.1/super-build/ckeditor.js',
        inline: [],
        inline_options: options,
        options: undefined,
        licenseKey: undefined,
        toolbar_max_width: undefined,
        inline_toolbar_max_width: undefined,
        parse_content: false,
        theme_alias: undefined
      }
  ) {
    const initialThemeAlias = typeof theme_alias === 'string' && theme_alias.trim() ? theme_alias.trim() : null;
    this._managedLinkColorElements = new WeakSet();

    this._Ck5ForGrapesJsData = {
      editor: editor,
      frame: null,
      licenseKey: licenseKey,
      inline: Array.isArray(inline) ? inline.map(item => item.toLowerCase()) : [],
      inline_options: inline_options,
      options: options,
      el: null,
      toolBarMObserver: new MutationObserver(this.onResize.bind(this)),
      elementObserver: new MutationObserver(
        () => {
          this.applyLinkUnderlineNormalization(this.el);
          this.applyIndentationNormalization(this.el);
          this.applyListMarkerNormalization(this.el);
          this.onResize();
          this.editor.refresh();
        }
      ),
      gjsToolBarMObserver: new MutationObserver(this.onResize.bind(this)),
      inlineStyles: null,
      menuMaxWidth: toolbar_max_width,
      inlineMenuMaxWidth: inline_options === options && inline_toolbar_max_width === undefined ? toolbar_max_width : inline_toolbar_max_width,
      inlineMode: true,
      editorContainer: null,
      latestContent: null,
      display: undefined,
      latestClickEvent: null,
      badgableInfo: null,
      toolbarVisibilityInfo: null,
      parseContent: !!parse_content,
      fontConfigPromise: null,
      fontFamilyOptions: [],
      fontStylesheets: [],
      loadedFontStylesheets: [],
      headingOptions: [],
      styleDefinitions: [],
      themeAlias: initialThemeAlias,
      themeAliasSource: initialThemeAlias ? 'options' : null,
      themeConfigUrl: null,
      themeConfigUrlAlias: null,
      baseUrl: null
    };
    if (!initialThemeAlias) {
      this.resolveThemeAlias();
    }
    // Create array copy before clear, forEach will not properly work otherwise
    editor.RichTextEditor.getAll().map(item => item.name).forEach(
      item => editor.RichTextEditor.remove(item)
    );
    // Append editor
    editor.setCustomRte(
      {
        enable: this.enable.bind(this),
        disable: this.disable.bind(this),
        focus: this.focus.bind(this),
        getContent: this.getContentForInterface.bind(this),
        parseContent: this.parseContent
      }
    );
    editor.on('frame:load:before', ({ el }) => {
      const doc = el.contentDocument;
      if (!doc.doctype || doc.doctype.nodeName.toLowerCase() !== "html") {
        doc.open();
        doc.write("<!DOCTYPE html>");
        doc.close();
      }
    });
    editor.on('frame:load', ({ el, model, view }) => {
      this.frame = el;
      this.injectEditorModule(ckeditor_module);
      this.ensureFontConfig().then(() => this.injectFontStyles());
      this.frameBody.addEventListener(
        'mousedown',
        e => this.latestClickEvent = e
      );

      createHtmlElem(
        'style',
        this.frameDoc.querySelector('head'),
        {
          innerHTML: `p{margin-top:0px !important; margin-bottom: 0px !important;} .ck.ck-sticky-panel__content{ border-bottom-width: 1px !important; } ` +
            `.ck-button.token-tip-active { background-color: #fff9c4 !important; border: 1px solid #ffd54f !important; margin: 5px !important; padding: 5px 10px !important; cursor: default !important; pointer-events: none !important; width: calc(100% - 10px) !important; min-height: auto !important; display: block !important; box-shadow: none !important; } ` +
            `.ck-button.token-tip-active .ck-button__label { color: #333 !important; font-weight: normal !important; white-space: normal !important; text-align: left !important; font-size: 13px !important; } ` +
            `.ck-button.token-tip-active.ck-on, .ck-button.token-tip-active.ck-on:not(.ck-disabled):hover { background: #fff9c4 !important; border: 1px solid #ffd54f !important; box-shadow: none !important; } ` +
            `li::marker { color: inherit; font-size: inherit; font-family: inherit; font-weight: inherit; } ` +
            `` +
            `ol { list-style-type: decimal !important; } ol ol { list-style-type: lower-alpha !important; } ol ol ol { list-style-type: lower-roman !important; }`
        }
      )
    }
    );
  }

  /**
   * Resolves the theme alias from various sources (options, window, DOM).
   *
   * @returns {string|null} The resolved theme alias or null.
   */
  resolveThemeAlias() {
    const currentAlias = this._Ck5ForGrapesJsData.themeAlias;
    if (currentAlias) {
      return currentAlias;
    }

    const windowAlias = this.lookupThemeAliasFromWindow();
    if (windowAlias) {
      return this.setThemeAlias(windowAlias, 'window');
    }

    const formAlias = this.lookupThemeAliasFromForm();
    if (formAlias) {
      return this.setThemeAlias(formAlias, 'form');
    }

    return this._Ck5ForGrapesJsData.themeAlias;
  }

  /**
   * Normalizes the theme alias string.
   *
   * @param {string} value - The raw alias value
   * @returns {string|null} Normalized alias or null
   */
  normalizeThemeAlias(value) {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  /**
   * Sets the theme alias and updates the internal state.
   *
   * @param {string} value - The new alias value
   * @param {string} source - The source of the alias ('option', 'window', 'form')
   * @returns {string|null} The accepted alias
   */
  setThemeAlias(value, source) {
    const normalized = this.normalizeThemeAlias(value);
    const current = this._Ck5ForGrapesJsData.themeAlias;

    if (normalized === current) {
      if (normalized && source && this._Ck5ForGrapesJsData.themeAliasSource !== source) {
        this._Ck5ForGrapesJsData.themeAliasSource = source;
      }
      return current;
    }

    this._Ck5ForGrapesJsData.themeAlias = normalized;
    this._Ck5ForGrapesJsData.themeAliasSource = normalized ? (source || null) : null;
    this._Ck5ForGrapesJsData.themeConfigUrl = null;
    this._Ck5ForGrapesJsData.themeConfigUrlAlias = null;
    this._Ck5ForGrapesJsData.fontConfigPromise = null;

    return normalized;
  }

  /**
   * Looks up the theme alias from the global window object.
   * Checks Mautic global and mauticThemeAlias.
   *
   * @returns {string|null}
   */
  lookupThemeAliasFromWindow() {
    if (typeof window === 'undefined') {
      return null;
    }

    const { Mautic: mauticGlobal } = window;
    if (mauticGlobal && typeof mauticGlobal.builderTheme === 'string') {
      const alias = mauticGlobal.builderTheme.trim();
      if (alias) {
        return alias;
      }
    }

    if (typeof window.mauticThemeAlias === 'string') {
      const alias = window.mauticThemeAlias.trim();
      if (alias) {
        return alias;
      }
    }

    return null;
  }

  /**
   * Looks up the theme alias from the document DOM (hidden fields or selected theme).
   *
   * @returns {string|null}
   */
  lookupThemeAliasFromForm() {
    if (typeof document === 'undefined') {
      return null;
    }

    const templateField = document.querySelector('[name$="[template]"]');
    if (templateField && typeof templateField.value === 'string') {
      const alias = templateField.value.trim();
      if (alias) {
        return alias;
      }
    }

    const selectedTheme = document.querySelector('.theme-selected [data-theme]');
    if (selectedTheme) {
      const alias = selectedTheme.getAttribute('data-theme');
      if (typeof alias === 'string' && alias.trim()) {
        return alias.trim();
      }
    }

    return null;
  }

  /**
   * Resolves the base URL for constructing theme config paths.
   *
   * @returns {string} The base URL
   */
  resolveBaseUrl() {
    if (this._Ck5ForGrapesJsData.baseUrl !== null) {
      return this._Ck5ForGrapesJsData.baseUrl;
    }

    let base = null;

    if (typeof mauticBaseUrl !== 'undefined' && typeof mauticBaseUrl === 'string' && mauticBaseUrl.trim()) {
      base = mauticBaseUrl.trim();
    } else if (typeof window !== 'undefined' && typeof window.mauticBaseUrl === 'string' && window.mauticBaseUrl.trim()) {
      base = window.mauticBaseUrl.trim();
    }

    if (!base) {
      base = '/';
    }

    this._Ck5ForGrapesJsData.baseUrl = base;
    return base;
  }

  /**
   * Builds the full URL for the theme configuration JSON file.
   *
   * @param {string} alias - The theme alias
   * @returns {string} The full URL to the config
   */
  buildThemeConfigUrl(alias) {
    const normalizedAlias = encodeURIComponent(alias);
    const baseUrl = this.resolveBaseUrl();
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const relativePath = `themes/${normalizedAlias}/config.json`;

    if (/^https?:\/\//i.test(normalizedBase)) {
      return `${normalizedBase}${relativePath}`;
    }

    if (normalizedBase.startsWith('/')) {
      return `${normalizedBase}${relativePath}`;
    }

    if (typeof window !== 'undefined' && window.location && window.location.origin) {
      try {
        const url = new URL(`${normalizedBase}${relativePath}`, window.location.origin);
        return url.toString();
      } catch (error) {
        console.warn('GrapesJS CKEditor: unable to resolve theme config URL via origin', error);
      }
    }

    return `/${relativePath}`;
  }

  /**
   * Resets the internal font configuration state.
   */
  resetFontConfigState() {
    this._Ck5ForGrapesJsData.fontFamilyOptions = [];
    this._Ck5ForGrapesJsData.fontStylesheets = [];
    this._Ck5ForGrapesJsData.headingOptions = [];
    this._Ck5ForGrapesJsData.styleDefinitions = [];
  }
  /**
   * Merges custom font family options with the base configuration.
   *
   * @param {Object} baseConfig - The base font configuration
   * @returns {Object|null} The merged configuration or null
   */
  mergeFontFamilyOptions(baseConfig) {
    const remoteOptions = Array.isArray(this.fontFamilyOptions) ? this.fontFamilyOptions : [];
    if (!remoteOptions.length) {
      return baseConfig || null;
    }

    const config = baseConfig ? { ...baseConfig } : {};
    const normalizedOptions = remoteOptions.reduce((accumulator, option) => {
      if (!this.containsFontOption(accumulator, option)) {
        accumulator.push({ ...option });
      }
      return accumulator;
    }, []);

    if (!normalizedOptions.some(option => this.isDefaultFontOption(option))) {
      normalizedOptions.unshift('default');
    }

    config.options = normalizedOptions;
    config.supportAllValues = false;

    return config;
  }

  /**
   * Checks if a font option collection contains a specific candidate.
   *
   * @param {Array} collection - Existing options
   * @param {Object|string} candidate - The option to check
   * @returns {boolean}
   */
  containsFontOption(collection, candidate) {
    return collection.some(item => this.fontOptionEquals(item, candidate));
  }

  /**
   * Compares two font options for equality.
   *
   * @param {Object|string} optionA
   * @param {Object|string} optionB
   * @returns {boolean}
   */
  fontOptionEquals(optionA, optionB) {
    const normalize = option => {
      if (typeof option === 'string') {
        return option.trim();
      }

      if (option && typeof option === 'object') {
        if (typeof option.model === 'string') {
          return option.model.trim();
        }

        if (typeof option.title === 'string' && option.model === undefined) {
          return option.title.trim();
        }
      }

      return null;
    };

    const normalizedA = normalize(optionA);
    const normalizedB = normalize(optionB);

    return normalizedA !== null && normalizedB !== null && normalizedA === normalizedB;
  }

  /**
   * Determines if the option represents the default font.
   *
   * @param {Object|string} option
   * @returns {boolean}
   */
  isDefaultFontOption(option) {
    if (typeof option === 'string') {
      return option.trim().toLowerCase() === 'default';
    }

    if (option && typeof option === 'object' && typeof option.model === 'string') {
      return option.model.trim().toLowerCase() === 'default';
    }

    return false;
  }

  /**
   * Merges custom heading options with the base configuration.
   *
   * @param {Object} baseConfig - The base heading configuration
   * @returns {Object|null}
   */
  mergeHeadingOptions(baseConfig) {
    const remoteOptions = Array.isArray(this.headingOptions) ? this.headingOptions : [];
    if (!remoteOptions.length) {
      return baseConfig || null;
    }

    const config = baseConfig ? { ...baseConfig } : {};
    const baseOptions = Array.isArray(config.options) ? config.options.map(option => this.cloneHeadingOption(option)) : [];
    const merged = baseOptions.slice();

    remoteOptions.forEach(option => {
      if (!option || typeof option !== 'object') {
        return;
      }

      const normalizedModel = this.normalizeHeadingModel(option.model);
      const index = merged.findIndex(candidate => this.normalizeHeadingModel(candidate && candidate.model) === normalizedModel);
      const cloned = this.cloneHeadingOption(option);

      if (index >= 0) {
        merged[index] = this.mergeHeadingOption(merged[index], cloned);
      } else {
        merged.push(cloned);
      }
    });

    if (!merged.some(item => this.normalizeHeadingModel(item && item.model) === 'paragraph')) {
      merged.unshift({
        model: 'paragraph',
        title: 'Paragraph',
        class: 'ck-heading_paragraph'
      });
    }

    config.options = merged;
    return config;
  }

  /**
   * Creates a deep copy of a heading option.
   *
   * @param {Object} option
   * @returns {Object}
   */
  cloneHeadingOption(option) {
    if (!option || typeof option !== 'object') {
      return {
        model: '',
        title: '',
        class: ''
      };
    }

    const cloned = {
      ...option
    };

    if (option.view && typeof option.view === 'object') {
      cloned.view = {
        ...option.view
      };
    }

    return cloned;
  }

  /**
   * Merges two heading options, prioritizing the target but combining views.
   *
   * @param {Object} target
   * @param {Object} source
   * @returns {Object}
   */
  mergeHeadingOption(target, source) {
    if (!target || typeof target !== 'object') {
      return this.cloneHeadingOption(source);
    }

    const merged = {
      ...target,
      ...source
    };

    if (target.view || source.view) {
      merged.view = {
        ...(target && target.view ? target.view : {}),
        ...(source && source.view ? source.view : {})
      };
    }

    return merged;
  }

  /**
   * Normalizes the heading model string.
   *
   * @param {string} model
   * @returns {string}
   */
  normalizeHeadingModel(model) {
    return typeof model === 'string' ? model.trim().toLowerCase() : '';
  }

  /**
   * Merges custom style definitions with the base configuration.
   *
   * @param {Object} baseConfig
   * @returns {Object|null}
   */
  mergeStyleDefinitions(baseConfig) {
    const remoteDefinitions = Array.isArray(this.styleDefinitions) ? this.styleDefinitions : [];
    if (!remoteDefinitions.length) {
      return baseConfig || null;
    }

    const config = baseConfig ? { ...baseConfig } : {};
    const baseDefinitions = Array.isArray(config.definitions) ? config.definitions.map(definition => this.cloneStyleDefinition(definition)) : [];
    const merged = baseDefinitions.slice();

    remoteDefinitions.forEach(definition => {
      if (!definition || typeof definition !== 'object') {
        return;
      }

      const index = merged.findIndex(candidate => this.styleDefinitionEquals(candidate, definition));
      const cloned = this.cloneStyleDefinition(definition);

      if (index >= 0) {
        merged[index] = this.mergeStyleDefinition(merged[index], cloned);
      } else {
        merged.push(cloned);
      }
    });

    config.definitions = merged;
    return config;
  }

  /**
   * Creates a deep copy of a style definition.
   *
   * @param {Object} definition
   * @returns {Object|null}
   */
  cloneStyleDefinition(definition) {
    if (!definition || typeof definition !== 'object') {
      return null;
    }

    const cloned = {
      ...definition
    };

    const classes = this.normalizeClassList(definition.classes);
    if (classes.length) {
      cloned.classes = classes.slice();
    } else {
      delete cloned.classes;
    }

    return cloned;
  }

  /**
   * Merges two style definitions.
   *
   * @param {Object} target
   * @param {Object} source
   * @returns {Object}
   */
  mergeStyleDefinition(target, source) {
    if (!target || typeof target !== 'object') {
      return this.cloneStyleDefinition(source);
    }

    const merged = {
      ...target,
      ...source
    };

    const combinedClasses = this.mergeClassLists(target.classes, source.classes);
    if (combinedClasses.length) {
      merged.classes = combinedClasses;
    } else {
      delete merged.classes;
    }

    return merged;
  }

  /**
   * Checks if two style definitions are equal.
   *
   * @param {Object} definitionA
   * @param {Object} definitionB
   * @returns {boolean}
   */
  styleDefinitionEquals(definitionA, definitionB) {
    if (!definitionA || !definitionB) {
      return false;
    }

    const nameA = this.normalizeDefinitionName(definitionA.name);
    const nameB = this.normalizeDefinitionName(definitionB.name);
    if (nameA && nameB) {
      return nameA === nameB;
    }

    const elementA = typeof definitionA.element === 'string' ? definitionA.element.trim().toLowerCase() : '';
    const elementB = typeof definitionB.element === 'string' ? definitionB.element.trim().toLowerCase() : '';

    if (!elementA || !elementB || elementA !== elementB) {
      return false;
    }

    return this.classListEquals(definitionA.classes, definitionB.classes);
  }

  /**
   * Normalizes a style definition name.
   *
   * @param {string} name
   * @returns {string}
   */
  normalizeDefinitionName(name) {
    return typeof name === 'string' ? name.trim().toLowerCase() : '';
  }

  /**
   * Merges two lists of classes, ensuring uniqueness.
   *
   * @param {Array|string} listA
   * @param {Array|string} listB
   * @returns {Array}
   */
  mergeClassLists(listA, listB) {
    const normalizedA = this.normalizeClassList(listA);
    const normalizedB = this.normalizeClassList(listB);

    const combined = [];
    normalizedA.concat(normalizedB).forEach(item => {
      if (!combined.includes(item)) {
        combined.push(item);
      }
    });

    return combined;
  }

  /**
   * Checks if two class lists are equal.
   *
   * @param {Array|string} listA
   * @param {Array|string} listB
   * @returns {boolean}
   */
  classListEquals(listA, listB) {
    const normalizedA = this.normalizeClassList(listA).sort();
    const normalizedB = this.normalizeClassList(listB).sort();

    if (normalizedA.length !== normalizedB.length) {
      return false;
    }

    return normalizedA.every((item, index) => item === normalizedB[index]);
  }

  /**
   * Normalizes a class list into an array of strings.
   *
   * @param {Array|string} value
   * @returns {Array}
   */
  normalizeClassList(value) {
    const result = [];

    const addClass = candidate => {
      if (typeof candidate !== 'string') {
        return;
      }

      const normalized = candidate.trim();
      if (!normalized) {
        return;
      }

      if (!result.includes(normalized)) {
        result.push(normalized);
      }
    };

    if (Array.isArray(value)) {
      value.forEach(addClass);
    } else if (typeof value === 'string') {
      value.split(/\s+/).forEach(addClass);
    }

    return result;
  }

  /**
   * Builds heading options from editor styles.
   *
   * @param {Object} data - Configuration data
   * @returns {Array}
   */
  buildHeadingOptions(data) {
    const styles = data && data.editor && Array.isArray(data.editor.styles) ? data.editor.styles : [];
    if (!styles.length) {
      return [];
    }

    const usedModels = new Set();
    const options = [];

    styles.forEach((style, index) => {
      const option = this.createHeadingOption(style, index, usedModels);
      if (option) {
        usedModels.add(this.normalizeHeadingModel(option.model));
        options.push(option);
      }
    });

    return options;
  }

  /**
   * Creates a heading option from a style definition.
   *
   * @param {Object} style
   * @param {number} index
   * @param {Set} usedModels
   * @returns {Object|null}
   */
  createHeadingOption(style, index, usedModels) {
    if (!style || typeof style !== 'object') {
      return null;
    }

    const element = this.normalizeHeadingElement(style.element || style.tag || style.block);
    if (!element) {
      return null;
    }

    const classes = this.normalizeClassList(style.classes || style.class || style.className);
    const title = this.normalizeStyleName(style.name, element);
    const baseModel = this.buildHeadingModelBase(element);
    if (!baseModel) {
      return null;
    }

    const model = this.ensureUniqueHeadingModel(baseModel, title, classes, usedModels, index);
    const view = this.buildHeadingView(element, classes);
    const dropdownClass = this.buildHeadingDropdownClass(model, element);

    const option = {
      model,
      title,
      class: dropdownClass,
      view
    };

    // Custom heading variants with classes need high priority to be converted before standard headings
    if (classes.length > 0) {
      option.converterPriority = 'high';
    }

    return option;
  }

  /**
   * Normalizes the heading element tag.
   *
   * @param {string} value
   * @returns {string|null}
   */
  normalizeHeadingElement(value) {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    const allowed = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
    return allowed.includes(normalized) ? normalized : null;
  }

  /**
   * Builds the base model name for a heading element.
   *
   * @param {string} element
   * @returns {string|null}
   */
  buildHeadingModelBase(element) {
    if (!element) {
      return null;
    }

    if (element === 'p') {
      return 'paragraph';
    }

    const headingMatch = element.match(/^h([1-6])$/);
    if (headingMatch) {
      return `heading${headingMatch[1]}`;
    }

    return `heading_${element}`;
  }

  /**
   * Ensures the heading model name is unique.
   *
   * @param {string} baseModel
   * @param {string} title
   * @param {Array} classes
   * @param {Set} usedModels
   * @param {number} index
   * @returns {string}
   */
  ensureUniqueHeadingModel(baseModel, title, classes, usedModels, index) {
    if (!usedModels.has(this.normalizeHeadingModel(baseModel))) {
      return baseModel;
    }

    const parts = [];
    const titleSlug = this.slugify(title || '');
    if (titleSlug) {
      parts.push(titleSlug);
    }

    const classSlug = this.slugify(classes.join('-'));
    if (classSlug) {
      parts.push(classSlug);
    }

    if (!parts.length) {
      parts.push(`variant${index}`);
    }

    let candidate = `${baseModel}_${parts.join('_')}`;
    let attempt = 1;
    let normalizedCandidate = this.normalizeHeadingModel(candidate);
    while (usedModels.has(normalizedCandidate) && attempt < 100) {
      candidate = `${baseModel}_${parts.join('_')}_${attempt}`;
      normalizedCandidate = this.normalizeHeadingModel(candidate);
      attempt += 1;
    }

    return candidate;
  }

  /**
   * Builds the view configuration for a heading.
   *
   * @param {string} element
   * @param {Array} classes
   * @returns {Object}
   */
  buildHeadingView(element, classes) {
    const view = {
      name: element
    };

    if (classes.length) {
      view.classes = classes.length === 1 ? classes[0] : classes.slice();
    }

    return view;
  }

  /**
   * Generates the CSS class for the heading dropdown item.
   *
   * @param {string} model
   * @param {string} element
   * @returns {string}
   */
  buildHeadingDropdownClass(model, element) {
    const normalizedModel = this.slugify(model || element || '');
    if (!normalizedModel) {
      return 'ck-heading_custom-option';
    }

    if (this.normalizeHeadingModel(model) === 'paragraph') {
      return 'ck-heading_paragraph';
    }

    return `ck-heading_${normalizedModel}`;
  }

  /**
   * Converts a string into a slug.
   *
   * @param {string} value
   * @returns {string}
   */
  slugify(value) {
    if (typeof value !== 'string') {
      return '';
    }

    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  /**
   * Normalizes a style name.
   *
   * @param {string} name
   * @param {string} element
   * @returns {string}
   */
  normalizeStyleName(name, element) {
    if (typeof name === 'string' && name.trim()) {
      return name.trim();
    }

    if (typeof element === 'string' && element.trim()) {
      return element.trim().toUpperCase();
    }

    return 'Style';
  }

  /**
   * Gets the inline text color from an element.
   *
   * @param {HTMLElement} element
   * @returns {Object|null}
   */
  getInlineTextColor(element) {
    if (!element || !element.style || typeof element.style.getPropertyValue !== 'function') {
      return null;
    }

    const value = element.style.getPropertyValue('color');
    if (!value) {
      return null;
    }

    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    const keyword = normalized.toLowerCase();
    if (['inherit', 'initial', 'unset', 'revert'].includes(keyword)) {
      return null;
    }

    return {
      value: normalized,
      priority: element.style.getPropertyPriority('color') || ''
    };
  }

  /**
   * Determines the effective link color for an anchor.
   * Checks direct style or child elements.
   *
   * @param {HTMLElement} anchor
   * @returns {Object|null}
   */
  determineLinkColor(anchor) {
    if (!anchor) {
      return null;
    }

    const direct = this.getInlineTextColor(anchor);
    if (direct && direct.value) {
      return direct;
    }

    let descriptor = null;
    let value = null;
    let multiple = false;

    anchor.querySelectorAll('[style]').forEach(element => {
      if (multiple) {
        return;
      }

      const candidate = this.getInlineTextColor(element);
      if (!candidate) {
        return;
      }

      if (value === null) {
        value = candidate.value;
        descriptor = candidate;
        return;
      }

      if (value !== candidate.value) {
        multiple = true;
        descriptor = null;
      }
    });

    return multiple ? null : descriptor;
  }

  /**
   * Normalizes link underline colors in HTML content.
   * Ensures underlines match the text color.
   *
   * @param {string} html
   * @returns {string}
   */
  normalizeLinkUnderlineColors(html) {
    if (typeof html !== 'string' || html.indexOf('<a') === -1) {
      return html;
    }

    const implementation = (this.frameDoc && this.frameDoc.implementation) || (typeof document !== 'undefined' ? document.implementation : null);
    if (!implementation || typeof implementation.createHTMLDocument !== 'function') {
      return html;
    }

    const workingDocument = implementation.createHTMLDocument('');
    workingDocument.body.innerHTML = html;

    const anchors = workingDocument.body.querySelectorAll('a');
    anchors.forEach(anchor => {
      const descriptor = this.determineLinkColor(anchor);
      if (!descriptor || !descriptor.value) {
        return;
      }

      anchor.style.setProperty('color', descriptor.value, descriptor.priority);
      anchor.style.setProperty('text-decoration-color', descriptor.value, descriptor.priority);
      anchor.style.setProperty('border-bottom-color', descriptor.value, descriptor.priority);
      this.stripDescendantLinkColors(anchor);
    });

    return workingDocument.body.innerHTML;
  }

  /**
   * Normalizes indentation styles in HTML content.
   *
   * @param {string} html
   * @returns {string}
   */
  normalizeIndentationStyles(html) {
    if (typeof html !== 'string' || (html.indexOf('margin-left') === -1 && html.indexOf('padding-left') === -1)) {
      return html;
    }

    const implementation = (this.frameDoc && this.frameDoc.implementation) || (typeof document !== 'undefined' ? document.implementation : null);
    if (!implementation || typeof implementation.createHTMLDocument !== 'function') {
      return html;
    }

    const workingDocument = implementation.createHTMLDocument('');
    workingDocument.body.innerHTML = html;

    this.applyIndentationNormalization(workingDocument.body);

    return workingDocument.body.innerHTML;
  }

  /**
   * Normalizes list marker styles in HTML content.
   *
   * @param {string} html
   * @returns {string}
   */
  normalizeListMarkerStyles(html) {
    if (typeof html !== 'string' || html.indexOf('<li') === -1) {
      return html;
    }

    const implementation = (this.frameDoc && this.frameDoc.implementation) || (typeof document !== 'undefined' ? document.implementation : null);
    if (!implementation || typeof implementation.createHTMLDocument !== 'function') {
      return html;
    }

    const workingDocument = implementation.createHTMLDocument('');
    workingDocument.body.innerHTML = html;

    this.applyListMarkerNormalization(workingDocument.body);

    return workingDocument.body.innerHTML;
  }

  /**
   * Getter for managed set of link color elements.
   *
   * @returns {WeakSet}
   */
  get managedLinkColorElements() {
    return this._managedLinkColorElements;
  }

  /**
   * Applies an inline style to an element if it's not already set.
   *
   * @param {HTMLElement} element
   * @param {string} property
   * @param {string} value
   * @param {string} priority
   */
  applyInlineStyle(element, property, value, priority) {
    const currentValue = element.style.getPropertyValue(property);
    const currentPriority = element.style.getPropertyPriority(property) || '';
    const normalizedPriority = priority || '';
    if (currentValue === value && currentPriority === normalizedPriority) {
      return;
    }

    element.style.setProperty(property, value, priority);
  }

  /**
   * Removes an inline style property from an element.
   *
   * @param {HTMLElement} element
   * @param {string} property
   */
  clearInlineStyle(element, property) {
    if (!element.style) {
      return;
    }

    element.style.removeProperty(property);
  }

  /**
   * Removes the style attribute if it's empty.
   *
   * @param {HTMLElement} element
   */
  tidyStyleAttribute(element) {
    if (!element || !element.getAttribute) {
      return;
    }

    const styleAttr = element.getAttribute('style');
    if (styleAttr && styleAttr.trim()) {
      return;
    }

    element.removeAttribute('style');
  }

  /**
   * Removes color-related styles from descendant nodes of an anchor.
   *
   * @param {HTMLElement} anchor
   */
  stripDescendantLinkColors(anchor) {
    anchor.querySelectorAll('[style]').forEach(node => {
      this.clearInlineStyle(node, 'color');
      this.clearInlineStyle(node, 'text-decoration-color');
      this.clearInlineStyle(node, 'border-bottom-color');
      this.tidyStyleAttribute(node);
    });
  }

  /**
   * Applies normalization for link underlines to a DOM root.
   *
   * @param {HTMLElement} root
   */
  applyLinkUnderlineNormalization(root) {
    if (!root || typeof root.querySelectorAll !== 'function') {
      return;
    }

    const managed = this.managedLinkColorElements;
    const anchors = root.querySelectorAll('a');
    anchors.forEach(anchor => {
      const descriptor = this.determineLinkColor(anchor);
      if (descriptor && descriptor.value) {
        const { value, priority } = descriptor;
        this.applyInlineStyle(anchor, 'color', value, priority);
        this.applyInlineStyle(anchor, 'text-decoration-color', value, priority);
        this.applyInlineStyle(anchor, 'border-bottom-color', value, priority);
        this.stripDescendantLinkColors(anchor);
        managed.add(anchor);
        return;
      }

      if (!managed.has(anchor)) {
        return;
      }

      this.clearInlineStyle(anchor, 'color');
      this.clearInlineStyle(anchor, 'text-decoration-color');
      this.clearInlineStyle(anchor, 'border-bottom-color');
      this.tidyStyleAttribute(anchor);
      managed.delete(anchor);
    });
  }

  /**
   * Applies normalization for indentation to a DOM root.
   * Moves margins from paragraphs to list items.
   *
   * @param {HTMLElement} root
   */
  applyIndentationNormalization(root) {
    if (!root || typeof root.querySelectorAll !== 'function') {
      return;
    }

    const properties = ['margin-left', 'padding-left', 'margin-right', 'padding-right', 'margin-inline-start', 'margin-inline-end', 'padding-inline-start', 'padding-inline-end'];

    // Move margins from blocks inside list items to the list item itself
    // This prevents the "gap" between bullet and text while preserving indentation
    root.querySelectorAll('li p, li div').forEach(element => {
      const li = element.closest('li');
      if (!li) return;

      properties.forEach(property => {
        const value = element.style.getPropertyValue(property);
        if (value) {
          const priority = element.style.getPropertyPriority(property);
          // Only move if the li doesn't already have this property set
          if (!li.style.getPropertyValue(property)) {
            this.applyInlineStyle(li, property, value, priority);
          }
          element.style.removeProperty(property);
        }
      });
      this.tidyStyleAttribute(element);
    });

    root.querySelectorAll('[style]').forEach(element => {
      properties.forEach(property => {
        const value = element.style.getPropertyValue(property);
        if (value && element.style.getPropertyPriority(property) !== 'important') {
          this.applyInlineStyle(element, property, value, 'important');
        }
      });
    });
  }

  /**
   * Applies normalization for list markers to a DOM root.
   * Ensures markers inherit styles from content.
   *
   * @param {HTMLElement} root
   */
  applyListMarkerNormalization(root) {
    if (!root || typeof root.querySelectorAll !== 'function') {
      return;
    }

    const listItems = root.querySelectorAll('li');
    listItems.forEach(li => {
      // Find the first span with styles that belongs directly to this li (not to a nested li)
      const span = Array.from(li.querySelectorAll('span[style]')).find(s => s.closest('li') === li);
      const properties = ['color', 'font-size', 'font-family', 'font-weight'];

      if (span) {
        properties.forEach(property => {
          const value = span.style.getPropertyValue(property);
          const priority = span.style.getPropertyPriority(property);
          if (value) {
            this.applyInlineStyle(li, property, value, priority);
          } else {
            this.clearInlineStyle(li, property);
          }
        });
      } else {
        properties.forEach(property => this.clearInlineStyle(li, property));
      }

      this.tidyStyleAttribute(li);
    });
  }

  /**
   * Builds style definitions from editor configuration.
   *
   * @param {Object} data
   * @returns {Array}
   */
  buildStyleDefinitions(data) {
    const styles = data && data.editor && Array.isArray(data.editor.styles) ? data.editor.styles : [];
    if (!styles.length) {
      return [];
    }

    const definitions = [];

    styles.forEach((style, index) => {
      const definition = this.createStyleDefinition(style, index);
      if (!definition) {
        return;
      }

      const existingIndex = definitions.findIndex(candidate => this.styleDefinitionEquals(candidate, definition));
      if (existingIndex >= 0) {
        definitions[existingIndex] = this.mergeStyleDefinition(definitions[existingIndex], definition);
      } else {
        definitions.push(definition);
      }
    });

    return definitions;
  }

  /**
   * Creates a style definition from a raw style object.
   *
   * @param {Object} style
   * @param {number} index
   * @returns {Object|null}
   */
  createStyleDefinition(style, index) {
    if (!style || typeof style !== 'object') {
      return null;
    }

    const element = this.normalizeStyleElement(style.element || style.tag || style.block);
    if (!element) {
      return null;
    }

    const classes = this.normalizeClassList(style.classes || style.class || style.className);
    const name = this.normalizeStyleName(style.name, element);
    const type = this.isBlockElement(element) ? 'block' : 'inline';

    const definition = {
      name,
      element,
      type
    };

    if (classes.length) {
      definition.classes = classes.slice();
    }

    if (!definition.name) {
      definition.name = `Style ${index + 1}`;
    }

    return definition;
  }

  /**
   * Normalizes the element name for a style.
   *
   * @param {string} value
   * @returns {string|null}
   */
  normalizeStyleElement(value) {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim().toLowerCase();
    return normalized || null;
  }

  /**
   * Checks if an element is a block element.
   *
   * @param {string} element
   * @returns {boolean}
   */
  isBlockElement(element) {
    const blockElements = ['address', 'article', 'aside', 'blockquote', 'div', 'footer', 'header', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'nav', 'p', 'section'];
    return blockElements.includes(element);
  }

  /**
   * Ensures the font configuration is loaded.
   * Fetches the theme config if available.
   *
   * @returns {Promise<Array>}
   */
  ensureFontConfig() {
    if (this._Ck5ForGrapesJsData.fontConfigPromise) {
      return this._Ck5ForGrapesJsData.fontConfigPromise;
    }

    const fetchFn = typeof window !== 'undefined' && window.fetch ? window.fetch.bind(window) : null;
    if (!fetchFn) {
      this.resetFontConfigState();
      this._Ck5ForGrapesJsData.fontConfigPromise = Promise.resolve([]);
      return this._Ck5ForGrapesJsData.fontConfigPromise;
    }

    const configUrl = this.themeConfigUrl;
    if (!configUrl) {
      this.resetFontConfigState();
      this._Ck5ForGrapesJsData.fontConfigPromise = Promise.resolve([]);
      return this._Ck5ForGrapesJsData.fontConfigPromise;
    }

    const request = fetchFn(configUrl, { cache: 'no-store', credentials: 'same-origin' })
      .then(response => {
        if (response.status === 404) {
          return null;
        }

        if (!response.ok) {
          throw new Error(`Failed to load theme editor config: ${response.status}`);
        }

        return response.json();
      })
      .then(data => {
        if (!data) {
          console.info('GrapesJS CKEditor: theme config not found, skipping editor font overrides', configUrl);
          this.resetFontConfigState();
          this.injectFontStyles();
          return [];
        }

        const parsed = this.extractEditorConfig(data);
        this._Ck5ForGrapesJsData.fontFamilyOptions = parsed.fontFamilyOptions;
        this._Ck5ForGrapesJsData.fontStylesheets = parsed.fontStylesheets;
        this._Ck5ForGrapesJsData.headingOptions = parsed.headingOptions;
        this._Ck5ForGrapesJsData.styleDefinitions = parsed.styleDefinitions;
        this.injectFontStyles();
        return parsed.fontFamilyOptions;
      })
      .catch(error => {
        console.warn('GrapesJS CKEditor: unable to load theme editor config', error);
        this.resetFontConfigState();
        this.injectFontStyles();
        return [];
      });

    this._Ck5ForGrapesJsData.fontConfigPromise = request;
    return request;
  }

  /**
   * Extracts editor configuration from the theme config data.
   *
   * @param {Object} data
   * @returns {Object}
   */
  extractEditorConfig(data) {
    const fonts = data && data.editor && Array.isArray(data.editor.fonts) ? data.editor.fonts : [];
    const fontFamilyOptions = [];
    const fontStylesheets = [];

    const registerFontOption = (title, model) => {
      if (typeof model !== 'string' || !model.trim()) {
        return;
      }

      const normalizedModel = model.trim();
      const normalizedTitle = typeof title === 'string' && title.trim() ? title.trim() : normalizedModel;

      const option = {
        title: normalizedTitle,
        model: normalizedModel,
        view: {
          name: 'span',
          styles: {
            'font-family': normalizedModel
          }
        }
      };

      if (!this.containsFontOption(fontFamilyOptions, option)) {
        fontFamilyOptions.push(option);
      }
    };

    fonts.forEach(font => {
      if (!font) {
        return;
      }

      if (typeof font === 'string') {
        registerFontOption(font, font);
        return;
      }

      if (typeof font === 'object') {
        const model = font.font || font['font-family'] || font.family || font.name;
        registerFontOption(font.name, model);

        const sheet = font.url || font.href || font.src;
        if (typeof sheet === 'string' && sheet.trim()) {
          fontStylesheets.push(sheet.trim());
        }
      }
    });

    const uniqueStylesheets = [];
    fontStylesheets.forEach(href => {
      if (!uniqueStylesheets.includes(href)) {
        uniqueStylesheets.push(href);
      }
    });

    const headingOptions = this.buildHeadingOptions(data);
    const styleDefinitions = this.buildStyleDefinitions(data);

    return {
      fontFamilyOptions,
      fontStylesheets: uniqueStylesheets,
      headingOptions,
      styleDefinitions
    };
  }

  /**
   * Injects font stylesheets into the editor frame.
   */
  injectFontStyles() {
    const doc = this.frameDoc;
    if (!doc || !doc.head) {
      return;
    }

    const stylesheets = Array.isArray(this.fontStylesheets) ? this.fontStylesheets : [];
    if (!stylesheets.length) {
      return;
    }

    let loaded = Array.isArray(this.loadedFontStylesheets) ? this.loadedFontStylesheets : [];

    stylesheets.forEach(href => {
      if (typeof href !== 'string') {
        return;
      }

      const trimmedHref = href.trim();
      if (!trimmedHref) {
        return;
      }

      if (loaded.includes(trimmedHref)) {
        return;
      }

      const alreadyPresent = Array.from(doc.querySelectorAll('link[rel="stylesheet"]')).some(link => {
        return link.getAttribute('href') === trimmedHref || link.href === trimmedHref;
      });

      if (alreadyPresent) {
        loaded.push(trimmedHref);
        return;
      }

      const link = doc.createElement('link');
      link.rel = 'stylesheet';
      link.href = trimmedHref;
      doc.head.appendChild(link);
      loaded.push(trimmedHref);
    });

    this._Ck5ForGrapesJsData.loadedFontStylesheets = loaded;
  }

  get latestClickEvent() {
    return this._Ck5ForGrapesJsData.latestClickEvent;
  }

  set latestClickEvent(value) {
    this._Ck5ForGrapesJsData.latestClickEvent = value;
  }

  get badgableInfo() {
    return this._Ck5ForGrapesJsData.badgableInfo;
  }

  set badgableInfo(value) {
    this._Ck5ForGrapesJsData.badgableInfo = value;
  }

  get toolbarVisibilityInfo() {
    return this._Ck5ForGrapesJsData.toolbarVisibilityInfo;
  }

  set toolbarVisibilityInfo(value) {
    this._Ck5ForGrapesJsData.toolbarVisibilityInfo = value;
  }

  get display() {
    return this._Ck5ForGrapesJsData.display;
  }

  set display(value) {
    this._Ck5ForGrapesJsData.display = value;
  }

  get latestContent() {
    return this._Ck5ForGrapesJsData.latestContent;
  }

  set latestContent(value) {
    this._Ck5ForGrapesJsData.latestContent = value;
  }

  get editorContainer() {
    return this._Ck5ForGrapesJsData.editorContainer;
  }

  set editorContainer(value) {
    this._Ck5ForGrapesJsData.editorContainer = value;
  }

  get fontFamilyOptions() {
    return this._Ck5ForGrapesJsData.fontFamilyOptions;
  }

  get themeAlias() {
    return this.resolveThemeAlias();
  }

  get themeConfigUrl() {
    const alias = this.resolveThemeAlias();
    if (!alias || alias === 'mautic_code_mode') {
      return null;
    }

    if (this._Ck5ForGrapesJsData.themeConfigUrl && this._Ck5ForGrapesJsData.themeConfigUrlAlias === alias) {
      return this._Ck5ForGrapesJsData.themeConfigUrl;
    }

    const url = this.buildThemeConfigUrl(alias);
    this._Ck5ForGrapesJsData.themeConfigUrl = url;
    this._Ck5ForGrapesJsData.themeConfigUrlAlias = alias;

    return url;
  }

  get fontStylesheets() {
    return this._Ck5ForGrapesJsData.fontStylesheets;
  }

  get loadedFontStylesheets() {
    return this._Ck5ForGrapesJsData.loadedFontStylesheets;
  }

  get headingOptions() {
    return this._Ck5ForGrapesJsData.headingOptions;
  }

  get styleDefinitions() {
    return this._Ck5ForGrapesJsData.styleDefinitions;
  }

  get inlineMenuMaxWidth() {
    return this._Ck5ForGrapesJsData.inlineMenuMaxWidth;
  }

  get menuMaxWidth() {
    return this._Ck5ForGrapesJsData.menuMaxWidth;
  }

  get parseContent() {
    return this._Ck5ForGrapesJsData.parseContent;
  }

  get inlineMode() {
    return this._Ck5ForGrapesJsData.inlineMode;
  }

  set inlineMode(value) {
    this._Ck5ForGrapesJsData.inlineMode = value;
  }

  get inlineStyles() {
    return this._Ck5ForGrapesJsData.inlineStyles;
  }

  set inlineStyles(value) {
    this._Ck5ForGrapesJsData.inlineStyles = value;
  }

  get toolBarMObserver() {
    return this._Ck5ForGrapesJsData.toolBarMObserver;
  }

  get gjsToolBarMObserver() {
    return this._Ck5ForGrapesJsData.gjsToolBarMObserver;
  }

  get elementObserver() {
    return this._Ck5ForGrapesJsData.elementObserver;
  }

  get el() {
    return this._Ck5ForGrapesJsData.el;
  }

  set el(value) {
    this._Ck5ForGrapesJsData.el = value;
  }

  get toolbarContainer() {
    return this.inFrameData && this.inFrameData.toolbarContainer;
  }

  get licenseKey() {
    return this._Ck5ForGrapesJsData.licenseKey;
  }

  get frame() {
    return this._Ck5ForGrapesJsData.frame;
  }

  set frame(value) {
    this._Ck5ForGrapesJsData.frame = value;
  }

  get frameContentWindow() {
    return this.frame && this.frame.contentWindow;
  }

  get inFrameData() {
    return this.frameContentWindow && this.frameContentWindow.grapesjsCkeditorData;
  }

  get frameDoc() {
    return this.frame && this.frame.contentDocument;
  }

  get frameBody() {
    return this.frameDoc && this.frameDoc.body;
  }

  get editor() {
    return this._Ck5ForGrapesJsData.editor
  }

  get uniqId() {
    return Ck5ForGrapesJs.constructor.uniqId++;
  }

  get ckeditor() {
    return this.inFrameData && this.inFrameData.editor;
  }

  get isActive() {
    return this.el !== null;
  }

  get frameScrollY() {
    return this.frameContentWindow ? this.frameContentWindow.scrollY : 0;
  }

  get frameScrollX() {
    return this.frameContentWindow ? this.frameContentWindow.scrollX : 0;
  }

  get inline() {
    return this._Ck5ForGrapesJsData.inline;
  }

  get inlineOptions() {
    return this._Ck5ForGrapesJsData.inline_options;
  }

  get options() {
    return this._Ck5ForGrapesJsData.options;
  }

  get gjsToolbar() {
    const toolBarEl = this.editor.RichTextEditor.getToolbarEl();
    return toolBarEl.parentElement.querySelector('.gjs-toolbar');
  }

  /**
   * Checks if the target element should use inline editor.
   *
   * @param {HTMLElement} target
   * @returns {boolean}
   */
  isInline(target) {
    return this.inline.includes(target.tagName.toLowerCase());
  }
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
  }

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
      this.executeInFrame(
        `${injectEditorInstant.name}('#${this.getElementId(this.editorContainer)}','${optionsKey}',${this.inlineMode ? 'true' : 'false'});`
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
            bodyWrapper.addEventListener(
              'mousedown',
              e => {
                e.stopPropagation();
                e.stopImmediatePropagation();
              }
            );
            bodyWrapper.addEventListener(
              'click',
              e => {
                e.stopPropagation();
                e.stopImmediatePropagation();
              }
            );
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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
      if (ckeditor && ckeditor._context && typeof ckeditor._context.destroy === 'function') {
        ckeditor._context.destroy();
      } else if (ckeditor && typeof ckeditor.destroy === 'function') {
        ckeditor.destroy().catch(error => {
          console.warn('GrapesJS CKEditor: unable to destroy editor', error);
        });
      }
      if (this.inFrameData) {
        this.inFrameData.editor = null;
        this.inFrameData.toolbarContainer = null;
      }
      toolbarContainer && toolbarContainer.remove();
      this.inlineStyles && this.inlineStyles.remove();
      this.inlineStyles = null;
      this.el.innerHTML = content;
      this.el.style.display = this.display;
      this.el.contentEditable = false;
      this.el = null;
      this.editorContainer && this.editorContainer.remove();
      this.editorContainer = null;
      this.latestContent = null;
      this.display = undefined;
      this.latestClickEvent = null;
    }
  }

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
    this.frameContentWindow.addEventListener(
      'scroll',
      this.onResize.bind(this)
    );
    this.frameContentWindow.addEventListener(
      'resize',
      this.onResize.bind(this)
    );
  }

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
  }

  /**
   * Gets or generates a unique ID for an element.
   *
   * @param {HTMLElement} el
   * @returns {string}
   */
  getElementId(el) {
    return el.id = el.id === '' || el.id === null || el.id === undefined ? `ckeditor_target_el_${this.uniqId}` : el.id;
  }

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
  }

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
  }

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
  }

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
  }

  /**
   * Resize handler to reposition toobar.
   */
  onResize() {
    if (this.isActive) {
      this.positionToolbar();
    }
  }
}

Ck5ForGrapesJs.constructor.uniqId = 0;

/**
 * Creates an HTML element with properties.
 *
 * @param {string} type
 * @param {HTMLElement} container
 * @param {Object} properties
 * @return {HTMLElement}
 */
function createHtmlElem(type, container, properties) {
  let elem = document.createElement(type);
  setElementProperty(elem, properties);
  container && container.appendChild(elem);
  return (elem);
}

/**
 * Sets properties on an element recursively.
 *
 * @param {Object} elem
 * @param {Object} properties
 */
function setElementProperty(elem, properties) {
  if (properties) {
    for (let key in properties) {
      if (typeof properties[key] === 'object') {
        setElementProperty(elem[key], properties[key]);
      } else {
        elem[key] = properties[key];
      }
    }
  }
}

/**
 * Injects data storage object into window.
 */
function injectDataStorage() {
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
function injectEditorInstant(selector, optionsKey, forceBr) {
  const registry = window.grapesjsCkeditorData && window.grapesjsCkeditorData.optionsRegistry;
  const options = registry && optionsKey ? registry[optionsKey] : {};
  if (registry && optionsKey) {
    delete registry[optionsKey];
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
  )
  window.grapesjsCkeditorData.toolbarContainer.addEventListener(
    'mousedown',
    e => {
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  );

  // Cross-frame iterable fix: Ensure mention feeds return a local array (iterable in this window)
  if (options && options.mention && Array.isArray(options.mention.feeds)) {
    options.mention.feeds.forEach(feedConfig => {
      if (typeof feedConfig.feed === 'function') {
        const originalFeed = feedConfig.feed;
        feedConfig.feed = (queryText) => {
          return new Promise(resolve => {
            const result = originalFeed(queryText);
            // Handle both Promise and synchronous result
            Promise.resolve(result).then(items => {
              // Convert to local array to ensure it has valid Symbol.iterator in this iframe context
              resolve(Array.from(items));
            }).catch(err => {
              console.error('Mention feed error:', err);
              resolve([]);
            });
          });
        };
      }
    });
  }

  (window.CKEDITOR ? CKEDITOR.ClassicEditor : ClassicEditor).create(
    document.querySelector(selector),
    options
  ).then(
    e => {
      window.grapesjsCkeditorData.editor = e;

      // Try to find CKEditor's toolbar element via the editor instance
      try {
        const rootEl = e.ui && e.ui.view && e.ui.view.element ? e.ui.view.element : null;
        const toolbarEl = rootEl ? rootEl.querySelector('.ck-toolbar') : null;
        if (toolbarEl) {
          // Hide toolbar initially
          try { toolbarEl.style.display = 'none'; } catch (err) { }

          // Show toolbar after 2 seconds using the editor object (accessing DOM through the editor)
          setTimeout(() => {
            try {
              // Prefer any API-backed toolbar element if available, fallback to DOM node
              const tb = (e.ui && e.ui.view && e.ui.view.element && e.ui.view.element.querySelector('.ck-toolbar')) || toolbarEl;
              if (tb) tb.style.display = '';
            } catch (err) {
              console.warn('GrapesJS CKEditor: unable to reveal toolbar', err);
            }
          }, 100);
        }
      } catch (err) {
        console.warn('GrapesJS CKEditor: toolbar manipulation failed', err);
      }

      forceBr && e.editing.view.document.on(
        'keydown',
        (event, data) => {
          if (data.keyCode === 13) {
            data.shiftKey = true;
          }
        },
        { priority: 'highest' }
      );

      // Add Tip to TokenPlugin dropdown styling via class injection
      const applyTipClass = () => {
        const buttons = document.querySelectorAll('.ck-button');
        buttons.forEach(btn => {
          if (!btn.classList.contains('token-tip-active') && btn.textContent.includes("Tip: Type '{'")) {
            btn.classList.add('token-tip-active');
          }
        });
      };

      const observer = new MutationObserver(applyTipClass);
      observer.observe(document.body, { childList: true, subtree: true });
      applyTipClass();
    }
  ).catch(
    error => {
      console.error(error);
    }
  );

  /**
   *
   * @param {string} type
   * @param {HTMLElement} container
   * @param {Object} properties
   * @return {HTMLElement}
   */
  function createHtmlElem(type, container, properties) {
    let elem = document.createElement(type);
    setElementProperty(elem, properties);
    container && container.appendChild(elem);
    return (elem);
  }

  /**
   *
   * @param {Object} elem
   * @param {Object} properties
   */
  function setElementProperty(elem, properties) {
    if (properties) {
      for (let key in properties) {
        if (_typeof(properties[key]) === 'object') {
          setElementProperty(elem[key], properties[key]);
        } else {
          elem[key] = properties[key];
        }
      }
    }
  }
}

/**
 * Checks if an open panel overlaps with the GrapesJS toolbar.
 *
 * @param {HTMLElement} element
 * @param {HTMLElement} gjsToolbar
 * @param {HTMLElement} frame
 * @returns {boolean}
 */
function isOpenPanelOverlapGjsToolbar(element, gjsToolbar, frame) {
  let result;
  if (isOpen(element) && overlap(element, gjsToolbar, frame)) {
    result = true;
  } else {
    result = !![...element.children].find(child => isOpenPanelOverlapGjsToolbar(child, gjsToolbar, frame));
  }

  return result;

  function isOpen(element) {
    return [...element.classList].find(className => className.match(/panel-visible/g))
  }
}

/**
 * Checks for overlap between two elements/rects.
 *
 * @param {HTMLElement} element
 * @param {HTMLElement} gjsToolbar
 * @param {HTMLElement} frame
 * @returns {boolean}
 */
function overlap(element, gjsToolbar, frame) {
  const elementBoundaryRect = element.getBoundingClientRect();
  const frameBoundaryRect = frame.getBoundingClientRect();
  const gjsToolbarBoundaryRect = gjsToolbar.getBoundingClientRect();
  const elementBoundaryRectScreenViewPort = {
    top: elementBoundaryRect.top + frameBoundaryRect.top,
    bottom: elementBoundaryRect.bottom + frameBoundaryRect.top,
    left: elementBoundaryRect.left + frameBoundaryRect.left,
    right: elementBoundaryRect.right + frameBoundaryRect.left,
  };

  return !(
    gjsToolbarBoundaryRect.left > elementBoundaryRectScreenViewPort.right ||
    gjsToolbarBoundaryRect.right < elementBoundaryRectScreenViewPort.left ||
    gjsToolbarBoundaryRect.top > elementBoundaryRectScreenViewPort.bottom ||
    gjsToolbarBoundaryRect.bottom < elementBoundaryRectScreenViewPort.top
  )
}