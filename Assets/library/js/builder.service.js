import grapesjs from 'grapesjs';
import grapesjsmjml from 'grapesjs-mjml';
import grapesjsnewsletter from 'grapesjs-preset-newsletter';
import grapesjswebpage from 'grapesjs-preset-webpage';
import grapesjspostcss from 'grapesjs-parser-postcss';
import contentService from 'grapesjs-preset-mautic/dist/content.service';
import grapesjsmautic from 'grapesjs-preset-mautic';
import mjmlService from 'grapesjs-preset-mautic/dist/mjml/mjml.service';
import 'grapesjs-plugin-ckeditor';

// for local dev
// import contentService from '../../../../../../grapesjs-preset-mautic/src/content.service';
// import grapesjsmautic from '../../../../../../grapesjs-preset-mautic/src';
// import mjmlService from '../../../../../../grapesjs-preset-mautic/src/mjml/mjml.service';

import CodeModeButton from './codeMode/codeMode.button';

export default class BuilderService {
  editor;

  assets;

  uploadPath;

  deletePath;

  /**
   * @param {*} assets
   */
  constructor(assets) {
    if (!assets.conf.uploadPath) {
      throw Error('No uploadPath found');
    }
    if (!assets.conf.deletePath) {
      throw Error('No deletePath found');
    }
    if (!assets.files || !assets.files[0]) {
      console.warn('no assets');
    }

    this.assets = assets.files;
    this.uploadPath = assets.conf.uploadPath;
    this.deletePath = assets.conf.deletePath;
  }

  /**
   * Initialize GrapesJsBuilder
   *
   * @param object
   */
  setListeners() {
    if (!this.editor) {
      throw Error('No editor found');
    }

    // Why would we not want to keep the history?
    //
    // this.editor.on('load', () => {
    //   const um = this.editor.UndoManager;
    //   // Clear stack of undo/redo
    //   um.clear();
    // });

    const keymaps = this.editor.Keymaps;
    let allKeymaps;

    this.editor.on('modal:open', () => {
      // Save all keyboard shortcuts
      allKeymaps = { ...keymaps.getAll() };

      // Remove keyboard shortcuts to prevent launch behind popup
      keymaps.removeAll();
    });

    this.editor.on('modal:close', () => {
      // ReMap keyboard shortcuts on modal close
      Object.keys(allKeymaps).map((objectKey) => {
        const shortcut = allKeymaps[objectKey];

        keymaps.add(shortcut.id, shortcut.keys, shortcut.handler);
        return keymaps;
      });
    });

    this.editor.on('asset:remove', (response) => {
      // Delete file on server
      mQuery.ajax({
        url: this.deletePath,
        data: { filename: response.getFilename() },
      });
    });
  }

  /**
   * Initialize the grapesjs build in the
   * correct mode
   */
  initGrapesJS(object) {
    // disable mautic global shortcuts
    Mousetrap.reset();
    if (object === 'page') {
      this.editor = this.initPage();
    } else if (object === 'emailform') {
      if (mjmlService.getOriginalContentMjml()) {
        this.editor = this.initEmailMjml();
      } else {
        this.editor = this.initEmailHtml();
      }
    } else {
      throw Error(`Not supported builder type: ${object}`);
    }

    // add code mode button
    // @todo: only show button if configured: sourceEdit: 1,
    const codeModeButton = new CodeModeButton(this.editor);
    codeModeButton.addCommand();
    codeModeButton.addButton();

    this.setListeners();
  }

  static getMauticConf(mode) {
    return {
      mode,
    };
  }

  static getCkeConf() {
    return {
      options: {
        language: 'en',
        toolbar: [
          { name: 'links', items: ['Link', 'Unlink'] },
          { name: 'basicstyles', items: ['Bold', 'Italic', 'Strike', '-', 'RemoveFormat'] },
          { name: 'paragraph', items: ['NumberedList', 'BulletedList', '-'] },
          { name: 'colors', items: ['TextColor', 'BGColor'] },
          { name: 'document', items: ['Source'] },
          { name: 'insert', items: ['SpecialChar'] },
        ],
        extraPlugins: ['sharedspace', 'colorbutton'],
      },
    };
  }

  /**
   * Initialize the builder in the landingapge mode
   */
  initPage() {
    // Launch GrapesJS with body part
    this.editor = grapesjs.init({
      clearOnRender: true,
      container: '.builder-panel',
      components: contentService.getOriginalContentHtml().body.innerHTML,
      height: '100%',
      canvas: {
        styles: contentService.getStyles(),
      },
      storageManager: false, // https://grapesjs.com/docs/modules/Storage.html#basic-configuration
      assetManager: this.getAssetManagerConf(),
      styleManager: {
        clearProperties: true, // Temp fix https://github.com/artf/grapesjs-preset-webpage/issues/27
      },
      plugins: [grapesjswebpage, grapesjspostcss, grapesjsmautic, 'gjs-plugin-ckeditor'],
      pluginsOpts: {
        [grapesjswebpage]: {
          formsOpts: false,
        },
        grapesjsmautic: BuilderService.getMauticConf('page-html'),
        'gjs-plugin-ckeditor': BuilderService.getCkeConf(),
      },
    });

    return this.editor;
  }

  initEmailMjml() {
    const components = mjmlService.getOriginalContentMjml();
    // validate
    mjmlService.mjmlToHtml(components);

    this.editor = grapesjs.init({
      clearOnRender: true,
      container: '.builder-panel',
      components,
      height: '100%',
      storageManager: false,
      assetManager: this.getAssetManagerConf(),
      plugins: [grapesjsmjml, grapesjspostcss, grapesjsmautic, 'gjs-plugin-ckeditor'],
      pluginsOpts: {
        grapesjsmjml: {},
        grapesjsmautic: BuilderService.getMauticConf('email-mjml'),
        'gjs-plugin-ckeditor': BuilderService.getCkeConf(),
      },
    });

    this.editor.BlockManager.get('mj-button').set({
      content: '<mj-button href="https://">Button</mj-button>',
    });

    return this.editor;
  }

  initEmailHtml() {
    const components = contentService.getOriginalContentHtml().body.innerHTML;
    if (!components) {
      throw new Error('no components');
    }

    // Launch GrapesJS with body part
    this.editor = grapesjs.init({
      clearOnRender: true,
      container: '.builder-panel',
      components,
      height: '100%',
      storageManager: false,
      assetManager: this.getAssetManagerConf(),
      plugins: [grapesjsnewsletter, grapesjspostcss, grapesjsmautic, 'gjs-plugin-ckeditor'],
      pluginsOpts: {
        grapesjsnewsletter: {},
        grapesjsmautic: BuilderService.getMauticConf('email-html'),
        'gjs-plugin-ckeditor': BuilderService.getCkeConf(),
      },
    });

    // add a Mautic custom block Button
    this.editor.BlockManager.get('button').set({
      content:
        '<a href="#" target="_blank" style="display:inline-block;text-decoration:none;border-color:#4e5d9d;border-width: 10px 20px;border-style:solid; text-decoration: none; -webkit-border-radius: 3px; -moz-border-radius: 3px; border-radius: 3px; background-color: #4e5d9d; display: inline-block;font-size: 16px; color: #ffffff; ">\n' +
        'Button\n' +
        '</a>',
    });

    return this.editor;
  }

  /**
   * Manage button loading indicator
   *
   * @param activate - true or false
   */
  static setupButtonLoadingIndicator(activate) {
    const builderButton = mQuery('.btn-builder');
    const saveButton = mQuery('.btn-save');
    const applyButton = mQuery('.btn-apply');

    if (activate) {
      Mautic.activateButtonLoadingIndicator(builderButton);
      Mautic.activateButtonLoadingIndicator(saveButton);
      Mautic.activateButtonLoadingIndicator(applyButton);
    } else {
      Mautic.removeButtonLoadingIndicator(builderButton);
      Mautic.removeButtonLoadingIndicator(saveButton);
      Mautic.removeButtonLoadingIndicator(applyButton);
    }
  }

  /**
   * Configure the Asset Manager for all modes
   * @link https://grapesjs.com/docs/modules/Assets.html#configuration
   */
  getAssetManagerConf() {
    return {
      assets: this.assets,
      noAssets: Mautic.translate('grapesjsbuilder.assetManager.noAssets'),
      upload: this.uploadPath,
      uploadName: 'files',
      multiUpload: 1,
      embedAsBase64: false,
      openAssetsOnDrop: 1,
      autoAdd: 1,
      headers: { 'X-CSRF-Token': mauticAjaxCsrf }, // global variable
    };
  }

  getEditor() {
    return this.editor;
  }
  /**
   * Generate assets list from GrapesJs
   */
  // getAssetsList() {
  //   const assetManager = this.editor.AssetManager;
  //   const assets = assetManager.getAll();
  //   const assetsList = [];

  //   assets.forEach((asset) => {
  //     if (asset.get('type') === 'image') {
  //       assetsList.push({
  //         src: asset.get('src'),
  //         width: asset.get('width'),
  //         height: asset.get('height'),
  //       });
  //     } else {
  //       assetsList.push(asset.get('src'));
  //     }
  //   });

  //   return assetsList;
  // }
}
