const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const origin = process.env.REVIEW_URL || 'http://127.0.0.1:3011';
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
 try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } }), errors = [];
  const user = { _id: '64b000000000000000000001', username: 'Notebook owner' }, member = { id: '64b000000000000000000005', name: 'Notebook collaborator', permission: 'viewer' }, now = new Date().toISOString();
  const host = { _id: '64b000000000000000000002', owner: user._id, title: 'Current document', type: 'document', content: 'Writing stays private.', sharedWith: [], favoritedBy: [], contentRevision: 0, createdAt: now, updatedAt: now };
  const doc = { ...host, _id: '64b000000000000000000003', title: 'Research document' }, board = { ...host, _id: '64b000000000000000000004', title: 'Research board', type: 'whiteboard', content: JSON.stringify({ elements: [], viewport: { panX: 0, panY: 0, zoom: 1 } }) };
  const notes = [host, doc, board]; let book = null, conflict = false, denied = false;
  page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept());
  await page.route('**/api/**', async route => {
   const req = route.request(), path = new URL(req.url()).pathname; let body, status = 200;
   if (path.endsWith('/getUser')) body = { user };
   else if (path.endsWith('/csrf-token')) body = { token: 'fixture' };
   else if (path.endsWith('/workspace')) body = { revision: 0, pinned: [], recent: [], searches: [] };
   else if (path.endsWith('/reminders')) body = { revision: 0, entries: [] };
   else if (path.endsWith('/embeds')) body = { revision: 0, canEdit: true, entries: [] };
   else if (path.endsWith('/shared')) body = [];
   else if (path.endsWith('/notes')) body = notes;
   else if (path.includes('/notebooks')) {
    if (denied) { status = 404; body = { error: 'Notebook access removed' }; }
    else if (req.method() === 'POST') { const input = req.postDataJSON(); expect(input.id).toMatch(/^[a-f0-9-]{36}$/); book = { id: '64b000000000000000000006', name: input.name, revision: 0, owner: user._id, ownerName: user.username, isOwner: true, members: [], notes: [] }; body = { id: book.id }; }
    else if (req.method() === 'PATCH') {
     const input = req.postDataJSON(); expect(input.expectedRevision).toBe(book.revision);
     if (conflict) { conflict = false; status = 409; body = { error: 'The notebook changed. Refresh before editing' }; }
     else { book.revision++;
      if (input.action === 'rename') book.name = input.name;
      if (input.action === 'member') { if (input.memberId) expect(input.memberId).toBe(member.id); book.members = [{ ...member, permission: input.permission }]; }
      if (input.action === 'remove-member') book.members = [];
      if (input.action === 'attach') { const note = notes.find(note => note._id === input.noteId); expect(input.expectedContentRevision).toBe(note.contentRevision); note.sharedNotebookId = book.id; book.notes.push({ id: note._id, title: note.title, type: note.type, revision: note.contentRevision }); }
      if (input.action === 'detach') { const note = notes.find(note => note._id === input.noteId); note.sharedNotebookId = null; note.sharedWith = []; book.notes = book.notes.filter(note => note.id !== input.noteId); }
      if (input.action === 'delete') { expect(input.confirmation).toBe(book.id); for (const note of notes) if (note.sharedNotebookId === book.id) { note.sharedNotebookId = null; note.sharedWith = []; } }
      for (const note of notes) if (note.sharedNotebookId === book.id) note.sharedWith = book.members.map(member => ({ userId: member.id, permission: member.permission }));
      body = { id: book.id, removed: input.action === 'delete' }; if (input.action === 'delete') book = null;
     }
    } else if (path.endsWith('/notebooks')) body = { entries: book ? [{ ...book, permission: book.isOwner ? 'owner' : 'viewer', noteCount: book.notes.length }] : [], nextCursor: null };
    else body = book;
   } else { const note = notes.find(note => path.endsWith('/' + note._id)); if (note) body = note; else { status = 404; body = { error: 'Unexpected fixture route' }; } }
   await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(origin + '/notes/', { waitUntil: 'domcontentloaded', timeout: 60000 }); await expect(page.getByRole('textbox', { name: 'Visual document editor' })).toBeVisible({ timeout: 60000 });
  await page.getByRole('button', { name: 'Commands', exact: true }).click(); await page.getByRole('textbox', { name: 'Find a note or command' }).fill('Shared notebooks'); await page.getByRole('button', { name: 'Shared notebooks Action' }).click();
  const dialog = page.getByRole('dialog', { name: 'Shared notebooks', exact: true });
  await dialog.getByLabel('New notebook name', { exact: true }).fill('Research group'); await dialog.getByRole('button', { name: 'Create notebook', exact: true }).click(); await expect(dialog.getByRole('heading', { name: 'Research group', exact: true })).toBeVisible();
  for (const note of [doc, board]) { await dialog.getByLabel('Private note to add', { exact: true }).selectOption(note._id); await dialog.getByRole('button', { name: 'Add note', exact: true }).click(); await expect(dialog.getByRole('button', { name: note.title, exact: true })).toBeVisible(); }
  await dialog.getByLabel('Confirmed username or verified email', { exact: true }).fill(member.name); await dialog.getByRole('button', { name: 'Add member', exact: true }).click(); await expect(dialog.getByRole('button', { name: 'Make editor', exact: true })).toBeVisible();
  expect(doc.sharedWith[0].permission).toBe('viewer'); expect(board.sharedWith[0].permission).toBe('viewer');
  await dialog.getByRole('button', { name: 'Make editor', exact: true }).click(); await expect(dialog.getByRole('button', { name: 'Make viewer', exact: true })).toBeVisible(); expect(board.sharedWith[0].permission).toBe('editor');
  conflict = true; await dialog.getByLabel('Notebook name', { exact: true }).fill('Renamed research'); await dialog.getByRole('button', { name: 'Rename notebook', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText('notebook changed'); await expect(dialog.getByLabel('Notebook name', { exact: true })).toHaveValue('Renamed research');
  await dialog.getByRole('button', { name: 'Refresh notebooks', exact: true }).click(); await expect(dialog.getByLabel('Notebook name', { exact: true })).toHaveValue('Research group'); await dialog.getByLabel('Notebook name', { exact: true }).fill('Renamed research'); await dialog.getByRole('button', { name: 'Rename notebook', exact: true }).click(); await expect(dialog.getByRole('heading', { name: 'Renamed research', exact: true })).toBeVisible();
  for (const width of [1440, 390, 320]) { await page.setViewportSize({ width, height: 950 }); expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); fs.mkdirSync('test/artifacts', { recursive: true }); await page.screenshot({ path: `test/artifacts/notebooks-${width}.png` }); }
  await dialog.getByRole('button', { name: 'Detach note', exact: true }).first().click(); await expect(dialog.getByRole('button', { name: doc.title, exact: true })).toHaveCount(0); expect(doc.sharedWith).toEqual([]); expect(doc.content).toBe('Writing stays private.');
  await dialog.getByRole('button', { name: 'Remove member', exact: true }).click(); await expect(dialog.getByText('Only the owner has access.', { exact: true })).toBeVisible(); expect(board.sharedWith).toEqual([]);
  book.isOwner = false; await dialog.getByRole('button', { name: 'Refresh notebooks', exact: true }).click(); await expect(dialog.getByRole('button', { name: 'Add note', exact: true })).toHaveCount(0); await expect(dialog.getByRole('button', { name: 'Remove member', exact: true })).toHaveCount(0);
  book.isOwner = true; await dialog.getByRole('button', { name: 'Refresh notebooks', exact: true }).click(); await dialog.getByRole('button', { name: 'Delete notebook, keep notes', exact: true }).click(); await expect(dialog.getByText('No shared notebooks yet.', { exact: true })).toBeVisible(); expect(board.sharedNotebookId).toBe(null); expect(notes).toHaveLength(3);
  denied = true; await dialog.getByRole('button', { name: 'Refresh notebooks', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText('access removed'); await dialog.getByRole('button', { name: 'Close notebooks', exact: true }).click(); expect(errors).toEqual([]);
  console.log('Shared notebook creation, inherited roles, conflict handling, private detachment, deletion preserving notes, viewer controls and responsive layouts passed.');
 } catch (error) { const failedPage = browser.contexts()[0]?.pages()[0]; if (failedPage) { console.error((await failedPage.locator("body").innerText()).slice(-9000)); await failedPage.screenshot({ path: "test/artifacts/notebook-failure.png" }); } throw error; } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
