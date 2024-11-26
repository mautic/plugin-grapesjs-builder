export default (editor, opts = {}) => {
    let ckEditorInstance = null;

    const SIMPLE_EDITING_TYPES = ['mj-button', 'link'];

    editor.on('rte:enable', (view, gjsRte) => {
        if (!isSimpleEditingEl(view.el)) {
            openCKEditorModal(gjsRte.el, view);
            editor.RichTextEditor.hideToolbar();
        }
    });

    function isSimpleEditingEl(el) {
        return el && el.getAttribute && SIMPLE_EDITING_TYPES.includes(el.getAttribute('data-gjs-type'));
    }

    function openCKEditorModal(el, view) {
        const ckEditorElementId = `ckeditor-${Date.now()}`;
        const modal = editor.Modal;

        modal.onceOpen(() => initCKEditor(ckEditorElementId));
        modal.onceClose(() => destroyCKEditor());

        modal.open({
            title: 'Edit',
            content: `
                <div id="${ckEditorElementId}">${el.innerHTML}</div>
                <button type="button" class="gjs-btn-prim" id="gjs-cke-save-btn">Save</button>
                <button type="button" class="gjs-btn-prim" id="gjs-cke-close-btn">Close</button>
            `,
            attributes: {
                class: 'cke-modal'
            }
        });

        document.getElementById('gjs-cke-save-btn').onclick = () => saveContent(view, modal);
        document.getElementById('gjs-cke-close-btn').onclick = () => modal.close();
    }

    function initCKEditor(elementId) {
        if (typeof ClassicEditor === 'undefined') {
            throw new Error('CKEDITOR instance not found');
        }
        ClassicEditor.create(document.getElementById(elementId), opts)
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

    function saveContent(view, modal) {
        if (ckEditorInstance) {
            const content = ckEditorInstance.getData();
            const selectedElement = view.model;
            const currentContent = selectedElement.get('content');
            if (currentContent !== content) {
                // Clear existing components to avoid conflicts
                selectedElement.components('');
                // Set the new content
                selectedElement.set('content', content);
            }
        }
        modal.close();
    }
};
