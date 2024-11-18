export default (editor, opts = {}) => {
    const options = {
        ...opts
    };

    let ckEditorInstance = null;

    const SIMPLE_EDITING_TYPES = ['mj-button'];

    editor.on('rte:enable', (view, gjsRte) => {
        if (!isSimpleEditingEl(view.el)) {
            initializeModal(gjsRte.el);
            editor.RichTextEditor.hideToolbar();
        }
    });

    function isSimpleEditingEl(el) {
        return el && el.getAttribute && SIMPLE_EDITING_TYPES.includes(el.getAttribute('data-gjs-type'));
    }

    function initializeModal(el) {
        const ckEditorElementId = generateId('ckeditor');
        const modal = editor.Modal;
        setupModalEvents(modal, ckEditorElementId);
        openModal(modal, el, ckEditorElementId);
    }

    function setupModalEvents(modal, ckEditorElementId) {
        modal.onceOpen(() => initCKEditor(ckEditorElementId));
        modal.onceClose(() => destroyCKEditor());
    }

    function initCKEditor(elementId) {
        if (typeof ClassicEditor === 'undefined') {
            throw new Error('CKEDITOR instance not found');
        }
        ClassicEditor.create(document.getElementById(elementId), options)
            .then(instance => {
                ckEditorInstance = instance;
            })
            .catch(error => {
                console.error('Error initializing CKEditor:', error);
            });
    }

    function destroyCKEditor() {
        if (ckEditorInstance) {
            ckEditorInstance.destroy()
                .catch(error => {
                    console.error('Error destroying CKEditor instance:', error);
                });
        }
    }

    function openModal(modal, el, ckEditorElementId) {
        modal.open({
            title: 'Edit',
            content: getModalContent(el, ckEditorElementId),
            attributes: {
                class: 'cke-modal',
                id: generateId('cke-modal')
            }
        });

        setupModalButtons(el, modal);
    }

    function getModalContent(el, ckEditorElementId) {
        return `
            <div id="${ckEditorElementId}">${el.innerHTML}</div>
            <button type="button" class="gjs-btn-prim" id="gjs-cke-save-btn">Save</button>
            <button type="button" class="gjs-btn-prim" id="gjs-cke-close-btn">Close</button>
        `;
    }

    function setupModalButtons(el, modal) {
        document.getElementById('gjs-cke-save-btn').onclick = () => saveContent(el, modal);
        document.getElementById('gjs-cke-close-btn').onclick = () => modal.close();
    }

    function saveContent(el, modal) {
        if (ckEditorInstance) {
            const content = ckEditorInstance.getData();
            const selectedElement = editor.getSelected();
            if (selectedElement.getEl().innerHTML !== content) {
                selectedElement.components('');
                selectedElement.set('content', content);
            }
        }
        modal.close();
    }

    function generateId(prefix = 'el') {
        return `${prefix}-${Math.random().toString(36).substring(2, 10)}`;
    }
};
