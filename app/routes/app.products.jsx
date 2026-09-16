// app/routes/app.products.jsx
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { domain: session.shop } });

  if (!shop) {
    return { products: [] };
  }

  const products = await db.product.findMany({
    where: { shopId: shop.id },
    orderBy: { title: "asc" },
    include: { _count: { select: { variants: true } } },
  });

  return {
    products: products.map((product) => ({
      id: product.id,
      shopifyId: product.shopifyId,
      title: product.title,
      imageUrl: product.imageUrl,
      status: product.status,
      variantCount: product._count.variants,
    })),
  };
};

export default function Products() {
  const { products } = useLoaderData();

  return (
    <s-page heading="Products">
      <s-section heading={`${products.length} product${products.length === 1 ? "" : "s"}`}>
        {products.length === 0 ? (
          <s-paragraph>
            No products synced yet. Products show up here once your catalog
            sync finishes — check the dashboard for sync status.
          </s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Product</s-table-header>
              <s-table-header listSlot="secondary">Status</s-table-header>
              <s-table-header listSlot="secondary">Variants</s-table-header>
              <s-table-header listSlot="secondary">Reviews</s-table-header>
              <s-table-header listSlot="secondary">Rating</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {products.map((product) => (
                <s-table-row key={product.id}>
                  <s-table-cell>
                    <s-stack direction="inline" gap="tight">
                      {product.imageUrl ? (
                        <s-thumbnail src={product.imageUrl} alt={product.title} size="small" />
                      ) : null}
                      <s-link href={`/app/products/${product.id}`}>
                        {product.title}
                      </s-link>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>{product.status ?? "—"}</s-table-cell>
                  <s-table-cell>{product.variantCount}</s-table-cell>
                  <s-table-cell>0</s-table-cell>
                  <s-table-cell>—</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
