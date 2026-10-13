const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const origin = process.env.REVIEW_URL || 'http://127.0.0.1:3011';
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
 try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } }), errors = [];
  const user = { _id: '64b000000000000000000001', username: 'Discussion owner' }, other = { id: '64b000000000000000000004', name: 'Other collaborator' }, now = new Date().toISOString();
  const note = { _id: '64b000000000000000000002', owner: user._id, title: 'Working document', type: 'document', content: 'Writing stays independent.', sharedWith: [], favoritedBy: [], contentRevision: 0, createdAt: now, updatedAt: now };
  const members = [{ id: user._id, name: user.username }, other]; let thread = null, denied = false, conflict = false, canEdit = true, mutations = 0;
  page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept());
  await page.route('**/api/**', async route => {
   const req = route.request(), url = new URL(req.url()), path = url.pathname; let body, status = 200;
   if (path.endsWith('/getUser')) body = { user };
   else if (path.endsWith('/csrf-token')) body = { token: 'fixture' };
   else if (path.endsWith('/workspace')) body = { revision: 0, pinned: [], recent: [], searches: [] };
   else if (path.endsWith('/reminders')) body = { revision: 0, entries: [] };
   else if (path.endsWith('/embeds')) body = { revision: 0, canEdit: true, entries: [] };
   else if (path.endsWith('/shared')) body = [];
   else if (path.endsWith('/notes')) body = [note];
   else if (path.includes('/discussions')) {
    if (denied) { status = 404; body = { error: 'Note access removed' }; }
    else if (req.method() === 'POST' || req.method() === 'PATCH') {
     const input = req.postDataJSON(); mutations++;
     if (conflict) { status = 409; body = { error: 'This discussion changed. Refresh before posting or editing' }; conflict = false; }
     else {
      const post = () => ({ id: input.id, body: input.body, authorId: user._id, author: user.username, mentions: input.mentions.map(id => members.find(member => member.id === id)), deleted: false, createdAt: now });
      if (input.action === 'create') thread = { id: '64b000000000000000000003', noteId: note._id, title: note.title, revision: 0, resolved: false, canEdit, isOwner: true, members, posts: [post()] };
      else { expect(input.expectedRevision).toBe(thread.revision); thread.revision++;
       if (input.action === 'reply') thread.posts.push(post());
       if (input.action === 'edit') Object.assign(thread.posts.find(p => p.id === input.id), { body: input.body, mentions: post().mentions, editedAt: now });
       if (input.action === 'delete-post') Object.assign(thread.posts.find(p => p.id === input.id), { body: '', mentions: [], deleted: true });
       if (input.action === 'resolve' || input.action === 'reopen') thread.resolved = input.action === 'resolve';
      }
      body = { id: thread.id, removed: input.action === 'remove' }; if (input.action === 'remove') thread = null;
     }
    } else if (path.endsWith('/discussions')) {
     const filter = url.searchParams.get('filter'), match = thread && !(filter === 'unresolved' && thread.resolved) && !(filter === 'mentions' && !thread.posts.some(p => p.mentions.some(m => m.id === user._id)));
     body = { entries: match ? [{ id: thread.id, noteId: note._id, title: note.title, revision: thread.revision, resolved: thread.resolved, updatedAt: now, count: thread.posts.length, excerpt: thread.posts.at(-1).body }] : [], nextCursor: null, canEdit: Boolean(url.searchParams.get('noteId')) && canEdit, members };
    } else body = { ...thread, canEdit };
   } else if (path.endsWith('/' + note._id)) body = note;
   else { status = 404; body = { error: 'Unexpected fixture route' }; }
   await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(origin + '/notes/', { waitUntil: 'domcontentloaded', timeout: 60000 }); await expect(page.getByRole('textbox', { name: 'Visual document editor' })).toBeVisible({ timeout: 60000 });
  await page.getByRole('button', { name: 'Commands', exact: true }).click(); await page.getByRole('textbox', { name: 'Find a note or command' }).fill('Discussions'); await page.getByRole('button', { name: 'Discussions and mentions Action' }).click();
  const dialog = page.getByRole('dialog', { name: 'Discussions', exact: true }), input = dialog.getByRole('textbox', { name: 'Comment text' });
  await input.fill('<img src=x onerror=alert(1)> A comment'); await dialog.getByText('Mention collaborators (0/10)', { exact: true }).click(); await dialog.getByRole('checkbox', { name: other.name, exact: true }).check(); await dialog.getByRole('button', { name: 'Post discussion', exact: true }).click();
  await expect(dialog.locator('.discussion-posts')).toContainText('<img src=x onerror=alert(1)> A comment'); expect(await dialog.locator('.discussion-posts img').count()).toBe(0); await expect(dialog.locator('.discussion-posts')).toContainText('@Other collaborator');
  conflict = true; await input.fill('Retained reply'); await dialog.getByRole('button', { name: 'Post reply', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText('discussion changed'); await expect(input).toHaveValue('Retained reply');
  await dialog.getByRole('button', { name: 'Refresh discussions', exact: true }).click(); await expect(input).toHaveValue('Retained reply'); await dialog.getByRole('button', { name: 'Post reply', exact: true }).click(); await expect(dialog.locator('.discussion-posts li')).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Edit comment', exact: true }).last().click(); await input.fill('Corrected reply'); await dialog.getByRole('button', { name: 'Save comment', exact: true }).click(); await expect(dialog.locator('.discussion-posts')).toContainText('Corrected reply');
  await dialog.getByRole('button', { name: 'Resolve discussion', exact: true }).click(); await expect(dialog.getByRole('button', { name: 'Reopen discussion', exact: true })).toBeVisible(); await expect(input).toHaveCount(0); await dialog.getByRole('button', { name: 'Reopen discussion', exact: true }).click(); await expect(input).toBeVisible();
  for (const width of [1440, 390, 320]) { await page.setViewportSize({ width, height: 950 }); fs.mkdirSync("test/artifacts", { recursive: true }); await page.screenshot({ path: `test/artifacts/discussions-${width}.png` }); const overflow = await dialog.evaluate(node => ({ width: node.clientWidth, scroll: node.scrollWidth, children: [...node.querySelectorAll("*")].filter(child => child.getBoundingClientRect().right > node.getBoundingClientRect().right).map(child => ({ tag: child.tagName, cls: child.className, text: child.textContent.slice(0, 50), width: child.getBoundingClientRect().width })) })); if (overflow.scroll > overflow.width) console.log(width, overflow); expect(overflow.scroll <= overflow.width).toBe(true); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); fs.mkdirSync('test/artifacts', { recursive: true }); await page.screenshot({ path: `test/artifacts/discussions-${width}.png` }); }
  canEdit = false; await dialog.getByRole('button', { name: 'Refresh discussions', exact: true }).click(); await expect(input).toHaveCount(0); await expect(dialog.getByText('You have read-only access.', { exact: true })).toBeVisible();
  denied = true; await dialog.getByRole('button', { name: 'Refresh discussions', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText('access removed'); await expect(dialog.locator('.discussion-posts')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close discussions', exact: true }).click(); expect(note.content).toBe('Writing stays independent.'); expect(mutations).toBe(6); expect(errors).toEqual([]);
  console.log('Discussion creation, mentions, escaped text, conflict draft retention, editing, resolution, access revocation and mobile layouts passed.');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
