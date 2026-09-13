const composer = document.querySelector('#composer');
const openButtons = document.querySelectorAll('.open-composer');
const closeButton = document.querySelector('.close-modal');
const form = document.querySelector('#post-form');
const grid = document.querySelector('#post-grid');
const filters = document.querySelectorAll('.filter');
const typeChoices = document.querySelectorAll('.type-choice');
const photoField = document.querySelector('.photo-field');
const videoField = document.querySelector('.video-field');
const photoInput = document.querySelector('#photo-input');
const youtubeInput = document.querySelector('#youtube-input');
let composerType = 'photo';

const supabaseConfig = window.SUPABASE_CONFIG || {};
const supabaseAvailable = Boolean(supabaseConfig.url && supabaseConfig.anonKey);
const apiAvailable = window.location.protocol !== 'file:';
const supportedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

function supabaseHeaders(extra = {}) {
  return { apikey: supabaseConfig.anonKey, Authorization: `Bearer ${supabaseConfig.anonKey}`, ...extra };
}

function supabaseApi(path, options = {}) {
  return fetch(`${supabaseConfig.url}/rest/v1/${path}`, { ...options, headers: supabaseHeaders(options.headers) });
}

function setComposer(open) {
  composer.classList.toggle('open', open);
  composer.setAttribute('aria-hidden', String(!open));
  if (open) document.querySelector('.composer-modal input')?.focus();
}

openButtons.forEach(button => button.addEventListener('click', () => setComposer(true)));
closeButton.addEventListener('click', () => setComposer(false));
composer.addEventListener('click', event => { if (event.target === composer) setComposer(false); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') setComposer(false); });

typeChoices.forEach(choice => choice.addEventListener('click', () => {
  composerType = choice.dataset.composerType;
  typeChoices.forEach(item => item.classList.toggle('active', item === choice));
  photoField.classList.toggle('hidden', composerType !== 'photo');
  videoField.classList.toggle('hidden', composerType !== 'video');
  photoInput.required = composerType === 'photo';
  youtubeInput.required = composerType === 'video';
}));

filters.forEach(filter => filter.addEventListener('click', () => {
  filters.forEach(item => item.classList.toggle('active', item === filter));
  const selected = filter.dataset.filter;
  document.querySelectorAll('.post-card').forEach(card => card.classList.toggle('is-hidden', selected !== 'all' && card.dataset.type !== selected));
}));

function updateFilterCounts() {
  const cards = [...document.querySelectorAll('.post-card')];
  filters.forEach(filter => {
    const selected = filter.dataset.filter;
    const count = selected === 'all' ? cards.length : cards.filter(card => card.dataset.type === selected).length;
    filter.querySelector('span').textContent = String(count).padStart(2, '0');
  });
}

document.querySelectorAll('.save-button').forEach(button => button.addEventListener('click', () => {
  button.classList.toggle('saved');
  button.textContent = button.classList.contains('saved') ? '♥' : '♡';
}));

function youtubeThumbnail(url) {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^?&/]+)/);
  return match ? `https://img.youtube.com/vi/${match[1]}/maxresdefault.jpg` : 'https://images.unsplash.com/photo-1492619375914-88005aa9e8fb?auto=format&fit=crop&w=1000&q=85';
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(value));
}

function normalizePost(post) {
  return {
    id: post.id,
    type: post.type,
    caption: post.caption,
    collection: post.collection,
    image: post.image || post.image_url,
    youtubeUrl: post.youtubeUrl || post.youtube_url || '',
    createdAt: post.createdAt || post.created_at
  };
}

function createPostCard({ id, type, image, caption, collection, createdAt }) {
  const card = document.createElement('article');
  card.className = 'post-card';
  card.dataset.type = type;
  card.dataset.postId = id || '';
  card.innerHTML = `<div class="media-frame"><img src="${image}" alt="${caption.replaceAll('"', '&quot;')}"><span class="media-label ${type === 'video' ? 'video-label' : ''}">${type === 'video' ? '<span class="play-dot">▶</span> Video' : 'Photo'}</span><button class="save-button" type="button" aria-label="Save post">♡</button><button class="delete-button" type="button" aria-label="Delete post" title="Delete post">×</button></div><div class="post-meta"><span>${collection}</span><time>${formatDate(createdAt || new Date())}</time></div><h3>${caption}</h3>`;
  card.querySelector('.save-button').addEventListener('click', event => { event.currentTarget.classList.toggle('saved'); event.currentTarget.textContent = event.currentTarget.classList.contains('saved') ? '♥' : '♡'; });
  card.querySelector('.delete-button').addEventListener('click', () => deletePost(card));
  return card;
}

async function deletePost(card) {
  if (!card.dataset.postId || !confirm('Delete this journal post?')) return;
  try {
    let imageUrl = '';
    if (supabaseAvailable) {
      const existing = await supabaseApi(`posts?id=eq.${encodeURIComponent(card.dataset.postId)}&select=image_url`);
      if (existing.ok) imageUrl = (await existing.json())[0]?.image_url || '';
    }
    const response = supabaseAvailable
      ? await supabaseApi(`posts?id=eq.${encodeURIComponent(card.dataset.postId)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
      : await fetch(`/api/posts/${encodeURIComponent(card.dataset.postId)}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Could not delete post');
    const storagePrefix = '/storage/v1/object/public/media/';
    if (supabaseAvailable && imageUrl.includes(storagePrefix)) {
      const filePath = imageUrl.split(storagePrefix)[1];
      await fetch(`${supabaseConfig.url}/storage/v1/object/media`, { method: 'DELETE', headers: supabaseHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ prefixes: [decodeURIComponent(filePath)] }) });
    }
    card.remove();
    updateFilterCounts();
  } catch (error) {
    alert('The post could not be deleted. Make sure server.py is running.');
    console.error(error);
  }
}

async function loadSavedPosts() {
  if (!apiAvailable && !supabaseAvailable) return;
  try {
    const response = supabaseAvailable
      ? await supabaseApi('posts?select=*&order=created_at.desc')
      : await fetch('/api/posts');
    if (!response.ok) throw new Error('Could not load saved posts');
    const posts = (await response.json()).map(normalizePost);
    posts.reverse().forEach(post => grid.prepend(createPostCard(post)));
    updateFilterCounts();
  } catch (error) {
    console.warn('Saved posts are unavailable until the local server is running.', error);
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const caption = document.querySelector('#caption-input').value.trim();
  const collection = document.querySelector('#collection-input').value;
  const selectedPhoto = photoInput.files[0];
  if (composerType === 'photo' && selectedPhoto && !supportedImageTypes.has(selectedPhoto.type)) {
    alert('Please choose a JPG, PNG, or WebP image. HEIC images are not supported by most browsers.');
    return;
  }
  if (!apiAvailable && !supabaseAvailable) {
    let image = composerType === 'video' ? youtubeThumbnail(youtubeInput.value) : 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1000&q=85';
    if (composerType === 'photo' && selectedPhoto) image = URL.createObjectURL(selectedPhoto);
    grid.prepend(createPostCard({ type: composerType, image, caption, collection }));
  } else {
    const submitButton = form.querySelector('.submit-post');
    submitButton.disabled = true;
    submitButton.innerHTML = 'Saving...';
    const formData = new FormData();
    formData.append('type', composerType);
    formData.append('caption', caption);
    formData.append('collection', collection);
    formData.append('youtubeUrl', youtubeInput.value);
    if (selectedPhoto) formData.append('photo', selectedPhoto);
    try {
      let response;
      if (supabaseAvailable) {
        let image = 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1000&q=85';
        if (composerType === 'video') {
          image = youtubeThumbnail(youtubeInput.value);
        } else if (selectedPhoto) {
          const file = selectedPhoto;
          const filePath = `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
          const upload = await fetch(`${supabaseConfig.url}/storage/v1/object/media/${filePath}`, { method: 'POST', headers: supabaseHeaders({ 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false' }), body: file });
          if (!upload.ok) throw new Error('Could not upload image');
          image = `${supabaseConfig.url}/storage/v1/object/public/media/${filePath}`;
        }
        response = await supabaseApi('posts', { method: 'POST', headers: { Prefer: 'return=representation', 'Content-Type': 'application/json' }, body: JSON.stringify({ type: composerType, caption, collection, image_url: image, youtube_url: youtubeInput.value }) });
      } else {
        response = await fetch('/api/posts', { method: 'POST', body: formData });
      }
      if (!response.ok) throw new Error('Could not save post');
      const savedPost = await response.json();
      grid.prepend(createPostCard(normalizePost(Array.isArray(savedPost) ? savedPost[0] : savedPost)));
      updateFilterCounts();
    } catch (error) {
      alert('The post could not be saved. Make sure server.py is running.');
      console.error(error);
      submitButton.disabled = false;
      submitButton.innerHTML = 'Publish post <span>↗</span>';
      return;
    }
    submitButton.disabled = false;
    submitButton.innerHTML = 'Publish post <span>↗</span>';
  }
  form.reset();
  composerType = 'photo';
  typeChoices[0].click();
  setComposer(false);
});

updateFilterCounts();
loadSavedPosts();
