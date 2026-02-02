import AssetService from './asset.service';
import BuilderService from './builder.service';

// all css get combined into one builder.css and automatically loaded via js/parcel
import 'grapesjs/dist/css/grapes.min.css';
import './grapesjs-custom.css';

/**
 * Launch builder
 *
 * @param formName
 */
function launchBuilderGrapesjs(formName) {
  if (useBuilderForCodeMode() === false) {
    return;
  }

  Mautic.showChangeThemeWarning = true;

  // Prepare HTML
  mQuery('html').css('font-size', '100%');
  function getBuilderContext() {
    const builderUrlValue = mQuery('#builder_url').val();
    if (!builderUrlValue) {
      return null;
    }

    let url;
    try {
      url = new URL(builderUrlValue, window.location.origin);
    } catch (error) {
      console.warn('Unable to parse builder URL', error);
      return null;
    }

    const match = url.pathname.match(/grapesjsbuilder\/(page|email)\/([^/]+)/);
    if (!match) {
      return null;
    }

    const [, objectType, objectId] = match;

    return {
      url,
      objectType,
      objectId,
      isNew: objectId.startsWith('new'),
    };
  }

  function purgeLocalProjectStorage(entityId) {
    if (!entityId) {
      return;
    }

    const storageKey = 'gjs-storage';
    let stack;

    try {
      stack = JSON.parse(localStorage.getItem(storageKey));
    } catch (error) {
      console.warn('Unable to parse local GrapesJS storage stack', error);
      return;
    }

    if (!Array.isArray(stack)) {
      return;
    }

    const filtered = stack.filter((item) => {
      if (!item || !item.id || typeof item.id !== 'string') {
        return true;
      }

      return !item.id.endsWith(`-${entityId}`);
    });

    if (filtered.length === stack.length) {
      return;
    }

    localStorage.setItem(storageKey, JSON.stringify(filtered));
  }

  async function resetStoredProjectData(context) {
    if (!context || context.isNew) {
      return;
    }

    const resetUrl = `${context.url.origin}${context.url.pathname}/project/reset`;

    try {
      await fetch(resetUrl, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'X-CSRF-Token': typeof mauticAjaxCsrf !== 'undefined' ? mauticAjaxCsrf : '',
        },
        body: '{}',
      });
    } catch (error) {
      console.warn('Unable to reset stored GrapesJS project data', error);
    }

    purgeLocalProjectStorage(context.objectId);
  }

  mQuery('body').css('overflow-y', 'hidden');
  mQuery('.builder-panel').css('padding', 0);
  mQuery('.builder-panel').css('display', 'block');
  const $builder = mQuery('.builder');
  $builder.addClass('builder-active').removeClass('hide');

  const context = getBuilderContext();
  // Ensure stale local/editor state is cleared when reopening existing entities
  //void resetStoredProjectData(context);

  const assetService = new AssetService();
  const builder = new BuilderService(assetService);
  // Initialize GrapesJS
  builder.initGrapesJS(formName);

  // trigger show event on DOM element
  $builder.trigger('builder:show', [builder.editor])
  // trigger show event on editor instance
  builder.editor.trigger('show');

  // Load and add assets
  (async () => {
    try {
      const result = await assetService.getAssetsXhr();
      builder.editor.AssetManager.add(result.data);
    } catch (error) {
      console.error('Error loading initial assets:', error);
    }
  })();
}

/**
 * The user acknowledges the risk before editing an email or landing page created in Code Mode in the Builder
 */
function useBuilderForCodeMode() {
  const theme = mQuery('.theme-selected').find('[data-theme]').attr('data-theme');
  const isCodeMode = theme === 'mautic_code_mode';
  if (isCodeMode) {
    if (confirm(Mautic.translate('grapesjsbuilder.builder.warning.code_mode')) === false) {
      return false;
    }
  }

  return true;
}

/**
 * Set theme's HTML
 *
 * @param theme
 */
function setThemeHtml(theme) {
  BuilderService.setupButtonLoadingIndicator(true);
  // Load template and fill field
  mQuery.ajax({
    url: mQuery('#builder_url').val(),
    data: {
      template: theme,
      resetProject: 1,
    },
    dataType: 'json',
    success(response) {
      const textareaHtml = mQuery('textarea.builder-html');
      const textareaMjml = mQuery('textarea.builder-mjml');
      const textareaJson = mQuery('textarea.builder-json');
      const form = textareaHtml.closest('form');

      textareaHtml.val(response.templateHtml);

      if (typeof textareaMjml !== 'undefined') {
        textareaMjml.val(response.templateMjml);
      }

      if (textareaJson.length) {
        textareaJson.val('');
      }

      if (form.length) {
        form.attr('data-grapesjsbuilder-reset', 'true');
      }

      // If MJML template, generate HTML before save
      if (!textareaHtml.val().length && textareaMjml.val().length) {
        const assetService = new AssetService();
        const builder = new BuilderService(assetService);

        textareaHtml.val(builder.mjmlToHtml(response.templateMjml));
      }
    },
    error(request, textStatus) {
      console.log(`setThemeHtml - Request failed: ${textStatus}`);
    },
    complete() {
      BuilderService.setupButtonLoadingIndicator(false);
    },
  });
}

/**
 * The builder button to launch GrapesJS will be disabled when the code mode theme is selected
 *
 * @param theme
 */
function switchBuilderButton(theme) {
  const builderButton = mQuery('.btn-builder');
  const mEmailBuilderButton = mQuery('#emailform_buttons_builder_toolbar_mobile');
  const mPageBuilderButton = mQuery('#page_buttons_builder_toolbar_mobile');
  const isCodeMode = theme === 'mautic_code_mode';

  builderButton.attr('disabled', isCodeMode);

  if (isCodeMode) {
    mPageBuilderButton.addClass('link-is-disabled');
    mEmailBuilderButton.addClass('link-is-disabled');

    mPageBuilderButton.parent().addClass('is-not-allowed');
    mEmailBuilderButton.parent().addClass('is-not-allowed');
  } else {
    mPageBuilderButton.removeClass('link-is-disabled');
    mEmailBuilderButton.removeClass('link-is-disabled');

    mPageBuilderButton.parent().removeClass('is-not-allowed');
    mEmailBuilderButton.parent().removeClass('is-not-allowed');
  }
}

/**
 * The textarea with the HTML source will be displayed if the code mode theme is selected
 *
 * @param theme
 */
function switchCustomHtml(theme) {
  const customHtmlRow = mQuery('#custom-html-row');
  const isPageMode = mQuery('[name="page"]').length !== 0;
  const isCodeMode = theme === 'mautic_code_mode';
  const advancedTab = isPageMode ? mQuery('#advanced-tab') : null;

  if (isCodeMode === true) {
    customHtmlRow.removeClass('hidden');
    isPageMode && advancedTab.removeClass('hidden');
  } else {
    customHtmlRow.addClass('hidden');
    isPageMode && advancedTab.addClass('hidden');
  }
}

/**
 * Initialize original Mautic theme selection with grapejs specific modifications
 */
function initSelectThemeGrapesjs(parentInitSelectTheme) {
  function childInitSelectTheme(themeField) {
    const builderUrl = mQuery('#builder_url');
    let url;

    switchBuilderButton(themeField.val());
    switchCustomHtml(themeField.val());

    // Replace Mautic URL by plugin URL
    if (builderUrl.length) {
      if (builderUrl.val().indexOf('pages') !== -1) {
        url = builderUrl.val().replace('s/pages/builder', 's/grapesjsbuilder/page');
      } else {
        url = builderUrl.val().replace('s/emails/builder', 's/grapesjsbuilder/email');
      }

      builderUrl.val(url);
    }

    // Launch original Mautic.initSelectTheme function
    parentInitSelectTheme(themeField);

    mQuery('[data-theme]').click((event) => {
      const target = mQuery(event.target);
      const theme = target.closest('[data-theme]').attr('data-theme');

      switchBuilderButton(theme);
      switchCustomHtml(theme);
    });
  }
  return childInitSelectTheme;
}

Mautic.launchBuilder = launchBuilderGrapesjs;
Mautic.initSelectTheme = initSelectThemeGrapesjs(Mautic.initSelectTheme);
Mautic.setThemeHtml = setThemeHtml;
