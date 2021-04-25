import BuilderService from './builder.service';
// import builder from './builder.service';

/**
 * Launch builder
 *
 * @param formName
 * @param actionName
 */
function launchBuilderGrapesjs(formName) {

  if (typeof Mautic.builderPanelHTML === 'undefined') {
    Mautic.builderPanelHTML = mQuery('.builder-panel').html();
  }

  if (!Mautic.isThemeSupportedGrapesJs()) {
    mQuery('.builder-panel').html(Mautic.builderPanelHTML);
    Mautic.reArrangeStyles();
    Mautic.legacyBuilder(formName);
    return;
  }
  // Parse HTML template
  const parser = new DOMParser();
  const textareaHtml = mQuery('textarea.builder-html');
  const textareaAssets = mQuery('textarea#grapesjsbuilder_assets');
  const fullHtml = parser.parseFromString(textareaHtml.val(), 'text/html');

  const canvasContent = fullHtml.body.innerHTML
    ? fullHtml.body.innerHTML
    : mQuery('textarea.builder-mjml').val();

  const assets = textareaAssets.val() ? JSON.parse(textareaAssets.val()) : [];

  const builder = new BuilderService(
    canvasContent,
    assets,
    textareaAssets.data('upload'),
    textareaAssets.data('delete')
  );

  Mautic.showChangeThemeWarning = true;

  // Prepare HTML
  mQuery('html').css('font-size', '100%');
  mQuery('body').css('overflow-y', 'hidden');
  mQuery('.builder-panel').css('padding', 0);
  mQuery('.builder-panel').css('display', 'block');
  mQuery('.builder').addClass('builder-active').removeClass('hide');

  // Initialize GrapesJS
  builder.initGrapesJS(formName);
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
    data: `template=${theme}`,
    dataType: 'json',
    success(response) {
      const textareaHtml = mQuery('textarea.builder-html');
      const textareaMjml = mQuery('textarea.builder-mjml');

      textareaHtml.val(response.templateHtml);

      if (typeof textareaMjml !== 'undefined') {
        textareaMjml.val(response.templateMjml);
      }

      // If MJML template, generate HTML before save
      // if (!textareaHtml.val().length && textareaMjml.val().length) {
      //   builder.mjmlToHtml(textareaMjml, textareaHtml);
      // }
      // }
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
 * Initialize original Mautic theme selection with grapejs specific modifications
 */
function initSelectThemeGrapesjs(parentInitSelectTheme) {
  function childInitSelectTheme(themeField) {
    const builderUrl = mQuery('#builder_url');
    let url;

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
  }
  return childInitSelectTheme;
}
Mautic.reArrangeStyles = function () {
  mQuery('.builder-active').removeClass('builder-active');
  mQuery('body').css('overflow-y', 'auto');
  mQuery('section#app-wrapper').height('auto');
  mQuery('.builder').addClass('code-mode');
  mQuery('.builder .code-editor').removeClass('hide');
  mQuery('.builder .code-mode-toolbar').removeClass('hide');
  mQuery('.builder .builder-toolbar').addClass('hide');
  mQuery('.builder-panel').css('padding', '');
};

Mautic.isThemeSupportedGrapesJs = function() {
  return (!mQuery('.builder').hasClass('code-mode') && (mQuery('textarea.builder-html').length > 0 || mQuery('textarea.builder-mjml').val().length > 0));
}

Mautic.grapesConvertDynamicContentTokenToSlot =
  BuilderService.grapesConvertDynamicContentTokenToSlot;
Mautic.grapesConvertDynamicContentSlotsToTokens =
  BuilderService.grapesConvertDynamicContentSlotsToTokens;
Mautic.manageDynamicContentTokenToSlot = BuilderService.manageDynamicContentTokenToSlot;
Mautic.legacyBuilder = Mautic.launchBuilder;
Mautic.initSelectTheme = initSelectThemeGrapesjs(Mautic.initSelectTheme);
Mautic.setThemeHtml = setThemeHtml;
Mautic.launchBuilder = launchBuilderGrapesjs;

