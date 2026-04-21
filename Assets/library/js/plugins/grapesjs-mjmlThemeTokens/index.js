export { pluginId, extractMjHeadContent, createHeadInjectingMjmlParser } from './utils';

export default (editor, opts = {}) => {
  const options = {
    // Provide mj-head inner content (preferred) or full original MJML
    headContent: '',
    originalMjml: '',

    // Default token mapping for newly dropped components
    defaults: {
      text: 't-body',
      button: 't-btn t-btn-primary',
      buttonSecondary: 't-btn t-btn-secondary',
      section: 't-section t-surface-1',
    },

    // Types to auto-apply defaults to
    applyDefaultsToTypes: ['mj-text', 'mj-button', 'mj-section'],

    ...opts,
  };

  const headContent = options.headContent || extractMjHeadContent(options.originalMjml || '');

  const parseMjClassNames = (mjHeadContent) => {
    const out = new Set();
    if (!mjHeadContent) return out;

    const re = /<mj-class\s+[^>]*\bname\s*=\s*["']([^"']+)["'][^>]*>/gi;
    let m;
    while ((m = re.exec(mjHeadContent)) !== null) out.add(m[1]);
    return out;
  };

  const classNames = parseMjClassNames(headContent);

  const registerHiddenMjAttributesTypes = () => {
    const isTag = (el, tag) => (el?.tagName || '').toLowerCase() === tag;
    const parentIs = (el, tag) => isTag(el?.parentElement, tag);

    const hiddenDefaults = {
      selectable: false,
      hoverable: false,
      highlightable: false,
      layerable: false,
      draggable: false,
      droppable: false,
      copyable: false,
      removable: false,
      editable: false,
    };

    const hiddenView = {
      tagName: 'div',
      attributes: { style: 'display:none !important;' },
      getTemplateFromMjml() {
        return '';
      },
      render() {
        this.el.innerHTML = '';
        return this;
      },
    };

    // Container <mj-attributes>
    editor.DomComponents.addType('mj-attributes', {
      isComponent: (el) => isTag(el, 'mj-attributes'),
      model: {
        defaults: {
          tagName: 'mj-attributes',
          ...hiddenDefaults,
        },
      },
      view: hiddenView,
    });

    // Leaf tags inside <mj-attributes>
    editor.DomComponents.addType('mj-all', {
      isComponent: (el) => isTag(el, 'mj-all') && parentIs(el, 'mj-attributes'),
      model: {
        defaults: {
          tagName: 'mj-all',
          void: false,
          ...hiddenDefaults,
        },
      },
      view: hiddenView,
    });

    editor.DomComponents.addType('mj-class', {
      isComponent: (el) => isTag(el, 'mj-class') && parentIs(el, 'mj-attributes'),
      model: {
        defaults: {
          tagName: 'mj-class',
          void: false,
          ...hiddenDefaults,
        },
      },
      view: hiddenView,
    });

    // Head-default tags like <mj-text ...></mj-text> inside <mj-attributes>
    // Extend the existing body types (must exist => plugin must run AFTER grapesjs-mjml)
    const addHiddenAttrType = (typeName, baseType, tagName) => {
      editor.DomComponents.addType(typeName, {
        extend: baseType,
        isComponent: (el) => isTag(el, tagName) && parentIs(el, 'mj-attributes'),
        model: {
          defaults: {
            tagName,
            ...hiddenDefaults,
          },
        },
        view: hiddenView,
      });
    };

    addHiddenAttrType('mj-attr-text', 'mj-text', 'mj-text');
    addHiddenAttrType('mj-attr-button', 'mj-button', 'mj-button');
    addHiddenAttrType('mj-attr-section', 'mj-section', 'mj-section');
    addHiddenAttrType('mj-attr-column', 'mj-column', 'mj-column');
  };

  const stripDefaultAttrsForComponent = (component) => {
    if (!component) return;

    const attrs = { ...(component.get('attributes') || {}) };
    const styleDefault = component.get('style-default') || {};

    let changed = false;
    Object.keys(styleDefault).forEach((key) => {
      if (key in attrs && attrs[key] === styleDefault[key]) {
        delete attrs[key];
        changed = true;
      }
    });

    if (changed) {
      component.set('attributes', attrs);
    }
  };

  const stripDefaultAttrsForTokenizedComponents = () => {
    const wrapper = editor.getWrapper?.();
    if (!wrapper) return;

    const walk = (cmp) => {
      const attrs = { ...(cmp.get('attributes') || {}) };
      if (attrs['mj-class']) stripDefaultAttrsForComponent(cmp);

      const children = cmp.components?.();
      if (children && children.length) children.forEach((c) => walk(c));
    };

    wrapper.components?.().forEach((c) => walk(c));
  };

  const getDefaultMjClassForType = (type) => {
    if (type === 'mj-text') return options.defaults.text || '';
    if (type === 'mj-button') return options.defaults.button || '';
    if (type === 'mj-section') return options.defaults.section || '';
    return '';
  };

  // Apply defaults only AFTER initial content import is done
  let readyForNewDrops = false;

  const onComponentAdd = (component) => {
    if (!readyForNewDrops) return;

    const type = component?.get?.('type');
    if (!type || !options.applyDefaultsToTypes.includes(type)) return;

    const attrs = { ...(component.get('attributes') || {}) };

    // If block didn't specify mj-class, apply theme token (only if token exists in theme)
    if (!attrs['mj-class'] && classNames.size) {
      const token = getDefaultMjClassForType(type);
      if (token) {
        const parts = token.split(/\s+/).filter(Boolean);
        const allExist = parts.every((p) => classNames.has(p));
        if (allExist) {
          component.set('attributes', { ...attrs, 'mj-class': token });
        }
      }
    }

    // Always strip defaults on new drops (lets theme <mj-attributes> and/or mj-class win)
    stripDefaultAttrsForComponent(component);
  };

  const patchBlocks = () => {
    const bm = editor.BlockManager;

    const btnBlock = bm.get('mj-button');
    if (btnBlock && classNames.size) {
      const parts = (options.defaults.button || '').split(/\s+/).filter(Boolean);
      if (parts.length && parts.every((p) => classNames.has(p))) {
        btnBlock.set({
          content: `<mj-button mj-class="${options.defaults.button}" href="https://">Button</mj-button>`,
        });
      }
    }

    const textBlock = bm.get('mj-text');
    if (textBlock && classNames.size) {
      if (classNames.has(options.defaults.text)) {
        textBlock.set({
          content: `<mj-text mj-class="${options.defaults.text}">Insert text here</mj-text>`,
        });
      }
    }

    const secondaryDefault = options.defaults.buttonSecondary || '';

    // Register secondary button block if theme defines all required tokens and block doesn't exist yet
    if (secondaryDefault && classNames.size && !bm.get('mj-button-secondary')) {
      const secondaryParts = secondaryDefault.split(/\s+/).filter(Boolean);
      if (secondaryParts.length && secondaryParts.every((p) => classNames.has(p))) {
        bm.add('mj-button-secondary', {
          label: Mautic.translate('grapesjsbuilder.secondaryButtonBlockLabel'),
          category: Mautic.translate('grapesjsbuilder.categoryBlockLabel'),
          content: `<mj-button mj-class="${secondaryDefault}" href="https://">Button</mj-button>`,
          media: `<svg viewBox="0 0 24 24">
            <path fill="currentColor" d="M20 20.5C20 21.3 19.3 22 18.5 22H13C12.6 22 12.3 21.9 12 21.6L8 17.4L8.7 16.6C8.9 16.4 9.2 16.3 9.5 16.3H9.7L12 18V9C12 8.4 12.4 8 13 8S14 8.4 14 9V13.5L15.2 13.6L19.1 15.8C19.6 16 20 16.6 20 17.1V20.5M20 2H4C2.9 2 2 2.9 2 4V12C2 13.1 2.9 14 4 14H8V12H4V4H20V12H18V14H20C21.1 14 22 13.1 22 12V4C22 2.9 21.1 2 20 2Z" />
          </svg>`,
        });
      }
    }
  };

  // Must be executed during init (before setComponents) so mj-attributes content is hidden on parse
  registerHiddenMjAttributesTypes();

  editor.on('component:add', onComponentAdd);

  // Patch blocks when they appear (preset plugins may add them later)
  editor.on('load', patchBlocks);
  const blockColl = editor.BlockManager.getAll?.();
  if (blockColl?.on) {
    blockColl.on('add reset', patchBlocks);
  }

  // Service will call this after its setComponents + reparse workaround
  editor.on('mjml-theme-tokens:content:ready', () => {
    stripDefaultAttrsForTokenizedComponents();
    patchBlocks();
    readyForNewDrops = true;
  });
};
