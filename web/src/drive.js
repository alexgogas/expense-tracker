// Verbatim port of index.html's Drive API helpers, reading accessToken/folderId from state.js's
// signals instead of bare globals.

import { accessToken, folderId, fileIds } from './state.js';

async function driveFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { Authorization: 'Bearer ' + accessToken.value, ...(options.headers || {}) }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Drive API error ${res.status}: ${body}`);
  }
  return res;
}

export async function listFilesInFolder(fId) {
  const q = encodeURIComponent(`'${fId}' in parents and trashed=false`);
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=100`);
  const data = await res.json();
  return data.files || [];
}

export async function downloadFile(fId) {
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fId}?alt=media`);
  return res.text();
}

export async function updateFileContent(fId, textContent, mimeType) {
  const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fId}?uploadType=media`, {
    method: 'PATCH',
    headers: {
      Authorization: 'Bearer ' + accessToken.value,
      'Content-Type': mimeType || 'application/json'
    },
    body: textContent
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Drive update failed ${res.status}: ${body}`);
  }
  return res.json();
}

// Files created by the app (as opposed to pre-existing files the user picked) automatically get
// drive.file write access — no Picker "grant access" step needed, unlike updateFileContent above.
export async function createFileInFolder(name, textContent, mimeType) {
  const boundary = 'expense_tracker_boundary';
  const metadata = { name, parents: [folderId.value], mimeType: mimeType || 'application/json' };
  const body =
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: ${metadata.mimeType}\r\n\r\n${textContent}\r\n` +
    `--${boundary}--`;
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken.value,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Drive create failed ${res.status}: ${errBody}`);
  }
  const data = await res.json();
  // fileIds is a signal holding a plain object — every write must replace it with a shallow copy
  // (see state.js's reference-equality note), not mutate in place.
  fileIds.value = { ...fileIds.value, [name]: data.id };
  return data.id;
}
