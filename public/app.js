const root = document.querySelector('#app');
const account = document.querySelector('#account');
const state = {
  user: readStoredUser(),
  loginError: '',
};

let activeEditor = null;
let routeVersion = 0;

function readStoredUser() {
  try {
    const user = JSON.parse(localStorage.getItem('docs-user'));
    return Number.isSafeInteger(user?.id) && typeof user.username === 'string'
      ? user
      : null;
  } catch {
    return null;
  }
}

function element(tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function showError(container, message) {
  container.textContent = message;
  container.hidden = false;
}

function clearError(container) {
  container.textContent = '';
  container.hidden = true;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
  });
  if (response.status === 204) {
    return null;
  }

  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || 'Request failed');
    error.status = response.status;
    throw error;
  }
  return result;
}

function jsonOptions(method, body) {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function setUser(user) {
  state.user = user;
  if (user) {
    localStorage.setItem('docs-user', JSON.stringify(user));
  } else {
    localStorage.removeItem('docs-user');
  }
  renderAccount();
}

function renderAccount() {
  account.replaceChildren();
  if (!state.user) {
    return;
  }

  account.append(element('span', '', state.user.username));
  const logoutButton = element('button', '', 'Log out');
  logoutButton.type = 'button';
  logoutButton.addEventListener('click', async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch (requestError) {
      state.loginError = requestError.message;
    }
    activeEditor = null;
    setUser(null);
    navigate('/login');
  });
  account.append(logoutButton);
}

function navigate(path) {
  const hash = `#${path}`;
  if (window.location.hash === hash) {
    void renderRoute();
  } else {
    window.location.hash = path;
  }
}

function errorBox() {
  const error = element('p', 'error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  return error;
}

async function renderLogin(version, initialError = '') {
  activeEditor = null;
  root.replaceChildren();

  const panel = element('section', 'panel');
  const heading = element('h1', '', 'Welcome to Docs with Friends.');
  const description = element('p', 'muted', 'Choose a seeded user to continue.');
  const error = errorBox();
  if (initialError) {
    showError(error, initialError);
  }
  const form = element('form');
  const field = element('div', 'field');
  const label = element('label', '', 'User');
  label.htmlFor = 'username';
  const select = element('select');
  select.id = 'username';
  select.name = 'username';
  const submit = element('button', 'primary', 'Continue');
  submit.type = 'submit';
  field.append(label, select);
  form.append(field, submit);
  panel.append(heading, description, error, form);
  root.append(panel);

  try {
    const users = await api('/auth/users');
    if (version !== routeVersion) {
      return;
    }
    for (const user of users) {
      const option = element('option', '', user.username);
      option.value = user.username;
      select.append(option);
    }
  } catch (requestError) {
    showError(error, requestError.message);
    return;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError(error);
    submit.disabled = true;
    try {
      const user = await api('/auth/login', jsonOptions('POST', {
        username: select.value,
      }));
      setUser(user);
      navigate('/documents');
    } catch (requestError) {
      showError(error, requestError.message);
    } finally {
      submit.disabled = false;
    }
  });
}

function formatUpdatedAt(timestamp) {
  const date = new Date(`${timestamp.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString();
}

function addDocumentRows(list, documents, emptyMessage) {
  list.replaceChildren();
  if (documents.length === 0) {
    list.append(element('p', 'empty-state', emptyMessage));
    return;
  }

  for (const doc of documents) {
    const row = element('button', 'document-row');
    row.type = 'button';
    row.append(
      element('span', 'document-title', doc.title),
      element('span', 'document-date', `Updated ${formatUpdatedAt(doc.updated_at)}`),
    );
    row.addEventListener('click', () => navigate(`/documents/${doc.id}`));
    list.append(row);
  }
}

async function renderDocumentList(version) {
  activeEditor = null;
  root.replaceChildren();

  const heading = element('div', 'page-heading');
  const titleGroup = document.createElement('div');
  titleGroup.append(
    element('h1', '', 'Your documents'),
    element('p', 'muted', 'Create and edit your notes.'),
  );
  const newButton = element('button', 'primary', 'New document');
  newButton.type = 'button';
  const importButton = element('button', '', 'Import file');
  importButton.type = 'button';
  const importInput = element('input');
  importInput.type = 'file';
  importInput.accept = '.txt,.md,.docx';
  importInput.hidden = true;
  const actions = element('div', 'list-actions');
  const actionButtons = element('div', 'action-buttons');
  actionButtons.append(newButton, importButton);
  actions.append(
    actionButtons,
    element('span', 'import-note', 'Accepted: .txt, .md, .docx'),
    importInput,
  );
  heading.append(titleGroup, actions);

  const error = errorBox();
  const ownedSection = document.createElement('section');
  ownedSection.append(element('h2', '', 'Owned by me'));
  const ownedList = element('div', 'document-list');
  ownedList.setAttribute('aria-live', 'polite');
  ownedList.append(element('p', 'empty-state', 'Loading documents...'));
  ownedSection.append(ownedList);

  const sharedSection = document.createElement('section');
  sharedSection.className = 'document-section';
  sharedSection.append(element('h2', '', 'Shared with me'));
  const sharedList = element('div', 'document-list');
  sharedList.setAttribute('aria-live', 'polite');
  sharedList.append(element('p', 'empty-state', 'Loading documents...'));
  sharedSection.append(sharedList);
  root.append(heading, error, ownedSection, sharedSection);

  newButton.addEventListener('click', async () => {
    clearError(error);
    newButton.disabled = true;
    try {
      const created = await api('/api/documents', jsonOptions('POST', {
        title: 'Untitled document',
      }));
      navigate(`/documents/${created.id}`);
    } catch (requestError) {
      showError(error, requestError.message);
    } finally {
      newButton.disabled = false;
    }
  });

  importButton.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    if (!file) {
      return;
    }

    clearError(error);
    importButton.disabled = true;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const imported = await api('/api/documents/import', {
        method: 'POST',
        body: formData,
      });
      navigate(`/documents/${imported.id}`);
    } catch (requestError) {
      showError(error, requestError.message);
    } finally {
      importButton.disabled = false;
      importInput.value = '';
    }
  });

  try {
    const documents = await api('/api/documents');
    if (version !== routeVersion) {
      return;
    }
    addDocumentRows(ownedList, documents.owned, 'No owned documents yet.');
    addDocumentRows(sharedList, documents.shared, 'No documents have been shared with you.');
  } catch (requestError) {
    if (requestError.status === 401) {
      setUser(null);
      navigate('/login');
      return;
    }
    showError(error, requestError.message);
  }
}

function toolbarButton(label, command, value) {
  const button = element('button', '', label);
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.addEventListener('mousedown', (event) => event.preventDefault());
  button.addEventListener('click', () => {
    const editor = document.querySelector('.editor-body');
    if (!editor) {
      return;
    }
    editor.focus();
    document.execCommand(command, false, value);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return button;
}

function sanitizeEditorHtml(html) {
  const allowedTags = new Set([
    'b', 'br', 'div', 'em', 'h1', 'h2', 'i', 'li', 'ol', 'p', 'strong', 'u', 'ul',
  ]);
  const removedTags = new Set([
    'audio', 'base', 'embed', 'form', 'iframe', 'img', 'input', 'link', 'math',
    'meta', 'object', 'script', 'style', 'svg', 'template', 'video',
  ]);
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const cleanRoot = document.createElement('div');

  function copySafeNode(node, parent) {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.append(document.createTextNode(node.textContent));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const tag = node.tagName.toLowerCase();
    if (removedTags.has(tag)) {
      return;
    }
    if (!allowedTags.has(tag)) {
      for (const child of node.childNodes) {
        copySafeNode(child, parent);
      }
      return;
    }

    const cleanElement = document.createElement(tag);
    parent.append(cleanElement);
    for (const child of node.childNodes) {
      copySafeNode(child, cleanElement);
    }
  }

  for (const child of parsed.body.childNodes) {
    copySafeNode(child, cleanRoot);
  }
  return cleanRoot.innerHTML;
}

function createSharePanel(documentId, error) {
  const panel = element('section', 'share-panel');
  panel.append(
    element('h2', '', 'Share document'),
    element('p', 'muted', 'Share with one of the seeded users.'),
  );

  const form = element('form', 'share-form');
  const field = element('div', 'field');
  const label = element('label', '', 'Username');
  label.htmlFor = 'share-username';
  const username = element('input');
  username.type = 'text';
  username.id = 'share-username';
  username.name = 'username';
  username.autocomplete = 'off';
  username.placeholder = 'e.g. ishmael';
  const submit = element('button', 'primary', 'Share');
  submit.type = 'submit';
  field.append(label, username);
  form.append(field, submit);
  panel.append(form, element('h3', '', 'Current collaborators'));

  const collaboratorList = element('ul', 'collaborator-list');
  collaboratorList.append(element('li', 'muted', 'Loading collaborators...'));
  panel.append(collaboratorList);

  async function refreshCollaborators() {
    const result = await api(`/api/documents/${documentId}/share`);
    collaboratorList.replaceChildren();
    if (result.collaborators.length === 0) {
      collaboratorList.append(element('li', 'muted', 'No collaborators yet.'));
      return;
    }

    for (const collaborator of result.collaborators) {
      const item = element('li', 'collaborator');
      item.append(element('span', '', collaborator.username));
      const removeButton = element('button', '', 'Remove');
      removeButton.type = 'button';
      removeButton.setAttribute(
        'aria-label',
        `Remove access for ${collaborator.username}`,
      );
      removeButton.addEventListener('click', async () => {
        removeButton.disabled = true;
        clearError(error);
        try {
          await api(
            `/api/documents/${documentId}/share/${collaborator.user_id}`,
            { method: 'DELETE' },
          );
          await refreshCollaborators();
        } catch (requestError) {
          showError(error, requestError.message);
          removeButton.disabled = false;
        }
      });
      item.append(removeButton);
      collaboratorList.append(item);
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError(error);
    submit.disabled = true;
    try {
      await api(
        `/api/documents/${documentId}/share`,
        jsonOptions('POST', { username: username.value }),
      );
      username.value = '';
      await refreshCollaborators();
    } catch (requestError) {
      showError(error, requestError.message);
    } finally {
      submit.disabled = false;
    }
  });

  void refreshCollaborators().catch((requestError) => {
    showError(error, requestError.message);
    collaboratorList.replaceChildren();
  });

  return panel;
}

function formatFileSize(size) {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function createAttachmentsPanel(documentId, error) {
  const panel = element('section', 'attachments-panel');
  panel.append(
    element('h2', '', 'Attachments'),
    element('p', 'muted', 'Upload files up to 10 MB each.'),
  );

  const form = element('form', 'attachment-form');
  const field = element('div', 'field');
  const label = element('label', '', 'Choose a file');
  label.htmlFor = 'attachment-file';
  const fileInput = element('input');
  fileInput.type = 'file';
  fileInput.id = 'attachment-file';
  fileInput.name = 'file';
  field.append(label, fileInput);
  const uploadButton = element('button', 'primary', 'Upload');
  uploadButton.type = 'submit';
  form.append(field, uploadButton);
  panel.append(form);

  const attachmentList = element('ul', 'attachment-list');
  attachmentList.append(element('li', 'muted', 'Loading attachments...'));
  panel.append(attachmentList);

  async function refreshAttachments() {
    const result = await api(`/api/documents/${documentId}/attachments`);
    attachmentList.replaceChildren();
    if (result.attachments.length === 0) {
      attachmentList.append(element('li', 'muted', 'No attachments yet.'));
      return;
    }

    for (const attachment of result.attachments) {
      const item = element('li', 'attachment-item');
      const link = element('a', 'attachment-link', attachment.filename);
      link.href = `/api/documents/${documentId}/attachments/${attachment.id}`;
      const size = element('span', 'muted', formatFileSize(attachment.size));
      item.append(link, size);
      attachmentList.append(item);
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const file = fileInput.files?.[0];
    if (!file) {
      showError(error, 'Choose a file to upload.');
      return;
    }

    clearError(error);
    uploadButton.disabled = true;
    const formData = new FormData();
    formData.append('file', file);
    try {
      await api(`/api/documents/${documentId}/attachments`, {
        method: 'POST',
        body: formData,
      });
      fileInput.value = '';
      await refreshAttachments();
    } catch (requestError) {
      showError(error, requestError.message);
    } finally {
      uploadButton.disabled = false;
    }
  });

  void refreshAttachments().catch((requestError) => {
    showError(error, requestError.message);
    attachmentList.replaceChildren();
  });

  return panel;
}

function createDeleteControls(documentId, error) {
  const controls = element('details', 'danger-dropdown');
  const summary = element('summary', '', 'DANGEROUS');
  const actions = element('div', 'delete-controls');
  const deleteButton = element('button', '', 'Delete document');
  deleteButton.type = 'button';

  const confirmation = element('div', 'delete-confirmation');
  confirmation.hidden = true;
  confirmation.append(element('span', '', 'Delete this document permanently?'));
  const confirmButton = element('button', 'danger', 'Confirm delete');
  confirmButton.type = 'button';
  const cancelButton = element('button', '', 'Cancel');
  cancelButton.type = 'button';
  confirmation.append(confirmButton, cancelButton);
  actions.append(deleteButton, confirmation);
  controls.append(summary, actions);

  deleteButton.addEventListener('click', () => {
    deleteButton.hidden = true;
    confirmation.hidden = false;
    confirmButton.focus();
  });
  cancelButton.addEventListener('click', () => {
    confirmation.hidden = true;
    deleteButton.hidden = false;
    deleteButton.focus();
  });
  confirmButton.addEventListener('click', async () => {
    confirmButton.disabled = true;
    clearError(error);
    try {
      await api(`/api/documents/${documentId}`, { method: 'DELETE' });
      activeEditor = null;
      navigate('/documents');
    } catch (requestError) {
      showError(error, requestError.message);
      confirmButton.disabled = false;
    }
  });

  return controls;
}

async function renderEditor(version, documentId) {
  activeEditor = null;
  root.replaceChildren();

  const error = errorBox();
  const loading = element('p', 'muted', 'Loading document...');
  root.append(error, loading);

  let doc;
  try {
    doc = await api(`/api/documents/${documentId}`);
  } catch (requestError) {
    if (version !== routeVersion) {
      return;
    }
    root.replaceChildren(error);
    showError(error, requestError.message);
    return;
  }
  if (version !== routeVersion) {
    return;
  }

  const isOwner = doc.owner_id === state.user.id;
  const editorHeader = element('div', 'editor-header');
  const back = element('a', 'back-link', '← All documents');
  back.href = '#/documents';
  const saveStatus = element('span', 'save-status', 'Saved');
  editorHeader.append(back, saveStatus);

  const card = element('section', 'editor-card');
  const titleWrap = element('div', 'title-wrap');
  const titleLabel = element('label', 'title-label', isOwner ? 'Document title' : 'Shared document');
  titleLabel.htmlFor = 'document-title';
  const title = element('input');
  title.type = 'text';
  title.id = 'document-title';
  title.value = doc.title;
  title.readOnly = !isOwner;
  titleWrap.append(titleLabel, title);

  const toolbar = element('div', 'toolbar');
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Text formatting');
  toolbar.append(
    toolbarButton('B', 'bold'),
    toolbarButton('I', 'italic'),
    toolbarButton('U', 'underline'),
    toolbarButton('H1', 'formatBlock', 'H1'),
    toolbarButton('H2', 'formatBlock', 'H2'),
    toolbarButton('• List', 'insertUnorderedList'),
    toolbarButton('1. List', 'insertOrderedList'),
  );

  const body = element('div', 'editor-body');
  body.contentEditable = 'true';
  body.setAttribute('role', 'textbox');
  body.setAttribute('aria-label', 'Document content');
  body.setAttribute('aria-multiline', 'true');
  body.innerHTML = sanitizeEditorHtml(doc.contentHtml);

  const saveBar = element('div', 'save-bar');
  const saveButton = element('button', 'primary', 'Save');
  saveButton.type = 'button';
  saveBar.append(saveStatus);
  saveBar.append(saveButton);
  card.append(titleWrap, toolbar, body, saveBar);
  root.replaceChildren(editorHeader, error, card);
  if (isOwner) {
    root.append(createSharePanel(documentId, error));
  }
  root.append(createAttachmentsPanel(documentId, error));
  if (isOwner) {
    root.append(createDeleteControls(documentId, error));
  }

  let revision = 0;
  let savedRevision = 0;
  let saving = null;
  const markDirty = () => {
    revision += 1;
    saveStatus.textContent = 'Unsaved changes';
  };

  title.addEventListener('input', markDirty);
  body.addEventListener('input', markDirty);
  body.addEventListener('paste', (event) => {
    const clipboard = event.clipboardData;
    if (!clipboard) {
      return;
    }

    event.preventDefault();
    const html = clipboard.getData('text/html');
    const pastedContent = html
      ? sanitizeEditorHtml(html)
      : clipboard.getData('text/plain');
    document.execCommand(html ? 'insertHTML' : 'insertText', false, pastedContent);
    body.dispatchEvent(new Event('input', { bubbles: true }));
  });

  const save = async () => {
    if (revision === savedRevision || saving) {
      return saving;
    }

    const savedAtRevision = revision;
    const payload = { contentHtml: body.innerHTML };
    if (isOwner) {
      payload.title = title.value;
    }
    clearError(error);
    saveStatus.textContent = 'Saving...';
    saving = api(`/api/documents/${documentId}`, jsonOptions('PATCH', payload))
      .then(() => {
        savedRevision = savedAtRevision;
        saveStatus.textContent = revision === savedRevision
          ? 'Saved'
          : 'Unsaved changes';
      })
      .catch((requestError) => {
        saveStatus.textContent = 'Unsaved changes';
        showError(error, requestError.message);
      })
      .finally(() => {
        saving = null;
      });

    return saving;
  };

  saveButton.addEventListener('click', () => void save());
  activeEditor = {
    isDirty: () => revision !== savedRevision,
    save,
  };
}

async function renderRoute() {
  const version = ++routeVersion;
  renderAccount();

  const path = window.location.hash.slice(1) || (state.user ? '/documents' : '/login');
  if (!state.user && path !== '/login') {
    navigate('/login');
    return;
  }

  if (path === '/login') {
    if (state.user) {
      navigate('/documents');
      return;
    }
    const loginError = state.loginError;
    state.loginError = '';
    await renderLogin(version, loginError);
    return;
  }

  if (path === '/documents') {
    await renderDocumentList(version);
    return;
  }

  const match = path.match(/^\/documents\/(\d+)$/);
  if (match) {
    await renderEditor(version, match[1]);
    return;
  }

  navigate(state.user ? '/documents' : '/login');
}

async function start() {
  if (state.user) {
    try {
      await api('/api/documents');
    } catch {
      setUser(null);
    }
  }

  if (!window.location.hash) {
    window.location.hash = state.user ? '/documents' : '/login';
  } else {
    await renderRoute();
  }
}

window.addEventListener('hashchange', () => void renderRoute());
window.setInterval(() => {
  if (activeEditor?.isDirty()) {
    void activeEditor.save();
  }
}, 5000);

void start();
