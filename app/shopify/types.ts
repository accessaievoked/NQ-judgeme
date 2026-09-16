export interface ShopifyMoney {
  amount: string;
  currencyCode: string;
}

export interface ShopifyProductVariantNode {
  id: string;
  title: string;
  sku: string | null;
  price: string;
}

export interface ShopifyProductNode {
  id: string;
  title: string;
  handle: string;
  status: string;
  vendor: string;
  productType: string;
  featuredImage: { url: string } | null;
  variants: {
    edges: Array<{ node: ShopifyProductVariantNode }>;
  };
}

export interface ShopifyProductsPage {
  products: {
    edges: Array<{ cursor: string; node: ShopifyProductNode }>;
    pageInfo: { hasNextPage: boolean };
  };
}

export interface ShopifyOrderCustomerNode {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}

export interface ShopifyOrderLineItemNode {
  id: string;
  title: string;
  quantity: number;
  product: { id: string } | null;
  variant: { id: string } | null;
}

export interface ShopifyOrderNode {
  id: string;
  name: string;
  email: string | null;
  processedAt: string | null;
  cancelledAt: string | null;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string | null;
  currentTotalPriceSet: { shopMoney: ShopifyMoney };
  customer: ShopifyOrderCustomerNode | null;
  lineItems: {
    edges: Array<{ node: ShopifyOrderLineItemNode }>;
  };
}

export interface ShopifyOrdersPage {
  orders: {
    edges: Array<{ cursor: string; node: ShopifyOrderNode }>;
    pageInfo: { hasNextPage: boolean };
  };
}
