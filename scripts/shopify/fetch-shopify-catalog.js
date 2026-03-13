const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_API_VERSION = '2025-01';
const PRODUCTS_PAGE_SIZE = 50;
const VARIANTS_PAGE_SIZE = 100;

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const values = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    values[key] = value;
  }
  return values;
}

function readShopifyConfig() {
  const root = path.resolve(__dirname, '..', '..');
  const envPrimary = parseEnvFile(path.join(root, 'supabase', '.env'));
  const envFallback = parseEnvFile(path.join(root, 'supabase', 'mn+la.env'));
  const env = { ...envFallback, ...envPrimary, ...process.env };

  const storeDomain = env.SHOPIFY_STORE_DOMAIN;
  const adminAccessToken = env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  const apiVersion = env.SHOPIFY_API_VERSION || DEFAULT_API_VERSION;

  if (!storeDomain || !adminAccessToken) {
    throw new Error(
      'Missing Shopify config. Require SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN.'
    );
  }

  return { storeDomain, adminAccessToken, apiVersion };
}

async function shopifyGraphQLRequest({ endpoint, token, query, variables }) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Shopify request failed (${response.status}): ${text.slice(0, 500)}`);
  }

  const json = await response.json();
  if (json.errors && json.errors.length) {
    throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

function normalizeText(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function normalizePrice(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const num = Number.parseFloat(text);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100) / 100;
}

function normalizeStatus(value) {
  const text = normalizeText(value);
  return text ? text.toLowerCase() : null;
}

function normalizeOptions(selectedOptions) {
  const options = Array.isArray(selectedOptions) ? selectedOptions : [];
  const mapped = options
    .map((opt) => ({
      name: normalizeText(opt?.name),
      value: normalizeText(opt?.value),
    }))
    .filter((opt) => opt.name || opt.value);

  return {
    option1: mapped[0]?.value || null,
    option2: mapped[1]?.value || null,
    option3: mapped[2]?.value || null,
    options_json: mapped,
  };
}

function normalizeProduct(product) {
  return {
    shopify_product_id: normalizeText(product?.id),
    title: normalizeText(product?.title),
    handle: normalizeText(product?.handle),
    status: normalizeStatus(product?.status),
    image_url: normalizeText(product?.featuredImage?.url),
    vendor: normalizeText(product?.vendor),
    product_type: normalizeText(product?.productType),
    tags: Array.isArray(product?.tags) ? product.tags.map((t) => normalizeText(t)).filter(Boolean) : [],
    published_at: normalizeText(product?.publishedAt),
    shopify_created_at: normalizeText(product?.createdAt),
    shopify_updated_at: normalizeText(product?.updatedAt),
    is_archived: normalizeStatus(product?.status) === 'archived',
  };
}

function normalizeVariant(variant, product) {
  const options = normalizeOptions(variant?.selectedOptions);
  return {
    shopify_variant_id: normalizeText(variant?.id),
    shopify_product_id: normalizeText(product?.id),
    inventory_item_id: normalizeText(variant?.inventoryItem?.id),
    title: normalizeText(variant?.title),
    option1: options.option1,
    option2: options.option2,
    option3: options.option3,
    options_json: options.options_json,
    sku: normalizeText(variant?.sku),
    barcode: normalizeText(variant?.barcode),
    price: normalizePrice(variant?.price),
    compare_at_price: normalizePrice(variant?.compareAtPrice),
    position: Number.isInteger(variant?.position) ? variant.position : null,
    shopify_created_at: normalizeText(variant?.createdAt),
    shopify_updated_at: normalizeText(variant?.updatedAt),
    parent_status: normalizeStatus(product?.status),
    parent_title: normalizeText(product?.title),
    parent_handle: normalizeText(product?.handle),
  };
}

const PRODUCTS_QUERY = `
query FetchProducts($pageSize: Int!, $after: String) {
  products(first: $pageSize, after: $after, sortKey: UPDATED_AT) {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        id
        title
        handle
        status
        vendor
        productType
        tags
        publishedAt
        createdAt
        updatedAt
        featuredImage { url }
        variants(first: 250) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              title
              sku
              barcode
              price
              compareAtPrice
              position
              createdAt
              updatedAt
              selectedOptions { name value }
              inventoryItem { id }
            }
          }
        }
      }
    }
  }
}`;

const PRODUCT_VARIANTS_QUERY = `
query FetchProductVariants($productId: ID!, $pageSize: Int!, $after: String) {
  product(id: $productId) {
    id
    variants(first: $pageSize, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          sku
          barcode
          price
          compareAtPrice
          position
          createdAt
          updatedAt
          selectedOptions { name value }
          inventoryItem { id }
        }
      }
    }
  }
}`;

async function fetchAllVariantsForProduct({ endpoint, token, productId }) {
  let hasNextPage = true;
  let after = null;
  const variants = [];

  while (hasNextPage) {
    const data = await shopifyGraphQLRequest({
      endpoint,
      token,
      query: PRODUCT_VARIANTS_QUERY,
      variables: { productId, pageSize: VARIANTS_PAGE_SIZE, after },
    });

    const connection = data?.product?.variants;
    const edges = connection?.edges || [];
    for (const edge of edges) variants.push(edge.node);

    hasNextPage = Boolean(connection?.pageInfo?.hasNextPage);
    after = connection?.pageInfo?.endCursor || null;
  }

  return variants;
}

async function fetchShopifyCatalog() {
  const cfg = readShopifyConfig();
  const endpoint = `https://${cfg.storeDomain}/admin/api/${cfg.apiVersion}/graphql.json`;

  let hasNextPage = true;
  let after = null;

  const rawProducts = [];
  const rawVariants = [];

  while (hasNextPage) {
    const data = await shopifyGraphQLRequest({
      endpoint,
      token: cfg.adminAccessToken,
      query: PRODUCTS_QUERY,
      variables: { pageSize: PRODUCTS_PAGE_SIZE, after },
    });

    const connection = data?.products;
    const edges = connection?.edges || [];
    for (const edge of edges) {
      const product = edge.node;
      rawProducts.push(product);

      const initialVariants = (product?.variants?.edges || []).map((e) => e.node);
      if (product?.variants?.pageInfo?.hasNextPage) {
        const fullVariants = await fetchAllVariantsForProduct({
          endpoint,
          token: cfg.adminAccessToken,
          productId: product.id,
        });
        for (const variant of fullVariants) rawVariants.push({ product, variant });
      } else {
        for (const variant of initialVariants) rawVariants.push({ product, variant });
      }
    }

    hasNextPage = Boolean(connection?.pageInfo?.hasNextPage);
    after = connection?.pageInfo?.endCursor || null;
  }

  return {
    fetched_at: new Date().toISOString(),
    config: { store_domain: cfg.storeDomain, api_version: cfg.apiVersion },
    normalized: {
      products: rawProducts.map(normalizeProduct),
      variants: rawVariants.map((item) => normalizeVariant(item.variant, item.product)),
    },
  };
}

module.exports = {
  readShopifyConfig,
  shopifyGraphQLRequest,
  fetchShopifyCatalog,
};
