const API_BASE = 'https://api.wallapop.com';

const LOG_PREFIX = '[Wallapop Relist]';

// Fixed shipping-payer config ids from Wallapop's web bundle.
const SHIPPING_COST_CONFIG = {
  BUYER_PAYS: '814429d6-7844-471d-97af-196cd4020f26',
  SELLER_PAYS: '04cf65ea-42f5-11ed-b878-0242ac120002',
};

function log(...args) {
  console.log(LOG_PREFIX, ...args);
}

function logError(...args) {
  console.error(LOG_PREFIX, ...args);
}

async function getAuthHeaders(tokenFromPage) {
  if (tokenFromPage) {
    return {
      'Authorization': `Bearer ${tokenFromPage}`,
    };
  }

  // Fallback: read it from a cookie.
  const cookies = await chrome.cookies.getAll({ domain: '.wallapop.com' });
  const accessToken = cookies.find(c => c.name === 'accessToken')?.value;

  log(`getAuthHeaders: no page token; found ${cookies.length} cookies on .wallapop.com`, cookies.map(c => c.name));

  if (!accessToken) {
    throw new Error(chrome.i18n.getMessage('errNoToken'));
  }

  return {
    'Authorization': `Bearer ${accessToken}`,
  };
}

async function resolveItemId(slug, headers) {
  // The URL slug isn't the API id; match it against the user's items to get it.
  const url = `${API_BASE}/api/v3/user/items`;
  log(`resolveItemId: GET ${url} to resolve slug=${slug}`);
  const response = await fetch(url, {
    method: 'GET',
    headers: { ...headers, 'Content-Type': 'application/json' },
  });

  log(`resolveItemId: status ${response.status}`);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    logError(`resolveItemId failed: ${response.status}`, body);
    throw new Error(`Error al obtener tus anuncios: ${response.status} - ${body}`);
  }

  const json = await response.json();
  const items = json.data || [];
  const match = items.find(i => i.slug === slug);

  if (!match) {
    logError(`resolveItemId: slug "${slug}" not found among ${items.length} items`, items.map(i => i.slug));
    throw new Error(`No se encontró el anuncio "${slug}" entre tus ${items.length} anuncios. (¿Está en otra página de resultados?)`);
  }

  log(`resolveItemId: slug=${slug} -> id=${match.id}`);
  return match.id;
}

async function getItemDetails(itemId, headers) {
  const url = `${API_BASE}/api/v3/items/${itemId}`;
  log(`getItemDetails: GET ${url}`);
  const response = await fetch(url, {
    method: 'GET',
    headers: { ...headers, 'Content-Type': 'application/json' },
  });

  log(`getItemDetails: status ${response.status}`);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    logError(`getItemDetails failed: ${response.status}`, body);
    throw new Error(`Error al obtener detalles del anuncio: ${response.status} - ${body}`);
  }

  return response.json();
}

async function downloadImage(imageUrl) {
  log(`downloadImage: ${imageUrl}`);
  const response = await fetch(imageUrl);
  if (!response.ok) {
    logError(`downloadImage failed: ${response.status} for ${imageUrl}`);
    throw new Error(`Error al descargar imagen: ${response.status}`);
  }
  const blob = await response.blob();
  log(`downloadImage: ok (${blob.size} bytes, ${blob.type})`);
  return blob;
}

async function deleteItem(itemId, headers) {
  const url = `${API_BASE}/api/v3/items/${itemId}`;
  log(`deleteItem: DELETE ${url}`);
  const response = await fetch(url, {
    method: 'DELETE',
    headers: { ...headers, 'Content-Type': 'application/json' },
  });

  log(`deleteItem: status ${response.status}`);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    logError(`deleteItem failed: ${response.status}`, body);
    throw new Error(`Error al eliminar el anuncio: ${response.status} - ${body}`);
  }

  return true;
}

// The Accept header selects the v2 upload route (without it, create returns 405).
// Content-Type is left unset so the browser sets the multipart boundary.
function uploadHeadersFor(headers) {
  return {
    ...headers,
    'Accept': 'application/vnd.upload-v2+json',
    'X-DeviceOS': '0',
  };
}

// Uploads one extra image (the create call only takes the first).
async function uploadItemPicture(itemId, blob, headers, order) {
  const url = `${API_BASE}/api/v3/items/${itemId}/picture2`;
  const formData = new FormData();
  formData.append('image', blob, 'image.jpg');
  formData.append('order', String(order));

  log(`uploadItemPicture: POST ${url} (order ${order})`);
  const response = await fetch(url, {
    method: 'POST',
    headers: uploadHeadersFor(headers),
    body: formData,
  });

  log(`uploadItemPicture: status ${response.status} (order ${order})`);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    logError(`uploadItemPicture failed (order ${order}): ${response.status}`, body);
    throw new Error(`Error al subir la imagen ${order}: ${response.status} - ${body}`);
  }
  return response.json().catch(() => ({}));
}

async function createItem(itemPayload, imageBlobs, headers) {
  const [firstBlob, ...restBlobs] = imageBlobs;

  const formData = new FormData();
  // Only the first image goes in the create request.
  if (firstBlob) formData.append('image', firstBlob, 'image.jpg');
  formData.append('item', JSON.stringify(itemPayload));

  log(`createItem: POST ${API_BASE}/api/v3/items with first of ${imageBlobs.length} images`, itemPayload);
  const response = await fetch(`${API_BASE}/api/v3/items`, {
    method: 'POST',
    headers: uploadHeadersFor(headers),
    body: formData,
  });

  log(`createItem: status ${response.status}`);
  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    logError(`createItem failed: ${response.status}`, errorBody);
    throw new Error(`Error al crear el anuncio: ${response.status} - ${errorBody}`);
  }

  const created = await response.json();
  log('createItem: created', created);

  // Remaining images, 0-indexed (order 0, 1, ...) as the web sends them.
  for (let i = 0; i < restBlobs.length; i++) {
    await uploadItemPicture(created.id, restBlobs[i], headers, i);
  }

  return created;
}

function generateUploadId() {
  return crypto.randomUUID();
}

// Multi-value attributes (color/material) go as a comma-joined string.
function toCommaValue(attr) {
  if (!attr) return null;
  const v = attr.value;
  if (Array.isArray(v)) return v.length ? v.join(',') : null;
  return v != null ? v : null;
}

function buildCreatePayload(item) {
  const attributes = {
    title: item.title.original,
    description: item.description.original,
    price_amount: item.price.cash.amount,
    condition: item.type_attributes?.condition?.value || null,
    color: toCommaValue(item.type_attributes?.color),
    material: toCommaValue(item.type_attributes?.material),
    brand: item.type_attributes?.brand?.value || null,
    suggested_data_banner: null,
  };

  // Dimensions come as strings but the create API requires numbers.
  const heightCm = item.type_attributes?.height_cm?.value;
  const widthCm = item.type_attributes?.width_cm?.value;
  const lengthCm = item.type_attributes?.length_cm?.value;
  if (heightCm != null && heightCm !== '') attributes.height_cm = Number(heightCm);
  if (widthCm != null && widthCm !== '') attributes.width_cm = Number(widthCm);
  if (lengthCm != null && lengthCm !== '') attributes.length_cm = Number(lengthCm);

  const taxonomy = item.taxonomy || [];
  const payload = {
    attributes,
    category_leaf_id: taxonomy[taxonomy.length - 1]?.id,
    apply_discount: false,
    location: {
      latitude: item.location.latitude,
      longitude: item.location.longitude,
      approximated: item.location.approximated || false,
    },
    upload_id: generateUploadId(),
  };

  // Delivery is always present. Mirror the item's shipping setting.
  if (item.shipping?.user_allows_shipping) {
    // Weight bracket comes from the item (type_attributes.up_to_kg).
    const upToKg = item.type_attributes?.up_to_kg?.value;
    payload.delivery = {
      allowed_by_user: true,
      max_weight_kg: upToKg != null && upToKg !== '' ? Number(upToKg) : 10,
      cost_configuration_id: item.shipping.cost_configuration_id || SHIPPING_COST_CONFIG.BUYER_PAYS,
    };
  } else {
    payload.delivery = {
      allowed_by_user: false,
      max_weight_kg: null,
      cost_configuration_id: null,
    };
  }

  return payload;
}

async function relistItem(slug, tokenFromPage) {
  log(`relistItem: START slug=${slug}`);
  const headers = await getAuthHeaders(tokenFromPage);

  const itemId = await resolveItemId(slug, headers);

  const itemDetails = await getItemDetails(itemId, headers);

  const imageUrls = (itemDetails.images || []).map(img => img.urls.big);
  const imageBlobs = await Promise.all(imageUrls.map(url => downloadImage(url)));

  // Create first: if it throws, the original is still live.
  const createPayload = buildCreatePayload(itemDetails);
  const newItem = await createItem(createPayload, imageBlobs, headers);

  // Delete the original only after a confirmed create. A failure here just
  // leaves a duplicate, which is safe.
  try {
    await deleteItem(itemId, headers);
  } catch (e) {
    logError('deleting original failed — you may have a duplicate listing', e);
  }

  log('relistItem: DONE', newItem);
  return newItem;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'relist') {
    log('onMessage: relist requested', { slug: message.slug, hasToken: !!message.accessToken });
    relistItem(message.slug, message.accessToken)
      .then(result => sendResponse({ success: true, newItem: result }))
      .catch(error => {
        logError('relistItem threw:', error, error?.stack);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});
